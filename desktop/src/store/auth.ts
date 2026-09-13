// 认证 store - 登录态管理
// accessToken/secretKey 仅内存存储；user 持久化到 localStorage（非敏感，仅 UI 展示）
// refreshToken（凭据，S-53）改由主进程落 userData 并走系统安全存储加密：
// 主进程拒绝写入时降级为「仅本次会话有效」（重启需重新登录），不再写 localStorage 明文。
//
// 设计依据：Task 5 - JWT + RefreshToken 双令牌机制
// - accessToken：短期令牌（不持久化，安全考虑）
// - refreshToken：长期令牌（主进程加密存储，用于续期 accessToken）
// - secretKey：HMAC 签名密钥（不持久化，登录时下发，与 accessToken 同生命周期）
// - user：用户信息（持久化，用于 UI 展示）

import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

/** 用户信息 */
export interface User {
  id: number;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  status?: string;
  level?: number;
  roles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** 后端标准响应体 */
interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** /auth/refresh 响应数据 */
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** API 基础地址 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

/** 同步最新 token 到主进程 auth.json（n8n-run-workflow 等工具卡读取） */
function syncAuthToken(token: string | null | undefined): void {
  try {
    window.electronAPI?.hermesChat?.syncAuth?.(token || "");
  } catch {
    // 非 Electron 环境忽略
  }
}

/**
 * 刷新令牌持久化（安全审计 S-53）：交主进程按策略落盘/清除。
 * 主进程拒绝（无系统安全存储 / 键名或体积不合法）时静默降级为「仅本次会话有效」。
 */
async function persistRefreshToken(token: string | null): Promise<void> {
  try {
    const api = window.electronAPI?.authToken;
    if (!api) return;
    if (token) await api.save(token);
    else await api.clear();
  } catch {
    // 落盘失败不阻塞登录流程：内存态仍可用，重启后需重新登录
  }
}

/** 从主进程读回刷新令牌（安全审计 S-53，无则 null） */
async function loadRefreshToken(): Promise<string | null> {
  try {
    const api = window.electronAPI?.authToken;
    if (!api) return null;
    const res = await api.load();
    return res.ok ? res.value : null;
  } catch {
    return null;
  }
}

interface AuthState {
  /** 访问令牌（短期，仅内存） */
  accessToken: string | null;
  /** 刷新令牌（长期，持久化） */
  refreshToken: string | null;
  /** HMAC 签名密钥（仅内存，登录时下发） */
  secretKey: string | null;
  /** 用户信息（持久化） */
  user: User | null;
  /** 是否已认证（accessToken 存在即为 true） */
  isAuthenticated: boolean;
  /** 是否正在加载（初始化/刷新中） */
  isLoading: boolean;

  /** 设置认证信息（登录/注册成功后调用） */
  setAuth: (
    accessToken: string,
    refreshToken: string,
    secretKey: string,
    user: User,
  ) => void;
  /** 刷新 accessToken（调用 /auth/refresh），返回是否成功 */
  refreshAccessToken: () => Promise<boolean>;
  /** 退出登录（调用 /auth/logout + 关闭本地 DB + 清除状态） */
  logout: () => Promise<void>;
  /** 更新用户信息 */
  updateUser: (user: User) => void;
  /** 设置 HMAC 密钥 */
  setSecretKey: (secretKey: string) => void;
  /** 初始化：如果有 refreshToken 则自动刷新 accessToken */
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      secretKey: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (accessToken, refreshToken, secretKey, user) => {
        set({
          accessToken,
          refreshToken,
          secretKey,
          user,
          isAuthenticated: true,
        });
        syncAuthToken(accessToken);
        void persistRefreshToken(refreshToken);
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          // 使用原始 axios 调用，绕过 httpClient 拦截器避免 401 循环
          const resp = await axios.post<ApiResponse<RefreshResponse>>(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            { timeout: 10000, withCredentials: true },
          );
          if (resp.data?.code !== 0) return false;

          const { accessToken: newAccess, refreshToken: newRefresh } =
            resp.data.data;
          set((state) => ({
            accessToken: newAccess,
            refreshToken: newRefresh,
            isAuthenticated: true,
            isLoading: false,
            // 保留 secretKey 和 user（如果存在）
            secretKey: state.secretKey,
            user: state.user,
          }));
          syncAuthToken(newAccess);
          void persistRefreshToken(newRefresh);
          return true;
        } catch {
          // 刷新失败：清除认证状态
          set({
            accessToken: null,
            refreshToken: null,
            secretKey: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
          void persistRefreshToken(null);
          return false;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        // 调用后端登出（失败不阻塞前端清理）
        try {
          if (refreshToken) {
            await axios.post(
              `${API_BASE_URL}/auth/logout`,
              { refreshToken },
              { timeout: 5000, withCredentials: true },
            );
          }
        } catch {
          // 后端登出失败不影响前端清理
        }

        // 关闭本地数据库
        try {
          window.electronAPI?.db?.close?.();
        } catch {
          // 忽略 DB 关闭错误
        }

        // 清除本地凭据（主进程加密存储，S-53）
        await persistRefreshToken(null);

        // 清除状态
        set({
          accessToken: null,
          refreshToken: null,
          secretKey: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      updateUser: (user) => set({ user }),

      setSecretKey: (secretKey) => set({ secretKey }),

      initialize: async () => {
        const { isLoading } = get();
        if (isLoading) return;

        set({ isLoading: true });
        // S-53：优先从主进程加密存储水合 refreshToken；内存态兼容旧版本一次性残留
        // （partialize 不再写 refreshToken，紧随其后的状态变更会把 localStorage 明文清掉）
        let token = await loadRefreshToken();
        if (!token) token = get().refreshToken;
        if (!token) {
          set({ isLoading: false });
          return;
        }
        set({ refreshToken: token });
        await persistRefreshToken(token);
        await get().refreshAccessToken();
      },
    }),
    {
      name: "auth-storage",
      // 仅持久化 user（非敏感，UI 展示用）：refreshToken 走主进程加密存储（S-53），
      // accessToken/secretKey 仅内存。
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);

