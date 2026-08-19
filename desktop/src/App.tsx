// 应用根组件 - 全局配置与路由挂载
// v2：Kimi 风格主题应用 — system/light/dark + data-theme 驱动 CSS 变量

import { useEffect, useMemo, useState } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import router from '@/router'
import { useSettingsStore, resolveThemeMode, systemPrefersDark } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { fetchLlmProxyKey } from '@/api/chat-api'
import { syncService } from '@/api/sync-service'
import { lightTheme, darkTheme } from '@/theme/antd-theme'

export default function App() {
  const themeMode = useSettingsStore((s) => s.theme)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const initialize = useAuthStore((s) => s.initialize)

  // 跟随系统深色模式
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // 当前有效主题（system 跟随系统）
  const effectiveMode = useMemo(
    () => resolveThemeMode(themeMode, systemDark),
    [themeMode, systemDark]
  )

  // data-theme 驱动 CSS 变量切换（design-tokens.css 双色板）
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveMode
  }, [effectiveMode])

  // 应用启动时：如果有持久化的 refreshToken，自动刷新 accessToken
  useEffect(() => {
    void initialize()
  }, [initialize])

  // 登录态变化 → 启动/停止离线同步服务（网络恢复自动补传 local_sync_queue）
  const accessToken = useAuthStore((s) => s.accessToken)
  useEffect(() => {
    if (accessToken) {
      syncService.init()
    } else {
      syncService.destroy()
    }
  }, [accessToken])

  // 登录态变化 → 同步用户 llm-proxy 静态 Key 到主进程（注入 OpenClaw，供应商 Key 在服务器）
  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      const api = window.electronAPI?.openclawChat
      if (!accessToken) {
        api?.setProxyKey?.('')
        return
      }
      try {
        const { llmProxyKey } = await fetchLlmProxyKey()
        if (!cancelled) api?.setProxyKey?.(llmProxyKey)
      } catch (err) {
        console.error('[App] 获取 llm-proxy Key 失败（OpenClaw 对话将不可用）:', err)
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={effectiveMode === 'dark' ? darkTheme : lightTheme}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
