// 管理端认证 store - 独立于用户端 auth store
//
// 设计依据：Task 17 - 管理端三层守卫(前端部分)
// - token: 管理端访问令牌(独立存储,不与用户端 token 混淆)
// - expiresAt: 令牌过期时间(毫秒时间戳)
// - user: 管理员用户信息
// - permissions: 权限编码列表
// - hasPermission(code): 权限检查方法,供 PermissionGate 组件使用
//
// 持久化策略:token / expiresAt / user / permissions 全部持久化
// (管理端 token 较长期,且需支持刷新页面后保持登录态)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AdminUser, PermissionCode } from '@/types/admin-auth'

interface AdminAuthState {
  /** 管理端访问令牌 */
  token: string | null
  /** 令牌过期时间(毫秒时间戳) */
  expiresAt: number | null
  /** 管理员用户信息 */
  user: AdminUser | null
  /** 权限编码列表 */
  permissions: PermissionCode[]

  /** 设置认证信息(登录成功后调用) */
  setAdminAuth: (
    token: string,
    expiresAt: number,
    user: AdminUser,
    permissions: PermissionCode[]
  ) => void
  /** 退出登录(清除状态) */
  clearAdminAuth: () => void
  /** 检查是否已认证(token 存在且未过期) */
  isAuthenticated: () => boolean
  /** 检查是否拥有某权限 */
  hasPermission: (code: string) => boolean
  /** 更新管理员信息 */
  updateAdminUser: (user: AdminUser) => void
  /** 更新权限列表 */
  updatePermissions: (permissions: PermissionCode[]) => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      user: null,
      permissions: [],

      setAdminAuth: (token, expiresAt, user, permissions) => {
        set({ token, expiresAt, user, permissions })
      },

      clearAdminAuth: () => {
        set({ token: null, expiresAt: null, user: null, permissions: [] })
      },

      isAuthenticated: () => {
        const { token, expiresAt } = get()
        if (!token) return false
        if (expiresAt && Date.now() >= expiresAt) return false
        return true
      },

      hasPermission: (code) => {
        const { permissions } = get()
        return permissions.includes(code as PermissionCode)
      },

      updateAdminUser: (user) => set({ user }),

      updatePermissions: (permissions) => set({ permissions })
    }),
    {
      name: 'admin-auth-storage',
      // 全部持久化(管理端需支持刷新保持登录态)
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        user: state.user,
        permissions: state.permissions
      })
    }
  )
)
