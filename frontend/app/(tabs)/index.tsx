import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  booksAPI, recordsAPI, usersAPI, Book, LedgerRecord,
  getDisplayName, formatAmount, todayStr,
} from '@/lib/api';
import { useBookStore } from '@/store/bookStore';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, Radius, Fonts, EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, TASK_CATEGORY_LABELS } from '@/lib/theme';

// ── 日期工具 ──────────────────────────────────────────────────
function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(d: Date): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const isToday = dateToStr(d) === dateToStr(new Date());
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日  周${weekdays[d.getDay()]}${isToday ? '  · 今天' : ''}`;
}

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const { token, user, logout, setAuth } = useAuthStore();
  const { books, currentBookId, currentBookMembers, setBooks, setCurrentBook, setMembers } = useBookStore();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [todos, setTodos] = useState<LedgerRecord[]>([]);
  const [history, setHistory] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // modals
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showCreateBook, setShowCreateBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // edit/delete
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null);
  const [editPatch, setEditPatch] = useState<{
    item_type: 'expense' | 'task' | 'income';
    category: string;
    content: string;
    amount: number;
    owner_id: string;
    status: string;
  } | null>(null);

  const currentBook = books.find(b => b.id === currentBookId);

  const loadBooks = useCallback(async () => {
    try {
      const res = await booksAPI.list();
      setBooks(res.data.data ?? []);
    } catch {}
  }, []);

  const loadRecords = useCallback(async () => {
    if (!currentBookId) return;
    setLoading(true);
    try {
      const res = await booksAPI.dailyRecords(currentBookId, dateToStr(selectedDate));
      setTodos(res.data.data?.todos ?? []);
      setHistory(res.data.data?.history ?? []);
    } catch {} finally { setLoading(false); }
  }, [currentBookId, selectedDate]);

  const loadMembers = useCallback(async () => {
    if (!currentBookId) return;
    try {
      const res = await booksAPI.members(currentBookId);
      setMembers(res.data.data ?? []);
    } catch {}
  }, [currentBookId]);

  useEffect(() => { loadBooks(); }, []);
  // 切换日期 或 切换账本 时重新加载记录
  useEffect(() => { loadRecords(); }, [loadRecords]);
  // 切换账本时加载成员
  useEffect(() => { loadMembers(); }, [currentBookId]);
  // 切回该 tab 时刷新
  useFocusEffect(useCallback(() => { loadRecords(); }, [loadRecords]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBooks(), loadRecords(), loadMembers()]);
    setRefreshing(false);
  };

  const markCompleted = async (rec: LedgerRecord) => {
    try {
      await recordsAPI.update(rec.id, { status: 'completed' } as any);
      loadRecords();
    } catch { Alert.alert('操作失败'); }
  };

  const handleCreateBook = async () => {
    if (!newBookName.trim()) return;
    try {
      const res = await booksAPI.create(newBookName.trim());
      await loadBooks();
      setCurrentBook(res.data.data.id);
      setShowCreateBook(false);
      setNewBookName('');
    } catch (e: any) {
      Alert.alert('创建失败', e.response?.data?.message ?? '请重试');
    }
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim() || !currentBookId) return;
    setInviting(true);
    try {
      await booksAPI.invite(currentBookId, inviteUsername.trim());
      Alert.alert('✅ 邀请已发送', `已向「${inviteUsername}」发送邀请`);
      setInviteUsername(''); setShowInvite(false);
    } catch (e: any) {
      Alert.alert('邀请失败', e.response?.data?.message ?? '请检查用户名');
    } finally { setInviting(false); }
  };

  const handleSaveProfile = async () => {
    if (!newNickname.trim() && !newPassword.trim()) return;
    setSavingProfile(true);
    try {
      const payload: { nickname?: string; password?: string } = {};
      if (newNickname.trim()) payload.nickname = newNickname.trim();
      if (newPassword.trim()) payload.password = newPassword.trim();
      const res = await usersAPI.updateProfile(payload);
      const updated = res.data.data;
      if (token) await setAuth(token, { id: updated.id, username: updated.username, nickname: updated.nickname });
      Alert.alert('✅ 已保存');
      setNewNickname(''); setNewPassword(''); setShowProfile(false);
    } catch (e: any) {
      Alert.alert('保存失败', e.response?.data?.message ?? '请重试');
    } finally { setSavingProfile(false); }
  };

  const openEdit = (r: LedgerRecord) => {
    setEditingRecord(r);
    setEditPatch({
      item_type: r.item_type as any,
      category: r.category,
      content: r.content,
      amount: r.amount,
      owner_id: r.owner.user_id,
      status: r.status,
    });
  };
  const handleEditRecord = async () => {
    if (!editingRecord || !editPatch) return;
    try {
      await recordsAPI.update(editingRecord.id, editPatch as any);
      setEditingRecord(null); setEditPatch(null); loadRecords();
    } catch { Alert.alert('修改失败'); }
  };
  const handleDeleteRecord = (r: LedgerRecord) => {
    Alert.alert('删除记录', `确定删除「${r.content}」？`, [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try { await recordsAPI.delete(r.id); loadRecords(); }
        catch { Alert.alert('删除失败'); }
      }},
    ]);
  };

  // 合并并按时间倒序排列
  const allRecords = [...todos, ...history].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.bookSelector} onPress={() => setShowBookPicker(true)}>
          <Text style={styles.bookName}>{currentBook?.name ?? '选择账本'}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.inkMid} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {currentBookId && (
            <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.headerBtn}>
              <Ionicons name="person-add-outline" size={20} color={Colors.inkMid} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 日期标题 ─────────────────────────────────────────── */}
      {/* ── 日期导航 ─────────────────────────────────────────── */}
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d);
          }}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.inkMid} />
        </TouchableOpacity>

        <Text style={styles.dateLabel}>{dateLabel(selectedDate)}</Text>

        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d);
          }}
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.inkMid} />
        </TouchableOpacity>
      </View>

      {/* ── 记录列表 ─────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.inkMid} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={Colors.inkMid} style={{ marginTop: 40 }} />
        ) : allRecords.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyMark}>象</Text>
            <Text style={styles.emptyText}>今天还没有记录</Text>
            <Text style={styles.emptyHint}>去录入页，让大象帮你整理今天的事</Text>
          </View>
        ) : (
          allRecords.map(r => (
            <WitnessRow
              key={r.id}
              record={r}
              onComplete={() => markCompleted(r)}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDeleteRecord(r)}
            />
          ))
        )}
      </ScrollView>

      {/* ── 编辑 Modal ──────────────────────────────────────── */}
      <Modal visible={!!editingRecord && !!editPatch} transparent animationType="slide">
        <View style={styles.overlayBottom}>
          <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { marginBottom: Spacing.md }]}>编辑记录</Text>

            {editPatch && (
              <>
                {/* 类型切换 */}
                <View style={styles.editTypeRow}>
                  {(['expense', 'income', 'task'] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.editTypeBtn, editPatch.item_type === t && styles.editTypeBtnActive]}
                      onPress={() => setEditPatch({ ...editPatch, item_type: t, category: t === 'expense' ? 'food' : t === 'income' ? 'salary' : 'cleaning', status: t === 'task' ? 'pending' : 'completed' })}
                    >
                      <Text style={[styles.editTypeBtnText, editPatch.item_type === t && styles.editTypeBtnActiveText]}>
                        {t === 'expense' ? '消费' : t === 'income' ? '收入' : '事项'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 分类 */}
                <Text style={styles.fieldLabel}>分类</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(editPatch.item_type === 'expense'
                      ? Object.entries(EXPENSE_CATEGORY_LABELS)
                      : editPatch.item_type === 'income'
                      ? Object.entries(INCOME_CATEGORY_LABELS)
                      : Object.entries(TASK_CATEGORY_LABELS).filter(([k]) => k !== 'mental_energy_reward')
                    ).map(([k, v]) => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.catChip, editPatch.category === k && styles.catChipActive]}
                        onPress={() => setEditPatch({ ...editPatch, category: k })}
                      >
                        <Text style={[styles.catChipText, editPatch.category === k && styles.catChipActiveText]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* 内容 */}
                <Text style={styles.fieldLabel}>内容</Text>
                <TextInput
                  style={[styles.fieldInput, { marginBottom: Spacing.sm }]}
                  value={editPatch.content}
                  onChangeText={v => setEditPatch({ ...editPatch, content: v })}
                  multiline
                  placeholderTextColor={Colors.inkLight}
                />

                {/* 消费/收入：金额 + 负责人 */}
                {editPatch.item_type !== 'task' && (
                  <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>金额</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={String(editPatch.amount)}
                        onChangeText={v => setEditPatch({ ...editPatch, amount: parseFloat(v) || 0 })}
                        keyboardType="decimal-pad"
                        placeholderTextColor={Colors.inkLight}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>负责人</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {currentBookMembers.map(m => {
                            const display = m.alias || m.nickname;
                            const isActive = editPatch.owner_id === m.user_id;
                            return (
                              <TouchableOpacity key={m.user_id} style={[styles.ownerChip, isActive && styles.ownerChipActive]}
                                onPress={() => setEditPatch({ ...editPatch, owner_id: m.user_id })}>
                                <Text style={[styles.ownerChipText, isActive && styles.ownerChipActiveText]}>{display}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  </View>
                )}

                {/* 事项：状态 + 负责人 */}
                {editPatch.item_type === 'task' && (
                  <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>状态</Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {(['pending', 'completed'] as const).map(s => (
                          <TouchableOpacity key={s}
                            style={[styles.editTypeBtn, editPatch.status === s && styles.editTypeBtnActive]}
                            onPress={() => setEditPatch({ ...editPatch, status: s })}>
                            <Text style={[styles.editTypeBtnText, editPatch.status === s && styles.editTypeBtnActiveText]}>
                              {s === 'pending' ? '待完成' : '已完成'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>负责人</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {currentBookMembers.map(m => {
                            const display = m.alias || m.nickname;
                            const isActive = editPatch.owner_id === m.user_id;
                            return (
                              <TouchableOpacity key={m.user_id} style={[styles.ownerChip, isActive && styles.ownerChipActive]}
                                onPress={() => setEditPatch({ ...editPatch, owner_id: m.user_id })}>
                                <Text style={[styles.ownerChipText, isActive && styles.ownerChipActiveText]}>{display}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={[styles.sheetActions, { marginTop: Spacing.lg }]}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setEditingRecord(null); setEditPatch(null); }}>
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleEditRecord}>
                <Text style={styles.btnConfirmText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 账本选择器 ──────────────────────────────────────── */}
      <Modal visible={showBookPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.overlayBottom} onPress={() => setShowBookPicker(false)} activeOpacity={1}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>账 本</Text>
            {books.map(b => (
              <TouchableOpacity
                key={b.id}
                style={styles.bookItem}
                onPress={() => { setCurrentBook(b.id); setShowBookPicker(false); }}
              >
                <Text style={[styles.bookItemText, b.id === currentBookId && styles.bookItemActive]}>{b.name}</Text>
                {b.id === currentBookId && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.newBookBtn} onPress={() => { setShowBookPicker(false); setShowCreateBook(true); }}>
              <Ionicons name="add" size={16} color={Colors.accent} />
              <Text style={styles.newBookText}>新建账本</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 新建账本 ──────────────────────────────────────────── */}
      <Modal visible={showCreateBook} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>新建账本</Text>
            <InputField label="账本名称" value={newBookName} onChangeText={setNewBookName} autoFocus />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setShowCreateBook(false)}>
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleCreateBook}>
                <Text style={styles.btnConfirmText}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 邀请成员 ──────────────────────────────────────────── */}
      <Modal visible={showInvite} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>邀请成员</Text>
            <InputField
              label="对方用户名"
              value={inviteUsername}
              onChangeText={setInviteUsername}
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setShowInvite(false); setInviteUsername(''); }}>
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, inviting && { opacity: 0.5 }]} onPress={handleInvite} disabled={inviting}>
                <Text style={styles.btnConfirmText}>{inviting ? '发送中…' : '发送邀请'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 个人资料 ──────────────────────────────────────────── */}
      <Modal visible={showProfile} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>个人资料</Text>
            <Text style={styles.profileUsername}>{user?.username}</Text>
            <InputField label="修改昵称" value={newNickname} onChangeText={setNewNickname} />
            <InputField label="修改密码（不填则不改）" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setShowProfile(false)}>
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnConfirm, savingProfile && { opacity: 0.5 }]} onPress={handleSaveProfile} disabled={savingProfile}>
                <Text style={styles.btnConfirmText}>保存</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={() => {
              setShowProfile(false);
              Alert.alert('退出登录', `当前账号：${user?.nickname ?? user?.username}`, [
                { text: '取消' },
                { text: '退出', style: 'destructive', onPress: logout },
              ]);
            }}>
              <Text style={styles.logoutText}>退出登录</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── WitnessRow ────────────────────────────────────────────────
function WitnessRow({ record: r, onComplete, onEdit, onDelete }: {
  record: LedgerRecord;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isExpense = r.item_type === 'expense';
  const isIncome = r.item_type === 'income';
  const isPending = r.status === 'pending';
  const ownerName = getDisplayName({ nickname: r.owner.nickname, alias: r.owner.alias });

  const lineColor = isExpense ? Colors.expense
    : isIncome ? Colors.success
    : isPending ? Colors.warning
    : Colors.inkMid;

  return (
    <TouchableOpacity
      style={[styles.row, isPending && styles.rowPending]}
      activeOpacity={0.7}
      onPress={() => Alert.alert(r.content, '', [
        ...(isPending ? [{ text: '✅ 标记完成', onPress: onComplete }] : []),
        { text: '编辑', onPress: onEdit },
        { text: '删除', style: 'destructive' as const, onPress: onDelete },
        { text: '取消', style: 'cancel' as const },
      ])}
    >
      {/* 左：类型线 */}
      <View style={[styles.rowLine, { backgroundColor: lineColor }]} />

      {/* 中：内容 */}
      <View style={styles.rowBody}>
        <Text style={[styles.rowContent, isPending && styles.rowContentPending]} numberOfLines={2}>
          {r.content}
        </Text>
        <Text style={styles.rowMeta}>
          {ownerName}
          {isPending ? '  ·  待完成' : ''}
        </Text>
      </View>

      {/* 消费 -¥金额，收入 +¥金额，事项不显示金额 */}
      {isExpense && <Text style={[styles.rowAmount, { color: Colors.expense }]}>-¥{formatAmount(r.amount)}</Text>}
      {isIncome  && <Text style={[styles.rowAmount, { color: Colors.success }]}>+¥{formatAmount(r.amount)}</Text>}
      {isPending && (
        <View style={styles.checkCircle}>
          <Ionicons name="ellipse-outline" size={20} color={Colors.warning} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 通用输入框 ────────────────────────────────────────────────
function InputField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        placeholderTextColor="#999"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },

  // header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  bookSelector: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bookName: { fontSize: Typography.base, color: Colors.ink, fontFamily: Fonts.sansRegular, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerBtn: { padding: 4 },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.cream, fontSize: 13, fontWeight: Typography.semibold },

  // date row
  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  dateArrow: { padding: 6 },
  dateLabel: { fontSize: Typography.sm, color: Colors.ink, fontFamily: Fonts.sans, letterSpacing: 1, flex: 1, textAlign: 'center' },
  sectionTag: { fontSize: Typography.xs, color: Colors.inkMid, letterSpacing: 3, fontFamily: Fonts.sans },

  // scroll
  scroll: { paddingBottom: 40 },

  // empty
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyMark: { fontSize: 48, color: Colors.inkLight, fontWeight: Typography.light },
  emptyText: { fontSize: Typography.base, color: Colors.inkMid },
  emptyHint: { fontSize: Typography.sm, color: Colors.inkLight, textAlign: 'center', paddingHorizontal: Spacing.xl },

  // witness row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, paddingRight: Spacing.base,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  rowPending: { backgroundColor: Colors.creamLight },
  rowLine: { width: 2, alignSelf: 'stretch', borderRadius: 1, marginLeft: Spacing.base },
  rowBody: { flex: 1, gap: 3 },
  rowContent: { fontSize: Typography.base, color: Colors.ink, fontFamily: Fonts.sans, lineHeight: 22 },
  rowContentPending: { color: Colors.inkSoft },
  rowMeta: { fontSize: Typography.xs, color: Colors.inkMid, fontFamily: Fonts.sans, letterSpacing: 0.3 },
  rowAmount: { fontSize: Typography.base, color: Colors.expense, fontWeight: Typography.medium },
  checkCircle: { paddingRight: 4 },

  // modals shared
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: Spacing.xl },
  overlayBottom: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.creamLight, borderRadius: Radius.xl,
    padding: Spacing.xl, gap: Spacing.md,
  },
  bottomSheet: {
    backgroundColor: Colors.creamLight, borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 40, gap: Spacing.xs,
  },
  sheetHandle: {
    width: 32, height: 3, backgroundColor: Colors.creamMid,
    borderRadius: Radius.full, alignSelf: 'center', marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: Typography.md, color: Colors.ink, fontWeight: Typography.medium, letterSpacing: 1 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  btnCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  btnCancelText: { fontSize: Typography.sm, color: Colors.inkMid },
  btnConfirm: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  btnConfirmText: { fontSize: Typography.sm, color: Colors.cream, fontWeight: Typography.medium },

  // book picker
  bookItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  bookItemText: { fontSize: Typography.base, color: Colors.ink },
  bookItemActive: { fontWeight: Typography.semibold },
  newBookBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, gap: 6 },
  newBookText: { fontSize: Typography.base, color: Colors.accent },

  // profile
  profileUsername: { fontSize: Typography.sm, color: Colors.inkMid, letterSpacing: 1 },
  logoutBtn: { alignSelf: 'center', paddingVertical: Spacing.sm },
  logoutText: { fontSize: Typography.sm, color: Colors.accent, letterSpacing: 1 },

  // field
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: Typography.xs, color: Colors.inkMid, letterSpacing: 0.5, marginBottom: 4 },
  fieldInput: {
    height: 44, borderWidth: 1, borderColor: Colors.borderMid,
    borderRadius: Radius.md, paddingHorizontal: Spacing.base,
    fontSize: Typography.base, color: '#000', backgroundColor: '#fff',
  },

  // 编辑表单
  editTypeRow: { flexDirection: 'row', gap: 4, marginBottom: Spacing.md },
  editTypeBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.borderMid,
  },
  editTypeBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  editTypeBtnText: { fontSize: Typography.xs, color: Colors.inkMid, fontFamily: Fonts.sansRegular },
  editTypeBtnActiveText: { color: Colors.cream },
  catChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cream,
  },
  catChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catChipText: { fontSize: Typography.xs, color: Colors.inkMid },
  catChipActiveText: { color: Colors.cream },
  ownerChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cream,
  },
  ownerChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  ownerChipText: { fontSize: Typography.xs, color: Colors.inkMid },
  ownerChipActiveText: { color: Colors.white },
});
