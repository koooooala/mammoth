import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { invitationsAPI, booksAPI, usersAPI, Invitation } from '@/lib/api';
import { useBookStore } from '@/store/bookStore';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, Radius, Fonts } from '@/lib/theme';

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, logout, setAuth } = useAuthStore();
  const { setBooks } = useBookStore();

  // 消息
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  // 修改资料
  const [showEdit, setShowEdit] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invitationsAPI.list(activeTab === 'pending' ? 'pending' : undefined);
      setInvitations(res.data.data ?? []);
    } catch {} finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  };

  const respond = async (inv: Invitation, action: 'accepted' | 'rejected') => {
    setResponding(inv.id);
    try {
      await invitationsAPI.respond(inv.id, action);
      if (action === 'accepted') {
        const booksRes = await booksAPI.list();
        setBooks(booksRes.data.data ?? []);
        Alert.alert('✅ 已加入', `已成功加入账本「${inv.book_name}」`);
      }
      await loadInvitations();
    } catch (err: any) {
      Alert.alert('操作失败', err.response?.data?.message ?? '请重试');
    } finally { setResponding(null); }
  };

  const handleSaveProfile = async () => {
    if (!newNickname.trim() && !newPassword.trim()) return;
    setSaving(true);
    try {
      const payload: { nickname?: string; password?: string } = {};
      if (newNickname.trim()) payload.nickname = newNickname.trim();
      if (newPassword.trim()) payload.password = newPassword.trim();
      const res = await usersAPI.updateProfile(payload);
      const updated = res.data.data;
      if (token) await setAuth(token, { id: updated.id, username: updated.username, nickname: updated.nickname });
      Alert.alert('✅ 已保存');
      setNewNickname(''); setNewPassword(''); setShowEdit(false);
    } catch (e: any) {
      Alert.alert('保存失败', e.response?.data?.message ?? '请重试');
    } finally { setSaving(false); }
  };

  const pendingCount = invitations.filter(i => i.status === 'pending').length;
  const avatarLetter = (user?.nickname ?? user?.username ?? '?').charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.inkMid} />}
      >
        {/* ── 个人资料区 ────────────────────────────────────── */}
        <View style={styles.profile}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.nickname}>{user?.nickname ?? user?.username}</Text>
            <Text style={styles.username}>@{user?.username}</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => { setNewNickname(user?.nickname ?? ''); setShowEdit(true); }}
          >
            <Ionicons name="pencil-outline" size={16} color={Colors.inkMid} />
            <Text style={styles.editBtnText}>编辑</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* ── 消息区 ───────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>邀请消息</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>

        {/* 消息 tab 切换 */}
        <View style={styles.tabs}>
          {(['pending', 'all'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'pending' ? '待处理' : '全部'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={Colors.inkMid} style={{ marginTop: 40 }} />
        ) : invitations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyText}>暂无消息</Text>
            <Text style={styles.emptyHint}>
              {activeTab === 'pending' ? '没有待处理的邀请' : '还没有收到任何邀请'}
            </Text>
          </View>
        ) : (
          <View style={styles.invList}>
            {invitations.map(inv => (
              <View key={inv.id} style={styles.invCard}>
                <View style={styles.invHeader}>
                  <View style={styles.invIcon}>
                    <Ionicons name="book" size={16} color={Colors.inkMid} />
                  </View>
                  <View style={styles.invInfo}>
                    <Text style={styles.bookName}>{inv.book_name}</Text>
                    <Text style={styles.inviterText}>
                      来自 {inv.inviter.nickname}（{inv.inviter.username}）
                    </Text>
                    <Text style={styles.invTime}>
                      {new Date(inv.created_at).toLocaleDateString('zh-CN')}
                    </Text>
                  </View>
                  <StatusBadge status={inv.status} />
                </View>
                {inv.status === 'pending' && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => respond(inv, 'rejected')}
                      disabled={responding === inv.id}
                    >
                      {responding === inv.id
                        ? <ActivityIndicator color={Colors.inkMid} size="small" />
                        : <Text style={styles.rejectText}>拒绝</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={() => respond(inv, 'accepted')}
                      disabled={responding === inv.id}
                    >
                      {responding === inv.id
                        ? <ActivityIndicator color={Colors.cream} size="small" />
                        : <Text style={styles.acceptText}>接受邀请</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── 退出登录 ─────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.logoutRow}
          onPress={() => Alert.alert('退出登录', `当前账号：${user?.nickname ?? user?.username}`, [
            { text: '取消' },
            { text: '退出', style: 'destructive', onPress: logout },
          ])}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.accent} />
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 编辑资料 Modal ───────────────────────────────── */}
      <Modal visible={showEdit} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>编辑资料</Text>
            <Text style={styles.sheetSub}>用户名（不可修改）</Text>
            <Text style={styles.sheetUsername}>{user?.username}</Text>

            <Text style={[styles.sheetSub, { marginTop: Spacing.md }]}>修改昵称</Text>
            <TextInput
              style={styles.input}
              value={newNickname}
              onChangeText={setNewNickname}
              placeholder="新昵称"
              placeholderTextColor="#999"
            />

            <Text style={[styles.sheetSub, { marginTop: Spacing.sm }]}>修改密码（不填则不改）</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="新密码"
              placeholderTextColor="#999"
              secureTextEntry
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setShowEdit(false); setNewNickname(''); setNewPassword(''); }}>
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSave, saving && { opacity: 0.5 }]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={styles.btnSaveText}>{saving ? '保存中…' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    pending:  { label: '待确认', bg: Colors.warningBg,  color: Colors.warning },
    accepted: { label: '已接受', bg: Colors.successBg,  color: Colors.success },
    rejected: { label: '已拒绝', bg: Colors.creamMid,   color: Colors.inkMid  },
  }[status] ?? { label: status, bg: Colors.creamMid, color: Colors.inkMid };

  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },

  // 个人资料
  profile: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  avatarWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.cream, fontSize: Typography.xl, fontFamily: Fonts.serifMedium },
  profileInfo: { flex: 1, gap: 4 },
  nickname: { fontSize: Typography.md, color: Colors.ink, fontFamily: Fonts.sansRegular },
  username: { fontSize: Typography.sm, color: Colors.inkMid, fontFamily: Fonts.sans },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.borderMid,
  },
  editBtnText: { fontSize: Typography.xs, color: Colors.inkMid, fontFamily: Fonts.sans },

  divider: { height: 0.5, backgroundColor: Colors.border, marginHorizontal: Spacing.base },

  // 消息区
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: Typography.base, color: Colors.ink, fontFamily: Fonts.sansRegular },
  badge: {
    width: 18, height: 18, borderRadius: Radius.full,
    backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { fontSize: 10, color: Colors.white, fontFamily: Fonts.sans },

  tabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  tabText: { fontSize: Typography.sm, color: Colors.inkMid, fontFamily: Fonts.sans },
  tabTextActive: { color: Colors.cream },

  invList: { paddingHorizontal: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.md },
  invCard: {
    backgroundColor: Colors.creamLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  invHeader: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  invIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.creamMid, justifyContent: 'center', alignItems: 'center',
  },
  invInfo: { flex: 1 },
  bookName: { fontSize: Typography.base, color: Colors.ink, fontFamily: Fonts.sansRegular },
  inviterText: { fontSize: Typography.sm, color: Colors.inkMid, fontFamily: Fonts.sans, marginTop: 2 },
  invTime: { fontSize: Typography.xs, color: Colors.inkLight, fontFamily: Fonts.sans, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: Typography.xs, fontFamily: Fonts.sans },

  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  rejectBtn: { borderWidth: 1, borderColor: Colors.borderMid },
  rejectText: { fontSize: Typography.sm, color: Colors.inkMid, fontFamily: Fonts.sans },
  acceptBtn: { backgroundColor: Colors.ink },
  acceptText: { fontSize: Typography.sm, color: Colors.cream, fontFamily: Fonts.sansRegular },

  // 退出
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  logoutText: { fontSize: Typography.base, color: Colors.accent, fontFamily: Fonts.sans },

  // 空状态
  empty: { alignItems: 'center', paddingTop: 40, gap: Spacing.sm, paddingBottom: Spacing.xl },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: Typography.base, color: Colors.inkMid, fontFamily: Fonts.sans },
  emptyHint: { fontSize: Typography.sm, color: Colors.inkLight, fontFamily: Fonts.sans, textAlign: 'center' },

  // 编辑 Modal
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.creamLight, borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.sm },
  sheetTitle: { fontSize: Typography.md, color: Colors.ink, fontFamily: Fonts.sansRegular, marginBottom: Spacing.sm },
  sheetSub: { fontSize: Typography.xs, color: Colors.inkMid, fontFamily: Fonts.sans },
  sheetUsername: { fontSize: Typography.base, color: Colors.ink, fontFamily: Fonts.sansRegular },
  input: {
    height: 44, borderWidth: 1, borderColor: Colors.borderMid,
    borderRadius: Radius.md, paddingHorizontal: Spacing.base,
    fontSize: Typography.base, color: '#000', backgroundColor: '#fff',
    fontFamily: Fonts.sans,
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  btnCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  btnCancelText: { fontSize: Typography.sm, color: Colors.inkMid, fontFamily: Fonts.sans },
  btnSave: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  btnSaveText: { fontSize: Typography.sm, color: Colors.cream, fontFamily: Fonts.sansRegular },
});
