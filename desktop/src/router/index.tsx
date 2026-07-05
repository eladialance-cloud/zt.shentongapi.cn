// 路由配置
// 默认路由：onboarding_completed=false 重定向到 /onboarding，否则到 /dashboard
// 管理端路由前缀 /admin/*，使用 AdminRouteGuard + AdminLayout 包裹
// Task 34: 用户端已认证路由使用 MainLayout 包裹（顶栏+侧边栏+内容区+底栏）

import { createHashRouter, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import Chat from '@/pages/Chat'
import Credits from '@/pages/Credits'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import WorkflowList from '@/pages/Workflow'
import WorkflowDetail from '@/pages/Workflow/Detail'
import WorkflowEditor from '@/pages/Workflow/Editor'
import PluginMarket from '@/pages/Plugin'
import InstalledPlugins from '@/pages/Plugin/Installed'
import PluginLogs from '@/pages/Plugin/Logs'
import KnowledgeList from '@/pages/Knowledge'
import KnowledgeDocuments from '@/pages/Knowledge/Documents'
import KnowledgeSearch from '@/pages/Knowledge/Search'
import AgentCreatorList from '@/pages/AgentCreator'
import AgentCreatorCreate from '@/pages/AgentCreator/Create'
import AgentCreatorRevenue from '@/pages/AgentCreator/Revenue'
import HermesList from '@/pages/Hermes'
import HermesDetail from '@/pages/Hermes/Detail'
import HermesSkillMarket from '@/pages/Hermes/SkillMarket'
import OPCTeamList from '@/pages/OPC'
import OPCTeamDetail from '@/pages/OPC/Detail'
import OPCBoard from '@/pages/OPC/Board'
import Settings from '@/pages/Settings'
import ServiceManager from '@/pages/ServiceManager'
import MainLayout from '@/components/MainLayout'
import { useOnboardingStore, useAuthStore } from '@/store'

// 管理端页面导入
import AdminLogin from '@/pages/admin/Login'
import AdminLayout from '@/pages/admin/Layout'
import { AdminRouteGuard } from '@/pages/admin/components/AdminRouteGuard'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminRoles from '@/pages/admin/Roles'
import AdminOperationLogs from '@/pages/admin/OperationLogs'
import AdminUsers from '@/pages/admin/Users'
import AdminUserLevels from '@/pages/admin/Users/Levels'
import AdminUserCredits from '@/pages/admin/Users/Credits'
import AdminUserOrders from '@/pages/admin/Users/Orders'
import AdminUserDevices from '@/pages/admin/Users/Devices'
import AdminApiKeyPool from '@/pages/admin/ApiKeyPool'
import AdminApiKeyPoolStats from '@/pages/admin/ApiKeyPool/Stats'
import AdminAgents from '@/pages/admin/Agents'
import AdminAgentsReview from '@/pages/admin/Agents/Review'
import AdminAgentsPricing from '@/pages/admin/Agents/Pricing'
import AdminAgentsCategories from '@/pages/admin/Agents/Categories'
import AdminWorkflows from '@/pages/admin/Workflows'
import AdminWorkflowsReview from '@/pages/admin/Workflows/Review'
import AdminWorkflowsStats from '@/pages/admin/Workflows/Stats'
import AdminPlugins from '@/pages/admin/Plugins'
import AdminPluginsReview from '@/pages/admin/Plugins/Review'
import AdminPluginsSync from '@/pages/admin/Plugins/Sync'
import AdminModels from '@/pages/admin/Models'
import AdminFinanceTransactions from '@/pages/admin/Finance/Transactions'
import AdminFinanceOrders from '@/pages/admin/Finance/Orders'
import AdminFinanceInvoices from '@/pages/admin/Finance/Invoices'
import AdminFinanceReconciliation from '@/pages/admin/Finance/Reconciliation'
import AuditSensitiveWords from '@/pages/admin/Audit/SensitiveWords'
import AuditAIConfig from '@/pages/admin/Audit/AIConfig'
import AuditQueue from '@/pages/admin/Audit/Queue'
import StatsOverview from '@/pages/admin/Stats/Overview'
import StatsTrends from '@/pages/admin/Stats/Trends'
import StatsRankings from '@/pages/admin/Stats/Rankings'
import StatsRetention from '@/pages/admin/Stats/Retention'
import AdminVersions from '@/pages/admin/Versions'
import SystemConfig from '@/pages/admin/System/Config'
import SystemTenant from '@/pages/admin/System/Tenant'
import SystemAnnouncements from '@/pages/admin/System/Announcements'

function RootRedirect() {
  const completed = useOnboardingStore((s) => s.completed)
  return <Navigate to={completed ? '/dashboard' : '/onboarding'} replace />
}

/**
 * 用户端路由守卫：未登录跳转 /login
 * 检查 authStore.isAuthenticated（accessToken 存在即为 true）
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const router = createHashRouter([
  // 根路由：根据引导状态重定向
  { path: '/', element: <RootRedirect /> },

  // ===== 公开路由（不使用 MainLayout）=====
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },

  // ===== 用户端已认证路由（MainLayout 包裹）=====
  {
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/chat', element: <Chat /> },
      { path: '/credits', element: <Credits /> },
      // ===== Task 9: 工作流 =====
      { path: '/workflow', element: <WorkflowList /> },
      { path: '/workflow/editor', element: <WorkflowEditor /> },
      { path: '/workflow/:id', element: <WorkflowDetail /> },
      // ===== Task 10: 插件 =====
      { path: '/plugins', element: <PluginMarket /> },
      { path: '/plugins/installed', element: <InstalledPlugins /> },
      { path: '/plugins/logs', element: <PluginLogs /> },
      // ===== Task 11: 知识库 =====
      { path: '/knowledge', element: <KnowledgeList /> },
      { path: '/knowledge/:id/documents', element: <KnowledgeDocuments /> },
      { path: '/knowledge/:id/search', element: <KnowledgeSearch /> },
      // ===== Task 12: Agent 创建 =====
      { path: '/creator', element: <AgentCreatorList /> },
      { path: '/creator/create', element: <AgentCreatorCreate /> },
      { path: '/creator/:id/edit', element: <AgentCreatorCreate /> },
      { path: '/creator/revenue', element: <AgentCreatorRevenue /> },
      // ===== Task 13: Hermes =====
      { path: '/hermes', element: <HermesList /> },
      { path: '/hermes/skills', element: <HermesSkillMarket /> },
      { path: '/hermes/:id', element: <HermesDetail /> },
      // ===== Task 14: OPC =====
      { path: '/opc', element: <OPCTeamList /> },
      { path: '/opc/:id', element: <OPCTeamDetail /> },
      { path: '/opc/:id/board', element: <OPCBoard /> },
      // ===== Task 15: 个人设置 =====
      { path: '/settings', element: <Settings /> },
      // ===== Task 16: 服务管理 =====
      { path: '/services', element: <ServiceManager /> }
    ]
  },

  // ===== 管理端（Task 17-28，独立布局，不使用 MainLayout）=====
  { path: '/admin/login', element: <AdminLogin /> },
  {
    path: '/admin',
    element: (
      <AdminRouteGuard>
        <AdminLayout />
      </AdminRouteGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      // Task 17: 仪表盘 + 角色 + 操作日志
      { path: 'dashboard', element: <AdminDashboard /> },
      { path: 'roles', element: <AdminRoles /> },
      { path: 'operation-logs', element: <AdminOperationLogs /> },
      // Task 18: 用户管理
      { path: 'users', element: <AdminUsers /> },
      { path: 'users/levels', element: <AdminUserLevels /> },
      { path: 'users/credits', element: <AdminUserCredits /> },
      { path: 'users/orders', element: <AdminUserOrders /> },
      { path: 'users/devices', element: <AdminUserDevices /> },
      // Task 19: API Key 池
      { path: 'api-key-pool', element: <AdminApiKeyPool /> },
      { path: 'api-key-pool/stats', element: <AdminApiKeyPoolStats /> },
      // Task 20: Agent 市场管理
      { path: 'agents', element: <AdminAgents /> },
      { path: 'agents/review', element: <AdminAgentsReview /> },
      { path: 'agents/pricing', element: <AdminAgentsPricing /> },
      { path: 'agents/categories', element: <AdminAgentsCategories /> },
      // Task 21: 工作流模板管理
      { path: 'workflows', element: <AdminWorkflows /> },
      { path: 'workflows/review', element: <AdminWorkflowsReview /> },
      { path: 'workflows/stats', element: <AdminWorkflowsStats /> },
      // Task 22: 插件管理
      { path: 'plugins', element: <AdminPlugins /> },
      { path: 'plugins/review', element: <AdminPluginsReview /> },
      { path: 'plugins/sync', element: <AdminPluginsSync /> },
      // Task 23: 大模型配置
      { path: 'models', element: <AdminModels /> },
      // Task 24: 积分财务管理
      { path: 'finance', element: <Navigate to="/admin/finance/transactions" replace /> },
      { path: 'finance/transactions', element: <AdminFinanceTransactions /> },
      { path: 'finance/orders', element: <AdminFinanceOrders /> },
      { path: 'finance/invoices', element: <AdminFinanceInvoices /> },
      { path: 'finance/reconciliation', element: <AdminFinanceReconciliation /> },
      // Task 25: 内容审核
      { path: 'audit', element: <Navigate to="/admin/audit/queue" replace /> },
      { path: 'audit/sensitive-words', element: <AuditSensitiveWords /> },
      { path: 'audit/ai-config', element: <AuditAIConfig /> },
      { path: 'audit/queue', element: <AuditQueue /> },
      // Task 26: 数据统计运营
      { path: 'stats', element: <Navigate to="/admin/stats/overview" replace /> },
      { path: 'stats/overview', element: <StatsOverview /> },
      { path: 'stats/trends', element: <StatsTrends /> },
      { path: 'stats/rankings', element: <StatsRankings /> },
      { path: 'stats/retention', element: <StatsRetention /> },
      // Task 27: 客户端版本管理
      { path: 'versions', element: <AdminVersions /> },
      // Task 28: 系统配置
      { path: 'system', element: <Navigate to="/admin/system/config" replace /> },
      { path: 'system/config', element: <SystemConfig /> },
      { path: 'system/tenant', element: <SystemTenant /> },
      { path: 'system/announcements', element: <SystemAnnouncements /> }
    ]
  },

  { path: '*', element: <Navigate to="/" replace /> }
])

export default router
