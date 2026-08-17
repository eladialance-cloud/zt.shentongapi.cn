// 应用设置 store - 主题等全局设置
// K3 修复：添加 persist 中间件持久化到 localStorage，避免重启后设置丢失
// v2：主题支持 system / light / dark 三态（跟随系统 + 手动开关）

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'system' | 'light' | 'dark'

interface SettingsState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

/** 解析当前有效主题（system 时跟随操作系统） */
export function resolveThemeMode(
  mode: ThemeMode,
  systemDark: boolean
): 'dark' | 'light' {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}

/** 系统是否处于深色模式 */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      toggleTheme: () =>
        set((s) => {
          const effective = resolveThemeMode(s.theme, systemPrefersDark())
          return { theme: effective === 'dark' ? 'light' : 'dark' }
        }),
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'settings-store',
      // 仅持久化 theme 字段，函数不需要持久化
      partialize: (state) => ({ theme: state.theme })
    }
  )
)

export default useSettingsStore
