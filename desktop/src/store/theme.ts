
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  mode: 'dark' | 'light'
  /** 主色 */
  primaryColor: string
  setMode: (mode: 'dark' | 'light') => void
  setPrimaryColor: (color: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      primaryColor: '#00d4ff',
      setMode: (mode) => set({ mode }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
    }),
    {
      name: 'theme-store',
    }
  )
)

export default useThemeStore
