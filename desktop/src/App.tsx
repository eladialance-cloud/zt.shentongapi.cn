// 应用根组件 - 全局配置与路由挂载

import { useEffect } from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import router from '@/router'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { fetchLlmProxyKey } from '@/api/chat-api'
import { antdTheme as appTheme } from '@/theme/antd-theme'

export default function App() {
  const themeMode = useSettingsStore((s) => s.theme)
  const initialize = useAuthStore((s) => s.initialize)

  // 应用启动时：如果有持久化的 refreshToken，自动刷新 accessToken
  useEffect(() => {
    void initialize()
  }, [initialize])

  // 登录态变化 → 同步用户 llm-proxy 静态 Key 到主进程（注入 OpenClaw，供应商 Key 在服务器）
  const accessToken = useAuthStore((s) => s.accessToken)
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
      theme={{
        algorithm:
          themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        ...appTheme,
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
