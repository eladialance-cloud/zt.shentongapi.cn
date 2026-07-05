// 路由配置
// 单页 Landing 站点:仅 /、/login、/register 三条路由
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

// 路由懒加载
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Landing = lazy(() => import('@/pages/Landing'));

/** 懒加载包裹 */
function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>加载中...</div>}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(<Landing />),
  },
  {
    path: '/login',
    element: withSuspense(<Login />),
  },
  {
    path: '/register',
    element: withSuspense(<Register />),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
