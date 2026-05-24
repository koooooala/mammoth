/**
 * 大象账本 - 设计系统 Design Tokens
 * 来源：Mammoth Prototype v2.1 视觉稿
 * 主调：暖奶油纸张（管家态）+ 深褐纸张（见证人态）+ 朱红点缀
 */

// ── 字体家族 ────────────────────────────────────────────────
export const Fonts = {
  // 主 app（管家态）— 无衬线
  sans: 'NotoSansSC_300Light',       // 默认正文
  sansRegular: 'NotoSansSC_400Regular',
  sansMedium: 'NotoSansSC_500Medium',
  // 见证书（见证人态）— 衬线
  serif: 'NotoSerifSC_300Light',
  serifRegular: 'NotoSerifSC_400Regular',
  serifMedium: 'NotoSerifSC_500Medium',
};

export const Colors = {
  // ── paper-light（管家态 · 主 app）──────────────────────────
  cream: '#F4EEDE',
  creamLight: '#FBF6EE',
  creamMid: '#EDE4D0',
  creamDeep: '#E9E0CB',
  ink: '#2A1F15',
  inkSoft: '#4A3A2C',
  inkMid: '#8A7560',
  inkLight: '#C9BCA5',
  accent: '#D2402F',
  accentSoft: '#F5E8E6',

  // ── paper-dark（见证人态 · 见证书 / 大象登场）──────────────
  darkPaper: '#1B1611',
  darkPaper2: '#14100C',
  darkInk: '#E8DCC0',
  darkInkSoft: '#BFB196',
  darkInkMid: '#87796A',
  darkInkFaint: '#4A3F32',

  // ── 语义色 ────────────────────────────────────────────────
  success: '#1F8A5B',
  successBg: '#EAF3EA',
  warning: '#C97A2E',
  warningBg: '#FDF3E3',
  expense: '#3A6EA5',
  expenseBg: '#EAF0FA',

  // ── 功能色 ────────────────────────────────────────────────
  border: 'rgba(42, 31, 21, 0.10)',
  borderMid: 'rgba(42, 31, 21, 0.18)',
  darkBorder: 'rgba(232, 220, 192, 0.15)',
  darkBorderMid: 'rgba(232, 220, 192, 0.30)',
  shadow: 'rgba(42, 31, 21, 0.08)',
  overlay: 'rgba(42, 31, 21, 0.55)',
  white: '#FFFFFF',
};

export const Typography = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 48,
  hero: 80,

  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  section: 48,
};

export const Radius = {
  sm: 4,
  md: 8,
  lg: 14,
  xl: 20,
  full: 999,
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  food: '餐饮',
  transport: '出行',
  shopping: '购物',
  entertainment: '娱乐',
  medical: '医疗',
  other: '其他',
};

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  cleaning: '清洁',
  cooking: '烹饪',
  errand: '跑腿',
  care: '照护',
  maintenance: '维修',
  reminder: '提醒',
  other: '其他',
  mental_energy_reward: '心力创收',
};

export const INCOME_CATEGORY_LABELS: Record<string, string> = {
  salary: '工资',
  bonus: '奖金',
  transfer: '转账',
  investment: '理财',
  other: '其他',
};

export const RECORD_TYPE_LABELS: Record<'expense' | 'task' | 'income', string> = {
  expense: '消费',
  task: '事项',
  income: '收入',
};
