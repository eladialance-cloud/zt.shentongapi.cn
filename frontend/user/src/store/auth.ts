// 认证状态管理 (Zustand)
// 对齐开发文档-前端开发指南.md 3.2 状态管理：Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;

  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  /** access token 续期后同步（不清理 socket） */
  refreshAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      // 登录前清理可能残留的旧状态
      login: (accessToken, refreshToken, user) => {
        set({ accessToken, refreshToken, user, isAuthenticated: true });
      },

      // 登出清理状态
      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user) => set({ user }),

      // refresh 续期专用：仅更新 accessToken，不打断 socket 连接
      // socket 鉴权刷新由重连或显式 disconnectSocket 处理
      refreshAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'auth-storage',
      // 持久化 isAuthenticated 避免刷新页面丢失登录态
      // 配合 ProtectedRoute 的 token 过期预校验，过期会被踢登录
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
