import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useBookStore } from './bookStore';

interface AuthUser {
  id: string;
  username: string;
  nickname: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  setAuth: async (token, user) => {
    await SecureStore.setItemAsync('token', token);
    await SecureStore.setItemAsync('user', JSON.stringify(user));
    set({ token, user });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    useBookStore.getState().reset();
    set({ token: null, user: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const userStr = await SecureStore.getItemAsync('user');
      if (token && userStr) {
        set({ token, user: JSON.parse(userStr) });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
