// 应用设置 store - 主题等全局设置

import { create } from 'zustand'

type ThemeMode = 'light' | 'dark'

interface SettingsState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'light',
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setTheme: (theme) => set({ theme })
}))
