// 认证 store - 登录态管理
// accessToken/secretKey 仅内存存储；refreshToken/user 持久化到 localStorage
//
// 设计依据：Task 5 - JWT + RefreshToken 双令牌机制
// - accessToken：短期令牌（不持久化，安全考虑）
// - refreshToken：长期令牌（持久化，用于续期 accessToken）
// - secretKey：HMAC 签名密钥（不持久化，登录时下发，与 accessToken 同生命周期）
// - user：用户信息（持久化，用于 UI 展示）

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

/** 用户信息 */
export interface User {
  id: number
  username: string
  email: string
  phone?: string
  avatar?: string
  status?: string
  level?: number
  roles?: string[]
  createdAt?: string
  updatedAt?: string
}

/** 后端标准响应体 */
interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** /auth/refresh 响应数据 */
interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

/** API 基础地址 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

interface AuthState {
  /** 访问令牌（短期，仅内存） */
  accessToken: string | null
  /** 刷新令牌（长期，持久化） */
  refreshToken: string | null
  /** HMAC 签名密钥（仅内存，登录时下发） */
  secretKey: string | null
  /** 用户信息（持久化） */
  user: User | null
  /** 是否已认证（accessToken 存在即为 true） */
  isAuthenticated: boolean
  /** 是否正在加载（初始化/刷新中） */
  isLoading: boolean

  /** 设置认证信息（登录/注册成功后调用） */
  setAuth: (
    accessToken: string,
    refreshToken: string,
    secretKey: string,
    user: User
  ) => void
  /** 刷新 accessToken（调用 /auth/refresh），返回是否成功 */
  refreshAccessToken: () => Promise<boolean>
  /** 退出登录（调用 /auth/logout + 关闭本地 DB + 清除状态） */
  logout: () => Promise<void>
  /** 更新用户信息 */
  updateUser: (user: User) => void
  /** 设置 HMAC 密钥 */
  setSecretKey: (secretKey: string) => void
  /** 初始化：如果有 refreshToken 则自动刷新 accessToken */
  initialize: () => Promise<void>
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
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false

        try {
          // 使用原始 axios 调用，绕过 httpClient 拦截器避免 401 循环
          const resp = await axios.post<ApiResponse<RefreshResponse>>(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            { timeout: 10000, withCredentials: true }
          )
          if (resp.data?.code !== 0) return false

          const { accessToken: newAccess, refreshToken: newRefresh } =
            resp.data.data
          set((state) => ({
            accessToken: newAccess,
            refreshToken: newRefresh,
            isAuthenticated: true,
            isLoading: false,
            // 保留 secretKey 和 user（如果存在）
            secretKey: state.secretKey,
            user: state.user,
          }))
          return true
        } catch {
          // 刷新失败：清除认证状态
          set({
            accessToken: null,
            refreshToken: null,
            secretKey: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })
          return false
        }
      },

      logout: async () => {
        const { refreshToken } = get()
        // 调用后端登出（失败不阻塞前端清理）
        try {
          if (refreshToken) {
            await axios.post(
              `${API_BASE_URL}/auth/logout`,
              { refreshToken },
              { timeout: 5000, withCredentials: true }
            )
          }
        } catch {
          // 后端登出失败不影响前端清理
        }

        // 关闭本地数据库
        try {
          window.electronAPI?.db?.close?.()
        } catch {
          // 忽略 DB 关闭错误
        }

        // 清除状态
        set({
          accessToken: null,
          refreshToken: null,
          secretKey: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      },

      updateUser: (user) => set({ user }),

      setSecretKey: (secretKey) => set({ secretKey }),

      initialize: async () => {
        const { refreshToken, isLoading } = get()
        if (!refreshToken || isLoading) return

        set({ isLoading: true })
        await get().refreshAccessToken()
      },
    }),
    {
      name: 'auth-storage',
      // 仅持久化 refreshToken 和 user（安全考虑：不持久化 accessToken 和 secretKey）
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
)
