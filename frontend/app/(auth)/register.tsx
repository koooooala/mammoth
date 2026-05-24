import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, Radius } from '@/lib/theme';

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleRegister = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('提示', '请填写用户名和密码');
      return;
    }
    if (password !== confirm) {
      Alert.alert('提示', '两次密码输入不一致');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username.trim())) {
      Alert.alert('提示', '用户名只能包含字母、数字、下划线（2-20位）');
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.register({
        username: username.trim(),
        password,
        nickname: nickname.trim() || username.trim(),
      });
      const { token, user } = res.data.data;
      await setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? '注册失败，请重试';
      Alert.alert('注册失败', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.cream }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ 返回</Text>
          </TouchableOpacity>
          <Text style={styles.title}>创建账号</Text>
          <Text style={styles.subtitle}>加入大象账本，开始协作记账</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {[
            { label: '用户名', value: username, set: setUsername, placeholder: '字母/数字/下划线，2-20位', secure: false },
            { label: '昵称（可选）', value: nickname, set: setNickname, placeholder: '默认与用户名相同', secure: false },
            { label: '密码', value: password, set: setPassword, placeholder: '请设置密码', secure: true },
            { label: '确认密码', value: confirm, set: setConfirm, placeholder: '再次输入密码', secure: true },
          ].map((f) => (
            <View key={f.label} style={styles.inputWrap}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={f.value}
                onChangeText={f.set}
                placeholder={f.placeholder}
                placeholderTextColor={Colors.inkLight}
                secureTextEntry={f.secure}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={Colors.creamLight} />
              : <Text style={styles.btnText}>注 册</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xxl,
  },
  header: { marginBottom: Spacing.xl },
  backBtn: { marginBottom: Spacing.lg },
  backText: { fontSize: Typography.base, color: Colors.inkMid },
  title: { fontSize: Typography.xxl, color: Colors.ink, fontWeight: Typography.bold },
  subtitle: { fontSize: Typography.sm, color: Colors.inkMid, marginTop: Spacing.xs },
  form: { gap: Spacing.md },
  inputWrap: { gap: Spacing.xs },
  label: { fontSize: Typography.sm, color: Colors.inkMid, fontWeight: Typography.medium },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.base,
    color: Colors.ink,
    backgroundColor: Colors.creamLight,
  },
  btn: {
    height: 52,
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: Colors.creamLight,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    letterSpacing: 2,
  },
});
