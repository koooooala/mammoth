import { create } from 'zustand';
import { StagedItem } from '@/lib/api';

interface StagingState {
  items: StagedItem[];
  bookId: string | null;
  setItems: (items: StagedItem[], bookId: string) => void;
  updateItem: (index: number, patch: Partial<StagedItem>) => void;
  removeItem: (index: number) => void;
  clear: () => void;
}

export const useStagingStore = create<StagingState>((set) => ({
  items: [],
  bookId: null,

  setItems: (items, bookId) => set({ items, bookId }),

  updateItem: (index, patch) =>
    set((s) => {
      const items = [...s.items];
      items[index] = { ...items[index], ...patch };
      return { items };
    }),

  removeItem: (index) =>
    set((s) => {
      const items = [...s.items];
      items.splice(index, 1);
      return { items };
    }),

  clear: () => set({ items: [], bookId: null }),
}));
