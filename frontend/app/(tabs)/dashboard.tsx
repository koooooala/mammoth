import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  reportAPI, configAPI, ReportSummary, MemberIncome,
  formatAmount, getWeekRange, getMonthRange,
} from '@/lib/api';
import { useBookStore } from '@/store/bookStore';
import { Colors, Typography, Spacing, Radius, Fonts } from '@/lib/theme';

type Period = 'week' | 'month';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { currentBookId, books } = useBookStore();
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const currentBook = books.find(b => b.id === currentBookId);
  const now = new Date();
  const periodLabel = period === 'month'
    ? `${now.getFullYear()} · ${now.getMonth() + 1}`
    : `第 ${getWeekNumber(now)} 周`;

  const loadSummary = useCallback(async () => {
    if (!currentBookId) return;
    setLoading(true);
    try {
      const range = period === 'week' ? getWeekRange() : getMonthRange();
      const res = await reportAPI.summary({ book_id: currentBookId, period, ...range });
      setSummary(res.data.data);
    } catch {} finally { setLoading(false); }
  }, [currentBookId, period]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const members = summary?.members ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── 档案头 ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.serial}>档 案 · {periodLabel}</Text>
          <Text style={styles.stamp}>密 件 · 家 庭</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.headerMain}>
          <Text style={styles.eyebrow}>— 已 归 档 · 不 可 编 辑 —</Text>
          <Text style={styles.title}>家 庭 见 证 书</Text>
          <Text style={styles.titleSub}>见 证 · {now.getFullYear()} · {now.getMonth() + 1}</Text>
        </View>
        <View style={styles.rule} />
        <View style={[styles.rule, { marginTop: 3, opacity: 0.4 }]} />
      </View>

      {/* ── 周期切换 ─────────────────────────────────────────── */}
      <View style={styles.periodRow}>
        {(['week', 'month'] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {p === 'week' ? '本 周' : '本 月'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.darkInkMid} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && !summary ? (
          <ActivityIndicator color={Colors.darkInkMid} style={{ marginTop: 60 }} />
        ) : !summary ? (
          <EmptyState />
        ) : (
          <>
            {/* ── 1. 现金收入 ───────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionHead}>现 金 收 入</Text>
              <MemberGrid members={members} valueKey="cash_income" />
            </View>

            <DoubleRule />

            {/* ── 2. 劳动创收（含心力）────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionHead}>劳 动 创 收</Text>
              <MemberGrid members={members} valueKey="total_labor_income" />
              <View style={styles.laborSub}>
                <Text style={styles.laborSubLabel}>事 项</Text>
                <MemberGridSmall members={members} valueKey="labor_task_amount" />
              </View>
              <View style={[styles.laborSub, { marginTop: Spacing.sm }]}>
                <Text style={styles.laborSubLabel}>心 力</Text>
                <MemberGridSmall members={members} valueKey="mental_energy_reward" accent />
              </View>
            </View>

            <DoubleRule />

            {/* ── 3. 贡献合计 ───────────────────────────────── */}
            <View style={styles.totalsRow}>
              {members.map((m, i) => (
                <TotalCell
                  key={m.user_id}
                  label={m.alias || m.nickname}
                  value={m.total_contrib}
                  border={i > 0}
                />
              ))}
            </View>

            <DoubleRule />

            {/* ── 4. 消费 ───────────────────────────────────── */}
            {(summary.expense_summary.by_category ?? []).length > 0 && (
              <View style={styles.section}>
                <View style={styles.expenseHeaderRow}>
                  <Text style={styles.sectionHead}>消 费</Text>
                  <Text style={styles.expenseTotal}>
                    <Text style={styles.detailCurrency}>¥</Text>
                    {formatAmount(summary.expense_summary.total)}
                  </Text>
                </View>
                {(summary.expense_summary.by_category ?? []).map((cat, i) => (
                  <View key={cat.category} style={[styles.detailRow, i > 0 && styles.detailRowBorder]}>
                    <Text style={styles.detailLabel}>{cat.label}</Text>
                    <Text style={styles.detailValue}>
                      <Text style={styles.detailCurrency}>¥</Text>
                      {formatAmount(cat.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {(summary.expense_summary.by_category ?? []).length > 0 && <DoubleRule />}

            {/* ── 5. 本院观察 ───────────────────────────────── */}
            {summary.ai_report?.full_text ? (
              <View style={styles.obsSection}>
                <Text style={styles.obsHead}>本 院 观 察</Text>
                {summary.ai_report.full_text.split('\n').filter(Boolean).map((line, i) => (
                  <View key={i} style={styles.obsRow}>
                    <Text style={styles.obsDot}>·</Text>
                    <Text style={styles.obsText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ── 落款 ─────────────────────────────────────── */}
            <View style={styles.foot}>
              <Text style={styles.footSig}>— 大 象 见 证 · MAMMOTH · {now.getFullYear()} —</Text>
            </View>
          </>
        )}
      </ScrollView>

      <ConfigModal visible={showConfig} onClose={() => setShowConfig(false)} onSaved={loadSummary} />
    </View>
  );
}

// ── 成员三列横排（大数字）─────────────────────────────────────
function MemberGrid({ members, valueKey, accent }: {
  members: MemberIncome[];
  valueKey: keyof MemberIncome;
  accent?: boolean;
}) {
  if (members.length === 0) return <Text style={styles.noData}>暂 无 数 据</Text>;
  return (
    <View style={styles.memberGrid}>
      {members.map((m, i) => {
        const name = m.alias || m.nickname;
        const val = m[valueKey] as number;
        return (
          <View key={m.user_id} style={[styles.memberCol, i > 0 && styles.memberColBorder]}>
            <Text style={styles.memberName}>{name}</Text>
            <Text style={[styles.memberNum, accent && styles.memberNumAccent]}>
              <Text style={styles.memberCurrency}>¥</Text>
              {formatAmount(val)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 成员三列横排（小数字，用于劳动/心力明细）────────────────────
function MemberGridSmall({ members, valueKey, accent }: {
  members: MemberIncome[];
  valueKey: keyof MemberIncome;
  accent?: boolean;
}) {
  return (
    <View style={styles.memberGrid}>
      {members.map((m, i) => {
        const val = m[valueKey] as number;
        return (
          <View key={m.user_id} style={[styles.memberColSmall, i > 0 && styles.memberColBorder]}>
            <Text style={[styles.memberNumSmall, accent && styles.memberNumAccent]}>
              <Text style={styles.memberCurrencySmall}>¥</Text>
              {formatAmount(val)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 贡献合计单元 ──────────────────────────────────────────────
function TotalCell({ label, value, border }: { label: string; value: number; border?: boolean }) {
  return (
    <View style={[styles.totalCell, border && styles.totalCellBorder]}>
      <Text style={styles.totalNum}>
        <Text style={styles.totalCurrency}>¥</Text>
        {formatAmount(value)}
      </Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

// ── 双线分隔 ──────────────────────────────────────────────────
function DoubleRule() {
  return (
    <View style={styles.doubleRule}>
      <View style={styles.ruleLine} />
      <View style={[styles.ruleLine, { opacity: 0.35, marginTop: 3 }]} />
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyMark}>象</Text>
      <Text style={styles.emptyText}>暂 无 数 据</Text>
    </View>
  );
}

// ── 配置 Modal ────────────────────────────────────────────────
function ConfigModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [rewardAmount, setRewardAmount] = useState('50');
  const [pricingKey, setPricingKey] = useState('');
  const [pricingVal, setPricingVal] = useState('');
  const [saving, setSaving] = useState(false);

  const saveReward = async () => {
    setSaving(true);
    try {
      await configAPI.update('system', 'mental_cost_reward', parseFloat(rewardAmount));
      Alert.alert('✅', '心力奖励已更新');
      onSaved();
    } catch {} finally { setSaving(false); }
  };

  const savePricing = async () => {
    if (!pricingKey || !pricingVal) return;
    setSaving(true);
    try {
      await configAPI.update('pricing', pricingKey, parseFloat(pricingVal));
      Alert.alert('✅', `「${pricingKey}」定价已更新`);
      setPricingKey(''); setPricingVal('');
    } catch {} finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
        onPress={onClose} activeOpacity={1}
      >
        <View style={styles.configSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.configTitle}>动 态 配 置</Text>
          <Text style={styles.configSub}>心力消耗奖励单价（元/次）</Text>
          <View style={styles.configRow}>
            <TextInput
              style={styles.configInput}
              value={rewardAmount}
              onChangeText={setRewardAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={Colors.darkInkMid}
            />
            <TouchableOpacity style={styles.configSaveBtn} onPress={saveReward} disabled={saving}>
              <Text style={styles.configSaveBtnText}>保 存</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.configSub, { marginTop: Spacing.md }]}>修改事项定价</Text>
          <TextInput
            style={[styles.configInput, { marginBottom: Spacing.sm }]}
            value={pricingKey}
            onChangeText={setPricingKey}
            placeholder="事项关键词，如：洗碗"
            placeholderTextColor={Colors.darkInkMid}
          />
          <View style={styles.configRow}>
            <TextInput
              style={styles.configInput}
              value={pricingVal}
              onChangeText={setPricingVal}
              keyboardType="decimal-pad"
              placeholder="价格（元）"
              placeholderTextColor={Colors.darkInkMid}
            />
            <TouchableOpacity style={styles.configSaveBtn} onPress={savePricing} disabled={saving}>
              <Text style={styles.configSaveBtnText}>保 存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function getWeekNumber(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

const D = Colors.darkBorder;
const DM = Colors.darkBorderMid;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkPaper },

  // 档案头
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.base },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  serial: { fontSize: 9, color: Colors.darkInkMid, letterSpacing: 3, fontFamily: Fonts.serif },
  stamp: { fontSize: 9, color: Colors.darkInkMid, letterSpacing: 3, fontFamily: Fonts.serif },
  rule: { height: 0.5, backgroundColor: DM },
  headerMain: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingVertical: Spacing.sm,
  },
  eyebrow: { fontSize: 9, color: Colors.darkInkMid, letterSpacing: 3, marginBottom: 6, fontFamily: Fonts.serif },
  title: { fontSize: Typography.xl, color: Colors.darkInk, fontFamily: Fonts.serif, letterSpacing: 8 },
  titleSub: { fontSize: Typography.xs, color: Colors.darkInkMid, letterSpacing: 3, marginTop: 4, fontFamily: Fonts.serif },
  configBtn: { borderWidth: 0.5, borderColor: D, paddingHorizontal: 10, paddingVertical: 5 },
  configText: { fontSize: 10, color: Colors.darkInkMid, letterSpacing: 2 },

  // 周期
  periodRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: D,
  },
  periodBtn: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: 'transparent' },
  periodBtnActive: { borderColor: D },
  periodText: { fontSize: Typography.xs, color: Colors.darkInkMid, letterSpacing: 2 },
  periodTextActive: { color: Colors.darkInk },

  scroll: { paddingBottom: 60 },

  // 区块
  section: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  sectionHead: {
    fontSize: Typography.xs, color: Colors.darkInkMid,
    letterSpacing: 5, fontFamily: Fonts.serif,
    marginBottom: Spacing.lg, textAlign: 'center',
  },

  // 成员三列横排
  memberGrid: { flexDirection: 'row' },
  memberCol: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
  memberColBorder: { borderLeftWidth: 0.5, borderLeftColor: DM },
  memberName: {
    fontSize: 15, color: Colors.darkInk,
    fontFamily: Fonts.serifMedium, letterSpacing: 3,
  },
  memberNum: {
    fontSize: 28, color: Colors.darkInk,
    fontFamily: Fonts.serif, letterSpacing: -0.5,
  },
  memberNumAccent: { color: Colors.accent },
  memberCurrency: { fontSize: 14, fontStyle: 'italic', opacity: 0.6 },

  // 合计
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.xl,
  },
  totalCell: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm },
  totalCellBorder: { borderLeftWidth: 0.5, borderLeftColor: DM },
  totalsDivider: { width: 0.5, backgroundColor: DM, marginVertical: 4 },
  totalNum: { fontSize: 32, color: Colors.darkInk, fontFamily: Fonts.serif, letterSpacing: -1 },
  totalCurrency: { fontSize: 14, fontStyle: 'italic', opacity: 0.6 },
  totalLabel: { fontSize: 10, color: Colors.darkInkMid, letterSpacing: 3, fontFamily: Fonts.serif },

  // 劳动明细小行
  laborSub: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
  laborSubLabel: { fontSize: 9, color: Colors.darkInkMid, letterSpacing: 3, fontFamily: Fonts.serif, width: 32 },
  memberColSmall: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  memberNumSmall: { fontSize: 15, color: Colors.darkInk, fontFamily: Fonts.serif, letterSpacing: -0.3 },
  memberCurrencySmall: { fontSize: 10, fontStyle: 'italic', opacity: 0.6 },

  // 消费标题行
  expenseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: Spacing.md },
  expenseTotal: { fontSize: Typography.lg, color: Colors.darkInk, fontFamily: Fonts.serif },

  // 支出明细
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl,
  },
  detailRowBorder: { borderTopWidth: 0.5, borderTopColor: D },
  detailLabel: { fontSize: Typography.sm, color: Colors.darkInkSoft, letterSpacing: 1, fontWeight: Typography.light },
  detailValue: { fontSize: Typography.base, color: Colors.darkInk, fontWeight: Typography.light },
  detailCurrency: { fontSize: 11, fontStyle: 'italic', opacity: 0.6 },

  // 双线
  doubleRule: { paddingHorizontal: Spacing.xl },
  ruleLine: { height: 0.5, backgroundColor: DM },

  // 观察记录
  obsSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 0.5, borderTopColor: D,
    gap: Spacing.md,
  },
  obsHead: {
    fontSize: 12, color: Colors.darkInkMid,
    letterSpacing: 6, textAlign: 'center',
    fontWeight: Typography.medium, marginBottom: Spacing.sm,
  },
  obsRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  obsDot: { fontSize: Typography.sm, color: Colors.accent, lineHeight: 26 },
  obsText: {
    flex: 1, fontSize: 13.5, color: Colors.darkInkSoft,
    lineHeight: 28, letterSpacing: 0.5, fontFamily: Fonts.sans,
  },

  // 落款
  foot: { alignItems: 'center', paddingVertical: Spacing.xxl },
  footSig: { fontSize: 9, color: Colors.darkInkFaint, letterSpacing: 4, fontWeight: Typography.light },

  // 空状态
  empty: { alignItems: 'center', paddingTop: 80, gap: Spacing.lg },
  emptyMark: { fontSize: 64, color: Colors.darkInkFaint, fontWeight: Typography.light },
  emptyText: { fontSize: Typography.sm, color: Colors.darkInkMid, letterSpacing: 4 },
  noData: { fontSize: Typography.sm, color: Colors.darkInkFaint, letterSpacing: 2, textAlign: 'center' },

  // 配置 sheet
  configSheet: {
    backgroundColor: Colors.darkPaper2, borderTopWidth: 0.5,
    borderTopColor: DM, padding: Spacing.xl, paddingBottom: 48, gap: Spacing.sm,
  },
  sheetHandle: {
    width: 32, height: 3, backgroundColor: D,
    borderRadius: Radius.full, alignSelf: 'center', marginBottom: Spacing.md,
  },
  configTitle: { fontSize: Typography.md, color: Colors.darkInk, letterSpacing: 3, fontWeight: Typography.light, marginBottom: Spacing.sm },
  configSub: { fontSize: Typography.xs, color: Colors.darkInkMid, letterSpacing: 1 },
  configRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  configInput: {
    flex: 1, height: 44, borderWidth: 0.5, borderColor: DM,
    paddingHorizontal: Spacing.base,
    fontSize: Typography.base, color: Colors.darkInk, backgroundColor: Colors.darkPaper,
  },
  configSaveBtn: { paddingHorizontal: Spacing.base, paddingVertical: 12, borderWidth: 0.5, borderColor: DM },
  configSaveBtnText: { fontSize: Typography.xs, color: Colors.darkInk, letterSpacing: 2 },
});
