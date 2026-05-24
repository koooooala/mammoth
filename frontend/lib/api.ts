import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

// 模拟器用 localhost，真机用 Mac 局域网 IP
const IS_DEVICE = false; // 用真机时改为 true，用模拟器时改为 false
export const BASE_URL = IS_DEVICE
  ? 'http://10.244.59.231:8080'
  : 'http://localhost:8080';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截：自动注入 JWT Token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：统一解包 data 字段
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 自动清除登录态
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  nickname: string;
}

export interface Book {
  id: string;
  name: string;
  owner_id: string;
  member_count: number;
  my_alias: string;
  created_at: string;
}

export interface BookMember {
  user_id: string;
  username: string;
  nickname: string;
  alias: string;
  joined_at: string;
}

export interface RecordOwner {
  user_id: string;
  username: string;
  nickname: string;
  alias: string;
}

export interface LedgerRecord {
  id: string;
  book_id: string;
  item_type: 'expense' | 'task' | 'income';
  category: string;
  content: string;
  amount: number;
  owner: RecordOwner;
  occurred_at: string;
  status: 'pending' | 'completed';
  is_mental_energy_reward?: boolean;
  created_at: string;
}

export interface StagedItem {
  item_type: 'expense' | 'task' | 'income';
  category: string;
  content: string;
  amount: number;
  owner_id: string;
  owner_username: string;
  occurred_at: string;
  status: 'pending' | 'completed';
}

export interface Invitation {
  id: string;
  book_id: string;
  book_name: string;
  inviter: { username: string; nickname: string };
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface MemberIncome {
  user_id: string;
  username: string;
  nickname: string;
  alias: string;
  cash_income: number;
  labor_task_amount: number;
  mental_energy_reward: number;
  total_labor_income: number;
  total_contrib: number;
  entry_count: number;
  entry_percentage: number;
  highest_value_task: { content: string; amount: number };
}

export interface ReportSummary {
  period: { type: string; start: string; end: string };
  mental_cost_reward_unit: number;
  members: MemberIncome[];
  expense_summary: {
    total: number;
    by_category: { category: string; label: string; amount: number }[];
  };
  ai_report: {
    entry_summary: string;
    hardwork_praise: string;
    full_text: string;
  };
}

// ─── API 方法 ──────────────────────────────────────────────────────────────────

export const authAPI = {
  register: (data: { username: string; password: string; nickname: string }) =>
    api.post('/api/auth/register', data),
  login: (data: { username: string; password: string }) =>
    api.post('/api/auth/login', data),
};

export const booksAPI = {
  list: () => api.get<{ data: Book[] }>('/api/books'),
  create: (name: string) => api.post('/api/books', { name }),
  members: (id: string) => api.get<{ data: BookMember[] }>(`/api/books/${id}/members`),
  updateAlias: (bookId: string, userId: string, alias: string) =>
    api.put(`/api/books/${bookId}/members/${userId}`, { alias }),
  dailyRecords: (bookId: string, date: string) =>
    api.get<{ data: { todos: LedgerRecord[]; history: LedgerRecord[] } }>(
      `/api/books/${bookId}/records`,
      { params: { date } }
    ),
  invite: (bookId: string, invitee_username: string) =>
    api.post(`/api/books/${bookId}/invite`, { invitee_username }),
};

export const recordsAPI = {
  batch: (book_id: string, items: Omit<StagedItem, 'owner_username'>[]) =>
    api.post('/api/records/batch', { book_id, items }),
  update: (id: string, data: Partial<LedgerRecord>) =>
    api.put(`/api/records/${id}`, data),
  delete: (id: string) =>
    api.delete(`/api/records/${id}`),
};

export const invitationsAPI = {
  list: (status?: string) =>
    api.get<{ data: Invitation[] }>('/api/invitations', { params: status ? { status } : {} }),
  respond: (id: string, action: 'accepted' | 'rejected') =>
    api.post(`/api/invitations/${id}/respond`, { action }),
};

export const aiAPI = {
  parse: (book_id: string, input_text: string) =>
    api.post<{ data: { staged_items: StagedItem[] } }>('/api/ai/parse', {
      book_id,
      input_text,
    }, {
      timeout: 90000,
    }),
};

export const reportAPI = {
  summary: (params: { book_id: string; period: string; start: string; end: string }) =>
    api.get<{ data: ReportSummary }>('/api/report/summary', { params }),
};

export const configAPI = {
  getAll: () => api.get('/api/system-configs'),
  update: (type: 'system' | 'pricing', key: string, value: number) =>
    api.post('/api/config/update', { type, key, value }),
};

export const usersAPI = {
  search: (q: string) => api.get<{ data: User[] }>('/api/users/search', { params: { q } }),
  updateProfile: (data: { nickname?: string; password?: string }) =>
    api.put<{ data: { id: string; username: string; nickname: string } }>('/api/users/me', data),
};

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

export function getDisplayName(member: { nickname: string; alias?: string }): string {
  return member.alias && member.alias.trim() !== '' ? member.alias : member.nickname;
}

export function formatAmount(amount: number): string {
  return amount.toFixed(0);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: fmtDate(monday), end: fmtDate(sunday) };
}

export function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: fmtDate(start), end: fmtDate(end) };
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
