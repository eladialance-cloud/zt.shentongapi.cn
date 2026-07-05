// 管理端路由守卫组件
//
// 三层守卫(前端部分):
// 1. AdminRouteGuard: 检查 adminStore.token 是否存在且未过期,否则重定向 /login
//    另检查 mustChangePassword:若为 true 且当前不在 /change-password,强制重定向改密页
// 2. PermissionGate: 检查 adminStore.permissions 是否包含指定权限,否则渲染 antd Result 403
// 3. hasPermission(code): store 提供的权限检查方法
//
// 注意：路由使用 createBrowserRouter({ basename: '/admin' })，因此导航路径
// 不再包含 /admin 前缀（basename 会自动拼接）。

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAdminAuthStore } from '@/store/admin-auth'

interface AdminRouteGuardProps {
  children: ReactNode
}

/**
 * 管理端路由守卫:未登录或 token 过期则重定向到 /login
 * 已登录但 mustChangePassword=true 且不在改密页,则强制重定向到 /change-password
 */
export function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated)
  const mustChangePassword = useAdminAuthStore((s) => s.mustChangePassword)
  const location = useLocation()
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <>{children}</>
}

interface PermissionGateProps {
  /** 需要的权限编码 */
  permission: string
  children: ReactNode
}

/**
 * 权限守卫:无指定权限则渲染 403 Result
 */
export function PermissionGate({ permission, children }: PermissionGateProps) {
  const hasPermission = useAdminAuthStore((s) => s.hasPermission)
  const navigate = useNavigate()
  if (!hasPermission(permission)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="抱歉,您没有权限访问此页面。"
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            返回首页
          </Button>
        }
      />
    )
  }
  return <>{children}</>
}

export default AdminRouteGuard
