import { create } from 'zustand';
import { getMeApi, loginApi, registerApi } from '@/services/auth.service';
import { AuthState } from '@/types/auth';

const TOKEN_KEY = 'brewlite_jwt_token';
let sessionRevision = 0;

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    const revision = ++sessionRevision;
    const storage = getStorage();
    if (!storage) return;
    const token = storage.getItem(TOKEN_KEY);
    if (!token) return;

    set({ isLoading: true, token, isAuthenticated: true });
    try {
      const user = await getMeApi(token);
      if (revision !== sessionRevision) return;
      set({ user, isLoading: false, isAuthenticated: true });
    } catch {
      if (revision !== sessionRevision) return;
      storage.removeItem(TOKEN_KEY);
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  login: async (email: string, password: string) => {
    const revision = ++sessionRevision;
    set({ isLoading: true, error: null });
    try {
      const response = await loginApi(email, password);
      if (revision !== sessionRevision) return false;
      const storage = getStorage();
      if (storage) {
        storage.setItem(TOKEN_KEY, response.accessToken);
      }
      set({
        token: response.accessToken,
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err) {
      if (revision !== sessionRevision) return false;
      const message =
        err instanceof Error ? err.message : 'Đăng nhập không thành công.';
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  register: async (name: string, email: string, password: string) => {
    const revision = ++sessionRevision;
    set({ isLoading: true, error: null });
    try {
      await registerApi(name, email, password);
      if (revision !== sessionRevision) return false;
      const storage = getStorage();
      if (storage) {
        storage.removeItem(TOKEN_KEY);
      }
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err) {
      if (revision !== sessionRevision) return false;
      const message =
        err instanceof Error ? err.message : 'Đăng ký không thành công.';
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  logout: () => {
    sessionRevision += 1;
    const storage = getStorage();
    if (storage) {
      storage.removeItem(TOKEN_KEY);
    }
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
