// 应用根组件 - 全局配置与路由挂载

import { useEffect } from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import router from '@/router'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'

export default function App() {
  const themeMode = useSettingsStore((s) => s.theme)
  const initialize = useAuthStore((s) => s.initialize)

  // 应用启动时：如果有持久化的 refreshToken，自动刷新 accessToken
  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm:
          themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 8,
          borderRadiusLG: 12,
          colorBgLayout: '#f1f5f9',
          fontSize: 14
        }
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
