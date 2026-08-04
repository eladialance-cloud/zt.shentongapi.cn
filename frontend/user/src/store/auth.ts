// 认证状态管理 (Zustand)
// 对齐开发文档-前端开发指南.md 3.2 状态管理：Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;

  login: (accessToken: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  /** access token 续期后同步（不清理 socket） */
  refreshAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      // 登录前清理可能残留的旧状态
      // refreshToken 通过 HttpOnly Cookie 管理，前端不再持有明文
      login: (accessToken, user) => {
        set({ accessToken, user, isAuthenticated: true });
      },

      // 登出清理状态
      logout: () => {
        set({
          accessToken: null,
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
      // refreshToken 不再持久化（由 HttpOnly Cookie 管理）
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        // accessToken 不持久化，刷新页面时通过 refreshToken 重新获取
      }),
    }
  )
);
