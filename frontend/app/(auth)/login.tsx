import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { authAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, Radius } from '@/lib/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('提示', '请填写用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.login({ username: username.trim(), password });
      const { token, user } = res.data.data;
      await setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? '登录失败，请重试';
      Alert.alert('登录失败', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Brand Mark */}
      <View style={styles.brand}>
        <Text style={styles.brandChar}>象</Text>
        <Text style={styles.brandName}>大象账本</Text>
        <Text style={styles.brandSub}>mammoth · the witness</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <View style={styles.inputWrap}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="请输入用户名"
            placeholderTextColor={Colors.inkLight}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>密码</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="请输入密码"
            placeholderTextColor={Colors.inkLight}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={Colors.creamLight} />
            : <Text style={styles.btnText}>登 录</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          style={styles.switchRow}
        >
          <Text style={styles.switchText}>还没有账号？</Text>
          <Text style={styles.switchLink}>立即注册</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing.section,
  },
  brandChar: {
    fontSize: 80,
    color: Colors.ink,
    fontWeight: '300',
    lineHeight: 90,
  },
  brandName: {
    fontSize: Typography.lg,
    color: Colors.ink,
    letterSpacing: 6,
    fontWeight: Typography.medium,
    marginTop: Spacing.sm,
  },
  brandSub: {
    fontSize: Typography.xs,
    color: Colors.inkLight,
    letterSpacing: 3,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  form: {
    gap: Spacing.md,
  },
  inputWrap: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.sm,
    color: Colors.inkMid,
    fontWeight: Typography.medium,
    letterSpacing: 0.3,
  },
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
    gap: 4,
  },
  switchText: { fontSize: Typography.sm, color: Colors.inkMid },
  switchLink: { fontSize: Typography.sm, color: Colors.accent, fontWeight: Typography.medium },
});
