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

import { createBrowserRouter, Navigate } from 'react-router-dom'
import AdminLogin from '@/pages/Login'
import AdminLayout from '@/pages/Layout'
import { AdminRouteGuard } from '@/components/AdminRouteGuard'
import AdminDashboard from '@/pages/Dashboard'
import AdminRoles from '@/pages/Roles'
import AdminOperationLogs from '@/pages/OperationLogs'
import AdminUsers from '@/pages/Users'
import AdminUserLevels from '@/pages/Users/Levels'
import AdminUserCredits from '@/pages/Users/Credits'
import AdminUserOrders from '@/pages/Users/Orders'
import AdminUserDevices from '@/pages/Users/Devices'
import AdminApiKeyPool from '@/pages/ApiKeyPool'
import AdminApiKeyPoolStats from '@/pages/ApiKeyPool/Stats'
import AdminAgents from '@/pages/Agents'
import AdminAgentsReview from '@/pages/Agents/Review'
import AdminAgentsPricing from '@/pages/Agents/Pricing'
import AdminAgentsCategories from '@/pages/Agents/Categories'
import AdminWorkflows from '@/pages/Workflows'
import AdminWorkflowsReview from '@/pages/Workflows/Review'
import AdminWorkflowsStats from '@/pages/Workflows/Stats'
import AdminPlugins from '@/pages/Plugins'
import AdminPluginsReview from '@/pages/Plugins/Review'
import AdminPluginsSync from '@/pages/Plugins/Sync'
import AdminModels from '@/pages/Models'
import AdminFinanceTransactions from '@/pages/Finance/Transactions'
import AdminFinanceOrders from '@/pages/Finance/Orders'
import AdminFinanceInvoices from '@/pages/Finance/Invoices'
import AdminFinanceReconciliation from '@/pages/Finance/Reconciliation'
import AuditSensitiveWords from '@/pages/Audit/SensitiveWords'
import AuditAIConfig from '@/pages/Audit/AIConfig'
import AuditQueue from '@/pages/Audit/Queue'
import StatsOverview from '@/pages/Stats/Overview'
import StatsTrends from '@/pages/Stats/Trends'
import StatsRankings from '@/pages/Stats/Rankings'
import StatsRetention from '@/pages/Stats/Retention'
import AdminVersions from '@/pages/Versions'
import SystemConfig from '@/pages/System/Config'
import SystemTenant from '@/pages/System/Tenant'
import SystemAnnouncements from '@/pages/System/Announcements'

const router = createBrowserRouter(
  [
    // ===== 公开路由 =====
    { path: '/login', element: <AdminLogin /> },

    // ===== 受保护路由（AdminRouteGuard + AdminLayout 包裹）=====
    {
      path: '/',
      element: (
        <AdminRouteGuard>
          <AdminLayout />
        </AdminRouteGuard>
      ),
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        // 仪表盘 + 角色 + 操作日志
        { path: 'dashboard', element: <AdminDashboard /> },
        { path: 'roles', element: <AdminRoles /> },
        { path: 'operation-logs', element: <AdminOperationLogs /> },
        // 用户管理
        { path: 'users', element: <AdminUsers /> },
        { path: 'users/levels', element: <AdminUserLevels /> },
        { path: 'users/credits', element: <AdminUserCredits /> },
        { path: 'users/orders', element: <AdminUserOrders /> },
        { path: 'users/devices', element: <AdminUserDevices /> },
        // API Key 池
        { path: 'api-key-pool', element: <AdminApiKeyPool /> },
        { path: 'api-key-pool/stats', element: <AdminApiKeyPoolStats /> },
        // Agent 市场管理
        { path: 'agents', element: <AdminAgents /> },
        { path: 'agents/review', element: <AdminAgentsReview /> },
        { path: 'agents/pricing', element: <AdminAgentsPricing /> },
        { path: 'agents/categories', element: <AdminAgentsCategories /> },
        // 工作流模板管理
        { path: 'workflows', element: <AdminWorkflows /> },
        { path: 'workflows/review', element: <AdminWorkflowsReview /> },
        { path: 'workflows/stats', element: <AdminWorkflowsStats /> },
        // 插件管理
        { path: 'plugins', element: <AdminPlugins /> },
        { path: 'plugins/review', element: <AdminPluginsReview /> },
        { path: 'plugins/sync', element: <AdminPluginsSync /> },
        // 大模型配置
        { path: 'models', element: <AdminModels /> },
        // 积分财务管理
        { path: 'finance', element: <Navigate to="/finance/transactions" replace /> },
        { path: 'finance/transactions', element: <AdminFinanceTransactions /> },
        { path: 'finance/orders', element: <AdminFinanceOrders /> },
        { path: 'finance/invoices', element: <AdminFinanceInvoices /> },
        { path: 'finance/reconciliation', element: <AdminFinanceReconciliation /> },
        // 内容审核
        { path: 'audit', element: <Navigate to="/audit/queue" replace /> },
        { path: 'audit/sensitive-words', element: <AuditSensitiveWords /> },
        { path: 'audit/ai-config', element: <AuditAIConfig /> },
        { path: 'audit/queue', element: <AuditQueue /> },
        // 数据统计运营
        { path: 'stats', element: <Navigate to="/stats/overview" replace /> },
        { path: 'stats/overview', element: <StatsOverview /> },
        { path: 'stats/trends', element: <StatsTrends /> },
        { path: 'stats/rankings', element: <StatsRankings /> },
        { path: 'stats/retention', element: <StatsRetention /> },
        // 客户端版本管理
        { path: 'versions', element: <AdminVersions /> },
        // 系统配置
        { path: 'system', element: <Navigate to="/system/config" replace /> },
        { path: 'system/config', element: <SystemConfig /> },
        { path: 'system/tenant', element: <SystemTenant /> },
        { path: 'system/announcements', element: <SystemAnnouncements /> }
      ]
    },

    // ===== 兜底重定向 =====
    { path: '*', element: <Navigate to="/" replace /> }
  ],
  { basename: '/admin' }
)

export default router
