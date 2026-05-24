import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { aiAPI, BASE_URL } from '@/lib/api';
import { useBookStore } from '@/store/bookStore';
import { useAuthStore } from '@/store/authStore';
import { useStagingStore } from '@/store/stagingStore';
import { Colors, Typography, Spacing, Radius, Fonts } from '@/lib/theme';

// 波形条高度序列（模拟原型）
const WAVEFORM_HEIGHTS = [12, 28, 18, 42, 30, 55, 22, 36, 18, 44, 30, 20, 38, 26, 14];

const WAV_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
  isMeteringEnabled: true,
};

export default function InputScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // 录音状态
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // 录音覆盖层是否显示
  const [showRecOverlay, setShowRecOverlay] = useState(false);
  // 逐字显示的文本
  const [displayText, setDisplayText] = useState('');
  const [fullTranscript, setFullTranscript] = useState('');
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expandAnim = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  // 波形动画值
  const waveAnims = useRef(WAVEFORM_HEIGHTS.map(() => new Animated.Value(0.3))).current;

  const { currentBookId, books } = useBookStore();
  const { token } = useAuthStore();
  const { setItems } = useStagingStore();
  const currentBook = books.find(b => b.id === currentBookId);

  // 页面加载时设置音频模式
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    }).catch(() => {});
  }, []);

  // 输入框展开动画
  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: expanded ? 1 : 0,
      friction: 8, tension: 80, useNativeDriver: false,
    }).start();
  }, [expanded]);

  const inputHeight = expandAnim.interpolate({
    inputRange: [0, 1], outputRange: [48, 180],
  });

  // 覆盖层出现 + 录音中 → 启动波形；消失或停止 → 停止波形
  useEffect(() => {
    if (showRecOverlay && isRecording) {
      startWave();
    } else {
      stopWave();
    }
  }, [showRecOverlay, isRecording]);
  const showOverlay = () => {
    setShowRecOverlay(true);
    Animated.timing(overlayOpacity, {
      toValue: 1, duration: 250, useNativeDriver: true,
    }).start();
  };

  const hideOverlay = () => {
    Animated.timing(overlayOpacity, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(() => setShowRecOverlay(false));
  };

  // 波形动画
  const startWave = () => {
    waveAnims.forEach((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1, duration: 300 + i * 60,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2, duration: 300 + i * 60,
            useNativeDriver: true,
          }),
        ])
      );
      setTimeout(() => loop.start(), i * 40);
    });
  };

  const stopWave = () => {
    waveAnims.forEach(anim => {
      anim.stopAnimation();
      Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }).start();
    });
  };

  // 逐字打字效果
  const typeText = (text: string) => {
    setDisplayText('');
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
        typeTimerRef.current = setTimeout(tick, 55);
      }
    };
    tick();
  };

  // 开始录音
  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('权限不足', '请在设置中允许访问麦克风'); return; }
      const { recording: rec } = await Audio.Recording.createAsync(
        WAV_RECORDING_OPTIONS
      );
      setRecording(rec);
      setIsRecording(true);
      setDisplayText('');
      setFullTranscript('');
      showOverlay();
      // 波形动画由 useEffect 监听 showRecOverlay+isRecording 自动启动
    } catch (e) {
      Alert.alert('录音启动失败', String(e));
    }
  };

  // 停止录音 → 流式 ASR
  const stopAndTranscribe = async () => {
    if (!recording) return;
    stopWave();
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) { hideOverlay(); return; }

      setTranscribing(true);

      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/wav', name: 'recording.wav' } as any);
      formData.append('book_id', currentBookId ?? '');

      const res = await fetch(`${BASE_URL}/api/ai/parse-voice-stream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || '识别失败');
      }

      let finalText = '';
      const handleEvent = (evt: any) => {
        if (evt?.type === 'partial' && evt.text) {
          setDisplayText(String(evt.text));
          return;
        }
        if (evt?.type === 'final') {
          finalText = String(evt.transcribed_text ?? '');
          return;
        }
        if (evt?.type === 'error') {
          throw new Error(String(evt.message || '语音识别失败'));
        }
      };

      // React Native 某些环境下 fetch 不提供 ReadableStream，降级为一次性读取 NDJSON。
      if (res.body && typeof (res.body as any).getReader === 'function') {
        const reader = (res.body as any).getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx = buffer.indexOf('\n');
          while (idx >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (line) {
              handleEvent(JSON.parse(line));
            }
            idx = buffer.indexOf('\n');
          }
        }

        const tail = buffer.trim();
        if (tail) {
          handleEvent(JSON.parse(tail));
        }
      } else {
        const txt = await res.text();
        const lines = txt
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const line of lines) {
          try {
            handleEvent(JSON.parse(line));
          } catch {
            // 忽略非 JSON 行，避免把服务端日志片段当成失败。
          }
        }
      }
      if (!finalText.trim()) {
        throw new Error('未收到最终识别文本');
      }

      setFullTranscript(finalText);
      setDisplayText(finalText);
      setTranscribing(false);

      setTimeout(() => {
        hideOverlay();
        setText(finalText);
        setExpanded(true);
        setDisplayText('');
        setFullTranscript('');
      }, 1200);

    } catch (err: any) {
      setTranscribing(false);
      hideOverlay();
      Alert.alert('语音识别失败', err.message ?? '请使用16kHz单声道WAV后重试，或改用文字输入');
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopAndTranscribe();
    else startRecording();
  };

  // 解析
  const handleParse = async () => {
    if (!text.trim() || !currentBookId) {
      if (!currentBookId) Alert.alert('提示', '请先在账本页选择账本');
      return;
    }
    setLoading(true);
    try {
      const res = await aiAPI.parse(currentBookId, text.trim());
      const items = res.data.data?.staged_items ?? [];
      if (items.length === 0) { Alert.alert('解析为空', '请换一种描述方式'); return; }
      setItems(items, currentBookId);
      setText('');
      setExpanded(false);
      router.push('/(tabs)/staging');
    } catch (err: any) {
      Alert.alert('解析失败', err.response?.data?.message ?? 'AI 服务暂时不可用');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Wordmark ──────────────────────────────────────── */}
      <View style={styles.topbar}>
        <Text style={styles.wordmarkCn}>大 象</Text>
        <Text style={styles.wordmarkEn}>mammoth · the witness</Text>
        {currentBook && <Text style={styles.bookLabel}>{currentBook.name}</Text>}
      </View>

      {/* ── 中央录音按钮（靠下） ─────────────────────────── */}
      <View style={styles.center}>
        <View style={styles.recArea}>
          <Pressable onPress={toggleRecording} disabled={loading || transcribing}>
            <View style={[styles.recBtn, isRecording && styles.recBtnActive]}>
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={32}
                color={isRecording ? Colors.white : Colors.ink}
              />
            </View>
          </Pressable>
          <Text style={styles.recHint}>
            {transcribing ? '识 别 中 …' : isRecording ? '录 制 中 …  再按停止' : '点 击 录 音'}
          </Text>
        </View>
      </View>

      {/* ── 底部输入栏 ────────────────────────────────────── */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.inputRow}>
          <Animated.View style={[styles.inputWrap, { height: inputHeight }]}>
            <TextInput
              style={[styles.textInput, expanded && styles.textInputExpanded]}
              value={text}
              onChangeText={setText}
              onFocus={() => setExpanded(true)}
              placeholder={expanded ? '用自然语言描述今天发生的事…' : '或者直接打字…'}
              placeholderTextColor={Colors.inkLight}
              multiline={expanded}
              textAlignVertical={expanded ? 'top' : 'center'}
              autoCorrect={false}
            />
            {expanded && text.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => { setText(''); setExpanded(false); }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.inkLight} />
              </TouchableOpacity>
            )}
          </Animated.View>
          <TouchableOpacity
            style={[styles.parseBtn, (!text.trim() || loading) && styles.parseBtnDim]}
            onPress={handleParse}
            disabled={!text.trim() || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={Colors.cream} size="small" />
              : <Text style={styles.parseBtnText}>解 析</Text>
            }
          </TouchableOpacity>
        </View>
        {expanded && (
          <TouchableOpacity style={styles.collapseHint} onPress={() => setExpanded(false)}>
            <Text style={styles.collapseText}>收起</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 全屏录音覆盖层 ────────────────────────────────── */}
      {showRecOverlay && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>

          {/* 顶部状态 */}
          <View style={styles.recTopbar}>
            <View style={styles.recDot} />
            <Text style={styles.recStatus}>
              {transcribing ? '在 处 理 ……' : '在 听 ……'}
            </Text>
          </View>

          {/* 中央：波形 或 识别文本 */}
          <View style={styles.recCenter}>
            {isRecording && !transcribing ? (
              // 录音中显示波形
              <View style={styles.waveform}>
                {WAVEFORM_HEIGHTS.map((h, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        height: h,
                        transform: [{ scaleY: waveAnims[i] }],
                      },
                    ]}
                  />
                ))}
              </View>
            ) : (
              // 识别完成显示文字
              <View style={styles.transcriptWrap}>
                <Text style={styles.transcriptText}>
                  {displayText}
                  {transcribing && <Text style={styles.transcriptCursor}>｜</Text>}
                </Text>
              </View>
            )}
          </View>

          {/* 底部：停止按钮 */}
          <View style={[styles.recBottom, { paddingBottom: insets.bottom + Spacing.xl }]}>
            {isRecording ? (
              <>
                <TouchableOpacity style={styles.stopBtn} onPress={stopAndTranscribe}>
                  <View style={styles.stopIcon} />
                </TouchableOpacity>
                <Text style={styles.recBottomHint}>点 击 结 束</Text>
              </>
            ) : (
              <ActivityIndicator color={Colors.inkMid} />
            )}
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },

  // wordmark
  topbar: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: 4 },
  wordmarkCn: { fontSize: Typography.xl, color: Colors.ink, fontFamily: Fonts.serif, letterSpacing: 10 },
  wordmarkEn: { fontSize: Typography.xs, color: Colors.inkMid, fontFamily: Fonts.serif, letterSpacing: 3 },
  bookLabel: {
    marginTop: Spacing.sm, fontSize: Typography.xs, color: Colors.inkMid,
    letterSpacing: 2, fontFamily: Fonts.sans,
    borderBottomWidth: 0.5, borderBottomColor: Colors.inkLight, paddingBottom: 2,
  },

  // center — 靠下布局
  center: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: Spacing.xxl },
  recArea: { alignItems: 'center', gap: Spacing.lg },
  recBtn: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.creamDeep,
    borderWidth: 1, borderColor: Colors.borderMid,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.ink, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 12, elevation: 4,
  },
  recBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  recHint: { fontSize: Typography.xs, color: Colors.inkMid, letterSpacing: 3, fontFamily: Fonts.sans },

  // bottom input
  bottom: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  inputWrap: {
    flex: 1, backgroundColor: Colors.creamLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.borderMid,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, justifyContent: 'center',
  },
  textInput: { fontSize: Typography.sm, color: Colors.ink, fontFamily: Fonts.sans, lineHeight: 20 },
  textInputExpanded: { flex: 1, paddingTop: 4 },
  clearBtn: { position: 'absolute', top: Spacing.sm, right: Spacing.sm },
  parseBtn: {
    height: 48, paddingHorizontal: Spacing.lg, backgroundColor: Colors.ink,
    borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center',
  },
  parseBtnDim: { opacity: 0.35 },
  parseBtnText: { fontSize: Typography.sm, color: Colors.cream, letterSpacing: 3, fontFamily: Fonts.sans },
  collapseHint: { alignSelf: 'center', paddingVertical: Spacing.xs },
  collapseText: { fontSize: Typography.xs, color: Colors.inkLight, letterSpacing: 1, fontFamily: Fonts.sans },

  // 全屏录音覆盖层
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.cream,
    zIndex: 30,
    flexDirection: 'column',
  },

  // 顶部状态栏
  recTopbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: Spacing.sm,
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  recStatus: {
    fontSize: 12, color: Colors.inkMid, fontFamily: Fonts.sans, letterSpacing: 4,
  },

  // 中央内容
  recCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },

  // 波形
  waveform: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 80,
  },
  waveBar: {
    width: 3, borderRadius: 2,
    backgroundColor: Colors.ink,
  },

  // 识别文字
  transcriptWrap: { width: '100%', alignItems: 'center' },
  transcriptText: {
    fontSize: 19, color: Colors.ink, fontFamily: Fonts.sansRegular,
    lineHeight: 32, textAlign: 'center', letterSpacing: 0.5,
  },
  transcriptCursor: {
    color: Colors.accent, fontFamily: Fonts.sans,
  },

  // 底部停止按钮
  recBottom: {
    alignItems: 'center', gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  stopBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  stopIcon: {
    width: 24, height: 24, borderRadius: 3,
    backgroundColor: Colors.white,
  },
  recBottomHint: {
    fontSize: 11, color: Colors.inkMid, fontFamily: Fonts.sans, letterSpacing: 4,
  },
});
