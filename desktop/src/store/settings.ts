// 应用设置 store - 主题等全局设置
// K3 修复：添加 persist 中间件持久化到 localStorage，避免重启后设置丢失

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark'

interface SettingsState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'settings-store',
      // 仅持久化 theme 字段，函数不需要持久化
      partialize: (state) => ({ theme: state.theme })
    }
  )
)
