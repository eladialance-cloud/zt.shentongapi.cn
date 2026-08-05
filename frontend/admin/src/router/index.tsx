// 管理后台路由配置
//
// 部署在 /admin/* 子路径，使用 createBrowserRouter + basename: '/admin'
// 因此所有路由 path 与 navigate 目标均不含 /admin 前缀（basename 自动拼接）
//
// 结构：
//   /login                 公开：管理员登录
//   /                      受保护：AdminRouteGuard + AdminLayout 包裹
//     index  → /dashboard
//     dashboard / users / api-key-pool / agents / workflows / plugins / models
//     finance / audit / stats / versions / system / roles / operation-logs
//   *                      兜底重定向到 /
//
// 路由懒加载：所有页面组件使用 React.lazy + Suspense 延迟加载
// 首次访问对应路由时才下载对应 chunk，减小首屏体积

import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { AdminRouteGuard } from '@/components/AdminRouteGuard'

// ===== 懒加载页面组件 =====
const AdminLogin = lazy(() => import('@/pages/Login'))
const AdminLayout = lazy(() => import('@/pages/Layout'))
const AdminChangePassword = lazy(() => import('@/pages/ChangePassword'))
const AdminDashboard = lazy(() => import('@/pages/Dashboard'))
const AdminRoles = lazy(() => import('@/pages/Roles'))
const AdminOperationLogs = lazy(() => import('@/pages/OperationLogs'))
const AdminUsers = lazy(() => import('@/pages/Users'))
const AdminUserLevels = lazy(() => import('@/pages/Users/Levels'))
const AdminUserCredits = lazy(() => import('@/pages/Users/Credits'))
const AdminUserOrders = lazy(() => import('@/pages/Users/Orders'))
const AdminUserDevices = lazy(() => import('@/pages/Users/Devices'))
const AdminAgents = lazy(() => import('@/pages/Agents'))
const AdminWorkflows = lazy(() => import('@/pages/Workflows'))
// AdminWorkflowsReview / AdminWorkflowsStats 已合并到 Workflows/index.tsx Tab 中
const AdminPlugins = lazy(() => import('@/pages/Plugins'))
const AdminPluginsReview = lazy(() => import('@/pages/Plugins/Review'))
const AdminPluginsSync = lazy(() => import('@/pages/Plugins/Sync'))
const AdminModels = lazy(() => import('@/pages/Models'))
const AdminFinanceTransactions = lazy(() => import('@/pages/Finance/Transactions'))
const AdminFinanceOrders = lazy(() => import('@/pages/Finance/Orders'))
const AdminFinanceInvoices = lazy(() => import('@/pages/Finance/Invoices'))
const AdminFinanceReconciliation = lazy(() => import('@/pages/Finance/Reconciliation'))
const AdminRechargePlans = lazy(() => import('@/pages/Finance/RechargePlans'))
const AdminPaymentConfig = lazy(() => import('@/pages/Finance/PaymentConfig'))
const AuditSensitiveWords = lazy(() => import('@/pages/Audit/SensitiveWords'))
const AuditAIConfig = lazy(() => import('@/pages/Audit/AIConfig'))
const AuditQueue = lazy(() => import('@/pages/Audit/Queue'))
const StatsOverview = lazy(() => import('@/pages/Stats/Overview'))
const StatsTrends = lazy(() => import('@/pages/Stats/Trends'))
const StatsRankings = lazy(() => import('@/pages/Stats/Rankings'))
const StatsRetention = lazy(() => import('@/pages/Stats/Retention'))
const AdminVersions = lazy(() => import('@/pages/Versions'))
const SystemConfig = lazy(() => import('@/pages/System/Config'))
const SystemTenant = lazy(() => import('@/pages/System/Tenant'))
const SystemAnnouncements = lazy(() => import('@/pages/System/Announcements'))
const LandingBlocks = lazy(() => import('@/pages/Content/LandingBlocks'))
const CommunityPostReview = lazy(() => import('@/pages/Community/PostReview'))
const CommunityChannels = lazy(() => import('@/pages/Community/Channels'))
const CommunityTags = lazy(() => import('@/pages/Community/Tags'))
const AdminKnowledgeBases = lazy(() => import('@/pages/Content/KnowledgeBases'))
const AdminReview = lazy(() => import('@/pages/Review'))
const AdminMcp = lazy(() => import('@/pages/Mcp'))
const AdminInfraHub = lazy(() => import('@/pages/InfraHub'))
const AdminPlans = lazy(() => import('@/pages/Plans'))
const AdminApiKeyPool = lazy(() => import('@/pages/ApiKeyPool'))

/** Suspense fallback：Ant Design Spin 居中加载 */
const SuspenseFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <Spin size="large" tip="加载中..." />
  </div>
)

/** Suspense 包裹组件 */
function withSuspense(element: React.ReactElement) {
  return <Suspense fallback={SuspenseFallback}>{element}</Suspense>;
}

const router = createBrowserRouter(
  [
    // ===== 公开路由 =====
    { path: '/login', element: withSuspense(<AdminLogin />) },

    // ===== 受保护路由：强制改密页（独立全屏页，不走 AdminLayout）=====
    {
      path: '/change-password',
      element: (
        <AdminRouteGuard>
          {withSuspense(<AdminChangePassword />)}
        </AdminRouteGuard>
      )
    },

    // ===== 受保护路由（AdminRouteGuard + AdminLayout 包裹）=====
    {
      path: '/',
      element: (
        <AdminRouteGuard>
          {withSuspense(<AdminLayout />)}
        </AdminRouteGuard>
      ),
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        // 仪表盘 + 角色 + 操作日志
        { path: 'dashboard', element: withSuspense(<AdminDashboard />) },
        { path: 'roles', element: withSuspense(<AdminRoles />) },
        { path: 'operation-logs', element: withSuspense(<AdminOperationLogs />) },
        // 用户管理
        { path: 'users', element: withSuspense(<AdminUsers />) },
        { path: 'users/levels', element: withSuspense(<AdminUserLevels />) },
        { path: 'users/credits', element: withSuspense(<AdminUserCredits />) },
        { path: 'users/orders', element: withSuspense(<AdminUserOrders />) },
        { path: 'users/devices', element: withSuspense(<AdminUserDevices />) },
        // Key 池
        { path: 'api-key-pool', element: withSuspense(<AdminApiKeyPool />) },
        // Agent 市场管理
        { path: 'agents', element: withSuspense(<AdminAgents />) },
        // 工作流模板管理
        { path: 'workflows', element: withSuspense(<AdminWorkflows />) },
        // 插件管理
        { path: 'plugins', element: withSuspense(<AdminPlugins />) },
        { path: 'plugins/review', element: withSuspense(<AdminPluginsReview />) },
        { path: 'plugins/sync', element: withSuspense(<AdminPluginsSync />) },
        // 大模型配置
        { path: 'models', element: withSuspense(<AdminModels />) },
        // 积分财务管理
        { path: 'finance', element: <Navigate to="/finance/transactions" replace /> },
        { path: 'finance/transactions', element: withSuspense(<AdminFinanceTransactions />) },
        { path: 'finance/orders', element: withSuspense(<AdminFinanceOrders />) },
        { path: 'finance/invoices', element: withSuspense(<AdminFinanceInvoices />) },
        { path: 'finance/reconciliation', element: withSuspense(<AdminFinanceReconciliation />) },
        { path: 'finance/recharge-plans', element: withSuspense(<AdminRechargePlans />) },
        { path: 'finance/payment-config', element: withSuspense(<AdminPaymentConfig />) },
        // 内容审核
        { path: 'audit', element: <Navigate to="/audit/queue" replace /> },
        { path: 'audit/sensitive-words', element: withSuspense(<AuditSensitiveWords />) },
        { path: 'audit/ai-config', element: withSuspense(<AuditAIConfig />) },
        { path: 'audit/queue', element: withSuspense(<AuditQueue />) },
        // 数据统计运营
        { path: 'stats', element: <Navigate to="/stats/overview" replace /> },
        { path: 'stats/overview', element: withSuspense(<StatsOverview />) },
        { path: 'stats/trends', element: withSuspense(<StatsTrends />) },
        { path: 'stats/rankings', element: withSuspense(<StatsRankings />) },
        { path: 'stats/retention', element: withSuspense(<StatsRetention />) },
        // 客户端版本管理
        { path: 'versions', element: withSuspense(<AdminVersions />) },
        // 内容管理
        { path: 'content', element: <Navigate to="/content/landing" replace /> },
        { path: 'content/landing', element: withSuspense(<LandingBlocks />) },
        { path: 'content/knowledge-bases', element: withSuspense(<AdminKnowledgeBases />) },
        // 社区管理
        { path: 'community', element: <Navigate to="/community/review" replace /> },
        { path: 'community/review', element: withSuspense(<CommunityPostReview />) },
        { path: 'community/channels', element: withSuspense(<CommunityChannels />) },
        { path: 'community/tags', element: withSuspense(<CommunityTags />) },
        // 系统配置
        { path: 'system', element: <Navigate to="/system/config" replace /> },
        { path: 'system/config', element: withSuspense(<SystemConfig />) },
        { path: 'system/tenant', element: withSuspense(<SystemTenant />) },
        { path: 'system/announcements', element: withSuspense(<SystemAnnouncements />) },
        // 审核中心 / MCP / 基础设施 / 套餐
        { path: 'review', element: withSuspense(<AdminReview />) },
        { path: 'mcp', element: withSuspense(<AdminMcp />) },
        { path: 'infra', element: withSuspense(<AdminInfraHub />) },
        { path: 'plans', element: withSuspense(<AdminPlans />) }
      ]
    },

    // ===== 兜底重定向 =====
    { path: '*', element: <Navigate to="/" replace /> }
  ],
  { basename: '/admin' }
)

export default router
