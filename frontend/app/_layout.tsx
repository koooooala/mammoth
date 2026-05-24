import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Typography, Spacing, Fonts } from '@/lib/theme';
import { useFonts } from 'expo-font';
import {
  NotoSansSC_300Light,
  NotoSansSC_400Regular,
  NotoSansSC_500Medium,
} from '@expo-google-fonts/noto-sans-sc';
import {
  NotoSerifSC_300Light,
  NotoSerifSC_400Regular,
  NotoSerifSC_500Medium,
} from '@expo-google-fonts/noto-serif-sc';
import * as SplashScreen from 'expo-splash-screen';

try { SplashScreen.preventAutoHideAsync(); } catch (_) {}

// ── 大象登场启动页 ──────────────────────────────────────────────
function MammothSplash({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(markScale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => onDone());
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity }]}>
      <StatusBar style="light" backgroundColor={Colors.darkPaper} />
      <Animated.Text style={[styles.splashMark, { transform: [{ scale: markScale }] }]}>
        象
      </Animated.Text>
      <View style={styles.splashSloganRow}>
        <Text style={styles.splashSlogan}>让 记 得，</Text>
        <Text style={[styles.splashSlogan, { color: Colors.accent }]}>被 看 见</Text>
      </View>
      <Text style={styles.splashSig}>MAMMOTH · 2026</Text>
    </Animated.View>
  );
}

// ── 导航守卫 ────────────────────────────────────────────────────
function AuthGate() {
  const { token, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [token, isLoading, segments, navigationState?.key]);

  return null;
}

// ── Root Layout ─────────────────────────────────────────────────
export default function RootLayout() {
  const { loadFromStorage } = useAuthStore();
  const [fontsLoaded, fontError] = useFonts({
    NotoSansSC_300Light,
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    NotoSerifSC_300Light,
    NotoSerifSC_400Regular,
    NotoSerifSC_500Medium,
  });
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => { loadFromStorage(); }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (showSplash) {
    return <MammothSplash onDone={() => setShowSplash(false)} />;
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={Colors.cream} />
      <Stack screenOptions={{ headerShown: false }} />
      <AuthGate />
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.darkPaper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  splashMark: {
    fontSize: 96,
    color: Colors.darkInk,
    fontFamily: Fonts.serif,
    letterSpacing: 8,
    marginBottom: Spacing.md,
  },
  splashSloganRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  splashSlogan: {
    fontSize: Typography.md,
    color: Colors.darkInk,
    fontFamily: Fonts.serif,
    letterSpacing: 6,
  },
  splashSig: {
    fontSize: Typography.xs,
    color: Colors.darkInkMid,
    letterSpacing: 4,
    marginTop: Spacing.xl,
    fontFamily: Fonts.serif,
  },
});
