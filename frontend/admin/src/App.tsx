// 管理后台根组件 - 全局配置与路由挂载
//
// antd dark 主题 + zhCN locale + RouterProvider
// 挂载时若存在持久化 token 则调用 getAdminProfile 验证并刷新管理员信息

import { useEffect } from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import router from '@/router'
import { useAdminAuthStore } from '@/store/admin-auth'
import { getAdminProfile } from '@/api/admin-auth-api'
import '@/styles/global.css'

export default function App() {
  // 启动时验证持久化 token
  useEffect(() => {
    const store = useAdminAuthStore.getState()
    if (!store.token) return
    // token 已过期 → 清除
    if (!store.isAuthenticated()) {
      store.clearAdminAuth()
      return
    }
    // token 存在且未过期 → 调用 profile 接口验证并刷新信息
    getAdminProfile()
      .then((data) => {
        store.updateAdminUser(data.user)
        store.updatePermissions(data.permissions)
      })
      .catch(() => {
        // 验证失败(token 实际无效) → 清除登录态
        store.clearAdminAuth()
      })
  }, [])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 8,
          borderRadiusLG: 12,
          colorBgLayout: '#0f172a',
          fontSize: 14,
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
