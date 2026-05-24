import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { recordsAPI, StagedItem, BookMember } from '@/lib/api';
import { useStagingStore } from '@/store/stagingStore';
import { useBookStore } from '@/store/bookStore';
import {
  Colors,
  Typography,
  Spacing,
  Radius,
  EXPENSE_CATEGORY_LABELS,
  TASK_CATEGORY_LABELS,
  INCOME_CATEGORY_LABELS,
} from '@/lib/theme';

const EXPENSE_CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS);
const TASK_CATEGORIES = Object.entries(TASK_CATEGORY_LABELS).filter(([k]) => k !== 'mental_energy_reward');
const INCOME_CATEGORIES = Object.entries(INCOME_CATEGORY_LABELS);

export default function StagingScreen() {
  const insets = useSafeAreaInsets();
  const { items, bookId, updateItem, removeItem, clear } = useStagingStore();
  const { currentBookMembers } = useBookStore();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (items.length === 0) {
      Alert.alert('提示', '暂存列表为空');
      return;
    }
    if (!bookId) return;

    setLoading(true);
    try {
      const payload = items.map(({ owner_username, ...rest }) => rest);
      await recordsAPI.batch(bookId, payload);
      clear();
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('提交失败', err.response?.data?.message ?? '请重试');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}> 
        <View style={styles.header}>
          <Text style={styles.title}>暂存确认</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>暂存列表为空</Text>
          <Text style={styles.emptyHint}>请先到「录入」页面，通过 AI 解析生成条目</Text>
          <TouchableOpacity style={styles.goInputBtn} onPress={() => router.push('/(tabs)/input')}>
            <Text style={styles.goInputText}>去录入</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>暂存确认</Text>
          <Text style={styles.subtitle}>共 {items.length} 条，请核对后提交</Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('清空', '确定清空所有暂存条目？', [
              { text: '取消' },
              { text: '清空', style: 'destructive', onPress: clear },
            ])
          }
        >
          <Text style={styles.clearText}>全部清空</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <StagingRow
            item={item}
            members={currentBookMembers}
            onChange={(patch) => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
          />
        )}
        showsVerticalScrollIndicator={true}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}> 
        <TouchableOpacity
          style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.creamLight} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.creamLight} />
              <Text style={styles.confirmText}>确认录入</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface RowProps {
  item: StagedItem;
  members: BookMember[];
  onChange: (patch: Partial<StagedItem>) => void;
  onRemove: () => void;
}

function StagingRow({ item, members, onChange, onRemove }: RowProps) {
  const isExpense = item.item_type === 'expense';
  const isIncome = item.item_type === 'income';
  const isTask = item.item_type === 'task';
  const categories = isExpense ? EXPENSE_CATEGORIES : isIncome ? INCOME_CATEGORIES : TASK_CATEGORIES;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.typeToggle}>
          {(['expense', 'income', 'task'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, item.item_type === t && styles.typeBtnActive]}
              onPress={() =>
                onChange({
                  item_type: t,
                  category: t === 'expense' ? 'food' : t === 'income' ? 'salary' : 'cleaning',
                  status: t === 'task' ? 'pending' : 'completed',
                })
              }
            >
              <Text style={[styles.typeBtnText, item.item_type === t && styles.typeBtnActiveText]}>
                {t === 'expense' ? '消费' : t === 'income' ? '收入' : '事项'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={16} color={Colors.inkLight} />
        </TouchableOpacity>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>分类</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.catChips}>
            {categories.map(([k, v]) => (
              <TouchableOpacity
                key={k}
                style={[styles.catChip, item.category === k && styles.catChipActive]}
                onPress={() => onChange({ category: k })}
              >
                <Text style={[styles.catChipText, item.category === k && styles.catChipActiveText]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>内容</Text>
        <TextInput
          style={styles.fieldInput}
          value={item.content}
          onChangeText={(v) => onChange({ content: v })}
          multiline
          placeholderTextColor={Colors.inkLight}
        />
      </View>

      {/* 消费/收入：金额 + 负责人并排 */}
      {!isTask && (
        <View style={styles.fieldRowInline}>
          <View style={[styles.fieldRow, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>金额</Text>
            <TextInput
              style={styles.fieldInput}
              value={String(item.amount)}
              onChangeText={(v) => onChange({ amount: parseFloat(v) || 0 })}
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.inkLight}
            />
          </View>
          <View style={[styles.fieldRow, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>负责人</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {members.map((m) => {
                  const display = m.alias || m.nickname;
                  const isActive = item.owner_id === m.user_id;
                  return (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[styles.ownerChip, isActive && styles.ownerChipActive]}
                      onPress={() => onChange({ owner_id: m.user_id, owner_username: m.username })}
                    >
                      <Text style={[styles.ownerChipText, isActive && styles.ownerChipActiveText]}>{display}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* 事项：状态在左，负责人在右，同一行 */}
      {isTask && (
        <View style={styles.fieldRowInline}>
          <View style={[styles.fieldRow, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>状态</Text>
            <View style={styles.typeToggle}>
              {(['pending', 'completed'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.typeBtn, item.status === s && styles.typeBtnActive]}
                  onPress={() => onChange({ status: s })}
                >
                  <Text style={[styles.typeBtnText, item.status === s && styles.typeBtnActiveText]}>
                    {s === 'pending' ? '待完成' : '已完成'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.fieldRow, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>负责人</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {members.map((m) => {
                  const display = m.alias || m.nickname;
                  const isActive = item.owner_id === m.user_id;
                  return (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[styles.ownerChip, isActive && styles.ownerChipActive]}
                      onPress={() => onChange({ owner_id: m.user_id, owner_username: m.username })}
                    >
                      <Text style={[styles.ownerChipText, isActive && styles.ownerChipActiveText]}>{display}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.xl, color: Colors.ink, fontWeight: Typography.bold },
  subtitle: { fontSize: Typography.sm, color: Colors.inkMid, marginTop: 2 },
  clearText: { fontSize: Typography.sm, color: Colors.accent, paddingTop: 4 },
  list: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 },

  row: {
    backgroundColor: Colors.creamLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeToggle: { flexDirection: 'row', gap: 4 },
  typeBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.borderMid,
  },
  typeBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  typeBtnText: { fontSize: Typography.xs, color: Colors.inkMid, fontWeight: Typography.medium },
  typeBtnActiveText: { color: Colors.creamLight },
  removeBtn: { padding: 4 },

  fieldRow: { gap: 4 },
  fieldRowInline: { flexDirection: 'row', gap: Spacing.md },
  fieldLabel: { fontSize: Typography.xs, color: Colors.inkMid, fontWeight: Typography.medium, letterSpacing: 0.3 },
  fieldInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    fontSize: Typography.sm, color: Colors.ink, backgroundColor: Colors.cream,
  },
  catChips: { flexDirection: 'row', gap: 6 },
  catChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cream,
  },
  catChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catChipText: { fontSize: Typography.xs, color: Colors.inkMid },
  catChipActiveText: { color: Colors.creamLight },
  ownerChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cream,
  },
  ownerChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  ownerChipText: { fontSize: Typography.xs, color: Colors.inkMid },
  ownerChipActiveText: { color: Colors.white },

  footer: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.creamLight,
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.ink, borderRadius: Radius.md, height: 52, gap: 8,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { fontSize: Typography.base, color: Colors.creamLight, fontWeight: Typography.semibold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: Typography.lg, color: Colors.ink, fontWeight: Typography.semibold },
  emptyHint: { fontSize: Typography.sm, color: Colors.inkMid, textAlign: 'center', marginTop: Spacing.xs },
  goInputBtn: {
    marginTop: Spacing.lg, backgroundColor: Colors.ink,
    borderRadius: Radius.md, paddingHorizontal: 28, paddingVertical: 12,
  },
  goInputText: { fontSize: Typography.base, color: Colors.creamLight, fontWeight: Typography.semibold },
});
