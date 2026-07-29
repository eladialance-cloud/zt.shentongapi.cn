// 璺敱閰嶇疆
// 榛樿璺敱锛歰nboarding_completed=false 閲嶅畾鍚戝埌 /onboarding锛屽惁鍒欏埌 /dashboard
// 绠＄悊绔矾鐢卞墠缂€ /admin/*锛屼娇鐢?AdminRouteGuard + AdminLayout 鍖呰９
// Task 34: 鐢ㄦ埛绔凡璁よ瘉璺敱浣跨敤 MainLayout 鍖呰９锛堥《鏍?渚ц竟鏍?鍐呭鍖?搴曟爮锛?// v0.3.1: 鏂板 /workflows /agent-market /skill-market /profile 璺敱鍒悕

import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'
import { Spin } from 'antd'

// 椤甸潰缁勪欢鍏ㄩ儴鎳掑姞杞斤紙React.lazy + Suspense锛?// 甯冨眬/瀹堝崼/store 淇濇寔鍚屾 import锛涢〉闈?chunk 鎸夐渶鍔犺浇

const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Chat = lazy(() => import('@/pages/Chat'))
const Credits = lazy(() => import('@/pages/Credits'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const WorkflowList = lazy(() => import('@/pages/Workflow'))
const WorkflowDetail = lazy(() => import('@/pages/Workflow/Detail'))
const WorkflowEditor = lazy(() => import('@/pages/Workflow/Editor'))
const PluginMarket = lazy(() => import('@/pages/Plugin'))
const InstalledPlugins = lazy(() => import('@/pages/Plugin/Installed'))
const PluginLogs = lazy(() => import('@/pages/Plugin/Logs'))
const PluginDetail = lazy(() => import('@/pages/Plugin/Detail'))
const KnowledgeList = lazy(() => import('@/pages/Knowledge'))
const KnowledgeDocuments = lazy(() => import('@/pages/Knowledge/Documents'))
const KnowledgeSearch = lazy(() => import('@/pages/Knowledge/Search'))
const AgentCreatorList = lazy(() => import('@/pages/AgentCreator'))
const AgentCreatorCreate = lazy(() => import('@/pages/AgentCreator/Create'))
const AgentCreatorRevenue = lazy(() => import('@/pages/AgentCreator/Revenue'))
const HermesList = lazy(() => import('@/pages/Hermes'))
const HermesDetail = lazy(() => import('@/pages/Hermes/Detail'))
const HermesSkillMarket = lazy(() => import('@/pages/Hermes/SkillMarket'))
const OPCTeamList = lazy(() => import('@/pages/OPC'))
const OPCTeamDetail = lazy(() => import('@/pages/OPC/Detail'))
const OPCBoard = lazy(() => import('@/pages/OPC/Board'))
const Settings = lazy(() => import('@/pages/Settings'))
const ServiceManager = lazy(() => import('@/pages/ServiceManager'))
const Office = lazy(() => import('@/pages/Office'))
const AgentMarket = lazy(() => import('@/pages/AgentMarket'))
const Automation = lazy(() => import('@/pages/Automation'))
const McpConfig = lazy(() => import('@/pages/McpConfig'))
const Team = lazy(() => import('@/pages/Team'))
const AgentDetail = lazy(() => import('@/pages/AgentMarket/Detail'))
const KnowledgeEditor = lazy(() => import('@/pages/Knowledge/Editor'))
const AutomationEditor = lazy(() => import('@/pages/Automation/Editor'))
const AutomationHistory = lazy(() => import('@/pages/Automation/History'))
// 绠＄悊绔〉闈㈠鍏?const AdminLogin = lazy(() => import('@/pages/admin/Login'))
// Task 3: 绠＄悊绔慨鏀瑰瘑鐮侀〉
const AdminChangePassword = lazy(() => import('@/pages/admin/ChangePassword'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminRoles = lazy(() => import('@/pages/admin/Roles'))
const AdminOperationLogs = lazy(() => import('@/pages/admin/OperationLogs'))
const AdminUsers = lazy(() => import('@/pages/admin/Users'))
const AdminUserLevels = lazy(() => import('@/pages/admin/Users/Levels'))
const AdminUserCredits = lazy(() => import('@/pages/admin/Users/Credits'))
const AdminUserOrders = lazy(() => import('@/pages/admin/Users/Orders'))
const AdminUserDevices = lazy(() => import('@/pages/admin/Users/Devices'))
const AdminApiKeyPool = lazy(() => import('@/pages/admin/ApiKeyPool'))
const AdminApiKeyPoolStats = lazy(() => import('@/pages/admin/ApiKeyPool/Stats'))
const AdminAgents = lazy(() => import('@/pages/admin/Agents'))
const AdminAgentsReview = lazy(() => import('@/pages/admin/Agents/Review'))
const AdminAgentsPricing = lazy(() => import('@/pages/admin/Agents/Pricing'))
const AdminAgentsCategories = lazy(() => import('@/pages/admin/Agents/Categories'))
const AdminWorkflows = lazy(() => import('@/pages/admin/Workflows'))
const AdminWorkflowsReview = lazy(() => import('@/pages/admin/Workflows/Review'))
const AdminWorkflowsStats = lazy(() => import('@/pages/admin/Workflows/Stats'))
const AdminPlugins = lazy(() => import('@/pages/admin/Plugins'))
const AdminPluginsReview = lazy(() => import('@/pages/admin/Plugins/Review'))
const AdminPluginsSync = lazy(() => import('@/pages/admin/Plugins/Sync'))
const AdminModels = lazy(() => import('@/pages/admin/Models'))
const AdminFinanceTransactions = lazy(() => import('@/pages/admin/Finance/Transactions'))
const AdminFinanceOrders = lazy(() => import('@/pages/admin/Finance/Orders'))
const AdminFinanceInvoices = lazy(() => import('@/pages/admin/Finance/Invoices'))
const AdminFinanceReconciliation = lazy(() => import('@/pages/admin/Finance/Reconciliation'))
const AuditSensitiveWords = lazy(() => import('@/pages/admin/Audit/SensitiveWords'))
const AuditAIConfig = lazy(() => import('@/pages/admin/Audit/AIConfig'))
const AuditQueue = lazy(() => import('@/pages/admin/Audit/Queue'))
const StatsOverview = lazy(() => import('@/pages/admin/Stats/Overview'))
const StatsTrends = lazy(() => import('@/pages/admin/Stats/Trends'))
const StatsRankings = lazy(() => import('@/pages/admin/Stats/Rankings'))
const StatsRetention = lazy(() => import('@/pages/admin/Stats/Retention'))
// v0.3.1 Task 23/24: 鏂板绠＄悊绔〉闈㈠鍏?const AdminLoginLog = lazy(() => import('@/pages/admin/User/LoginLog'))
const KnowledgeReview = lazy(() => import('@/pages/admin/Review/Knowledge'))
const AdminServices = lazy(() => import('@/pages/admin/System/Services'))
const AdminCallLogs = lazy(() => import('@/pages/admin/System/CallLogs'))
const FinanceConsumption = lazy(() => import('@/pages/admin/Finance/Consumption'))
const FinanceCreditFlow = lazy(() => import('@/pages/admin/Finance/CreditFlow'))
const FinancePricing = lazy(() => import('@/pages/admin/Finance/Pricing'))
const ResAIEmployees = lazy(() => import('@/pages/admin/Resources/AIEmployees'))
const SkillStore = lazy(() => import('@/pages/admin/SkillStore'))
const ResKnowledge = lazy(() => import('@/pages/admin/Resources/Knowledge'))
const ResWorkflowTemplates = lazy(() => import('@/pages/admin/Resources/WorkflowTemplates'))
// Task 12: admin/AgentExt 閲嶅懡鍚嶏紙鍘?AgentTags锛?const AdminAgentExt = lazy(() => import('@/pages/admin/AgentExt'))
const AnaUsers = lazy(() => import('@/pages/admin/Analytics/Users'))
const AnaCalls = lazy(() => import('@/pages/admin/Analytics/Calls'))
const AnaRevenue = lazy(() => import('@/pages/admin/Analytics/Revenue'))
const AdminVersions = lazy(() => import('@/pages/admin/Versions'))
const SystemConfig = lazy(() => import('@/pages/admin/System/Config'))
const SystemTenant = lazy(() => import('@/pages/admin/System/Tenant'))
const SystemAnnouncements = lazy(() => import('@/pages/admin/System/Announcements'))
// Task 14-17: admin 缁熶竴鍏ュ彛锛圓udit / Finance / Stats / System锛?const AdminAuditUnified = lazy(() => import('@/pages/admin/Audit'))
const AdminFinanceUnified = lazy(() => import('@/pages/admin/Finance'))
const AdminStatsUnified = lazy(() => import('@/pages/admin/Stats'))
const AdminSystemUnified = lazy(() => import('@/pages/admin/System'))

// 甯冨眬/瀹堝崼/store 淇濇寔鍚屾 import锛堥灞忛渶瑕侊紝涓嶆噿鍔犺浇锛?import MainLayout from '@/components/MainLayout'
import { useOnboardingStore, useAuthStore } from '@/store'
import AdminLayout from '@/pages/admin/Layout'
import { AdminRouteGuard } from '@/pages/admin/components/AdminRouteGuard'

/**
 * Suspense 鍖呰９鍣細涓烘噿鍔犺浇鐨勯〉闈㈢粍浠舵彁渚?fallback UI
 * 杩斿洖 ReactNode锛圝SX.Element锛夛紝鍦ㄨ矾鐢遍厤缃腑鐩存帴浣跨敤 element: withSuspense(Login)
 */
function withSuspense<T extends React.ComponentType<any>>(Comp: React.LazyExoticComponent<T>): ReactNode {
  // type assertion to bypass JSX generic props inference
  const Component = Comp as React.ComponentType<any>
  return (
    <Suspense
      fallback={
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      }
    >
      <Component />
    </Suspense>
  )
}

function RootRedirect() {
  const completed = useOnboardingStore((s) => s.completed)
  return <Navigate to={completed ? '/dashboard' : '/onboarding'} replace />
}

/**
 * 鐢ㄦ埛绔矾鐢卞畧鍗細鏈櫥褰曡烦杞?/login
 * 妫€鏌?authStore.isAuthenticated锛坅ccessToken 瀛樺湪鍗充负 true锛? */
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}


const router = createHashRouter([
  // 鏍硅矾鐢憋細鏍规嵁寮曞鐘舵€侀噸瀹氬悜
  { path: '/', element: <RootRedirect /> },

  // ===== 鍏紑璺敱锛堜笉浣跨敤 MainLayout锛?====
  { path: '/onboarding', element: withSuspense(Onboarding) },
  { path: '/login', element: withSuspense(Login) },
  { path: '/register', element: withSuspense(Register) },
  { path: '/forgot-password', element: withSuspense(ForgotPassword) },
  { path: '/reset-password', element: withSuspense(ResetPassword) },

  // ===== 鐢ㄦ埛绔凡璁よ瘉璺敱锛圡ainLayout 鍖呰９锛?====
  {
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/dashboard', element: withSuspense(Dashboard) },
      { path: '/chat', element: withSuspense(Chat) },
      { path: '/credits', element: withSuspense(Credits) },
      // ===== Task 9: 宸ヤ綔娴?=====
      { path: '/workflow', element: withSuspense(WorkflowList) },
      { path: '/workflow/editor', element: withSuspense(WorkflowEditor) },
      { path: '/workflow/editor/:instanceId', element: withSuspense(WorkflowEditor) },
      { path: '/workflow/:id', element: withSuspense(WorkflowDetail) },
      // v0.3.1: Sidebar 瑙勮寖璺緞鍒悕锛?workflows -> WorkflowList锛?      { path: '/workflows', element: withSuspense(WorkflowList) },
      // ===== Task 10: 鎻掍欢 =====
      { path: '/plugins', element: withSuspense(PluginMarket) },
      { path: '/plugins/installed', element: withSuspense(InstalledPlugins) },
      { path: '/plugins/logs', element: withSuspense(PluginLogs) },
      { path: '/plugins/:id', element: withSuspense(PluginDetail) },
      // ===== Task 11: 鐭ヨ瘑搴?=====
      { path: '/knowledge', element: withSuspense(KnowledgeList) },
      { path: '/knowledge/:id/documents', element: withSuspense(KnowledgeDocuments) },
      { path: '/knowledge/:id/search', element: withSuspense(KnowledgeSearch) },
      // ===== Task 12: Agent 鍒涘缓 =====
      { path: '/creator', element: withSuspense(AgentCreatorList) },
      { path: '/creator/create', element: withSuspense(AgentCreatorCreate) },
      { path: '/creator/:id/edit', element: withSuspense(AgentCreatorCreate) },
      { path: '/creator/revenue', element: withSuspense(AgentCreatorRevenue) },
      // ===== Task 13: Hermes =====
      { path: '/hermes', element: withSuspense(HermesList) },
      { path: '/hermes/skills', element: withSuspense(HermesSkillMarket) },
      { path: '/hermes/:id', element: withSuspense(HermesDetail) },
      // v0.3.1: Sidebar 瑙勮寖璺緞鍒悕
      { path: '/agent-market', element: withSuspense(AgentMarket) },
      { path: '/skill-market', element: withSuspense(HermesSkillMarket) },
      // ===== Task 14: OPC =====
      { path: '/opc', element: withSuspense(OPCTeamList) },
      { path: '/opc/:id', element: withSuspense(OPCTeamDetail) },
      { path: '/opc/:id/board', element: withSuspense(OPCBoard) },
      // ===== Task 15: 涓汉璁剧疆 =====
      { path: '/settings', element: withSuspense(Settings) },
      // v0.3.1: TopBar 鐢ㄦ埛鑿滃崟 /profile 璺宠浆鍒?/settings
      { path: '/profile', element: <Navigate to="/settings" replace /> },
      // ===== Task 16: 鏈嶅姟绠＄悊 =====
      { path: '/services', element: withSuspense(ServiceManager) },
      // ===== Task: 琛ラ綈 Sidebar 瀵艰埅缂哄け璺敱 =====
      { path: '/office', element: withSuspense(Office) },
      { path: '/agents', element: withSuspense(AgentMarket) },
      { path: '/automation', element: withSuspense(Automation) },
      { path: '/mcp-config', element: withSuspense(McpConfig) },
      { path: '/team', element: withSuspense(Team) },
      // ===== Task 31: 琛ラ綈 v0.3.1 瑙勮寖 28 涓敤鎴疯矾鐢卞埆鍚?=====
      { path: '/agents/:id', element: withSuspense(AgentDetail) },
      { path: '/agent-detail/:id', element: withSuspense(AgentDetail) },
      { path: '/workflow-editor', element: <Navigate to="/workflow/editor" replace /> },
      { path: '/workflow-detail/:id', element: <Navigate to="/workflow/:id" replace /> },
      { path: '/agent-creator', element: <Navigate to="/creator" replace /> },
      { path: '/plugin-detail/:id', element: <Navigate to="/plugins/:id" replace /> },
      { path: '/knowledge-detail/:id', element: withSuspense(KnowledgeDocuments) },
      { path: '/knowledge-editor', element: withSuspense(KnowledgeEditor) },
      { path: '/knowledge-editor/:id', element: withSuspense(KnowledgeEditor) },
      { path: '/automation-editor', element: withSuspense(AutomationEditor) },
      { path: '/automation-editor/:id', element: withSuspense(AutomationEditor) },
      { path: '/automation-history', element: withSuspense(AutomationHistory) },
      { path: '/automation-history/:id', element: withSuspense(AutomationHistory) },
    ]
  },

  // ===== 绠＄悊绔紙Task 17-28锛岀嫭绔嬪竷灞€锛屼笉浣跨敤 MainLayout锛?====
  { path: '/admin/login', element: withSuspense(AdminLogin) },
  {
    path: '/admin',
    element: (
      <AdminRouteGuard>
        <AdminLayout />
      </AdminRouteGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      // Task 17: 浠〃鐩?+ 瑙掕壊 + 鎿嶄綔鏃ュ織
      { path: 'dashboard', element: withSuspense(AdminDashboard) },
      { path: 'roles', element: withSuspense(AdminRoles) },
      { path: 'operation-logs', element: withSuspense(AdminOperationLogs) },
      // Task 3: 淇敼瀵嗙爜锛堢嫭绔嬭矾鐢憋紝鍙?AdminRouteGuard 瀹堝崼锛?      { path: 'change-password', element: withSuspense(AdminChangePassword) },
      // Task 18: 鐢ㄦ埛绠＄悊
      { path: 'users', element: withSuspense(AdminUsers) },
      { path: 'users/levels', element: withSuspense(AdminUserLevels) },
      { path: 'users/credits', element: withSuspense(AdminUserCredits) },
      { path: 'users/orders', element: withSuspense(AdminUserOrders) },
      { path: 'users/devices', element: withSuspense(AdminUserDevices) },
      // Task 19: API Key 姹?      { path: 'api-key-pool', element: withSuspense(AdminApiKeyPool) },
      { path: 'api-key-pool/stats', element: withSuspense(AdminApiKeyPoolStats) },
      // Task 20: Agent 甯傚満绠＄悊
      { path: 'agents', element: withSuspense(AdminAgents) },
      { path: 'agents/review', element: withSuspense(AdminAgentsReview) },
      { path: 'agents/pricing', element: withSuspense(AdminAgentsPricing) },
      { path: 'agents/categories', element: withSuspense(AdminAgentsCategories) },
      // Task 21: 宸ヤ綔娴佹ā鏉跨鐞?      { path: 'workflows', element: withSuspense(AdminWorkflows) },
      { path: 'workflows/review', element: withSuspense(AdminWorkflowsReview) },
      { path: 'workflows/stats', element: withSuspense(AdminWorkflowsStats) },
      // Task 22: 鎻掍欢绠＄悊
      { path: 'plugins', element: withSuspense(AdminPlugins) },
      { path: 'plugins/review', element: withSuspense(AdminPluginsReview) },
      { path: 'plugins/sync', element: withSuspense(AdminPluginsSync) },
      // Task 23: 澶фā鍨嬮厤缃?      { path: 'models', element: withSuspense(AdminModels) },
      // Task 24/15: 绉垎璐㈠姟绠＄悊 鈥?缁熶竴鍏ュ彛 /admin/finance 娓叉煋 Tabs 鏁村悎椤碉紝娣遍摼鎺ヤ粛鎸囧悜瀛愭ā鍧?      { path: 'finance', element: withSuspense(AdminFinanceUnified) },
      { path: 'finance/transactions', element: withSuspense(AdminFinanceTransactions) },
      { path: 'finance/orders', element: withSuspense(AdminFinanceOrders) },
      { path: 'finance/invoices', element: withSuspense(AdminFinanceInvoices) },
      { path: 'finance/reconciliation', element: withSuspense(AdminFinanceReconciliation) },
      // Task 25/14: 鍐呭瀹℃牳 鈥?缁熶竴鍏ュ彛 /admin/audit 娓叉煋 Tabs 鏁村悎椤碉紝娣遍摼鎺ヤ粛鎸囧悜瀛愭ā鍧?      { path: 'audit', element: withSuspense(AdminAuditUnified) },
      { path: 'audit/sensitive-words', element: withSuspense(AuditSensitiveWords) },
      { path: 'audit/ai-config', element: withSuspense(AuditAIConfig) },
      { path: 'audit/queue', element: withSuspense(AuditQueue) },
      // Task 26/16: 鏁版嵁缁熻杩愯惀 鈥?缁熶竴鍏ュ彛 /admin/stats 娓叉煋 Tabs 鏁村悎椤碉紝娣遍摼鎺ヤ粛鎸囧悜瀛愭ā鍧?      { path: 'stats', element: withSuspense(AdminStatsUnified) },
      { path: 'stats/overview', element: withSuspense(StatsOverview) },
      { path: 'stats/trends', element: withSuspense(StatsTrends) },
      { path: 'stats/rankings', element: withSuspense(StatsRankings) },
      { path: 'stats/retention', element: withSuspense(StatsRetention) },
      // v0.3.1 Task 23/24: 鏂板绠＄悊绔矾鐢?      { path: 'users/login-log', element: withSuspense(AdminLoginLog) },
      { path: 'review/knowledge', element: withSuspense(KnowledgeReview) },
      { path: 'system/services', element: withSuspense(AdminServices) },
      { path: 'system/call-logs', element: withSuspense(AdminCallLogs) },
      { path: 'finance/consumption', element: withSuspense(FinanceConsumption) },
      { path: 'finance/credit-flow', element: withSuspense(FinanceCreditFlow) },
      { path: 'finance/pricing', element: withSuspense(FinancePricing) },
      { path: 'resources/ai-employees', element: withSuspense(ResAIEmployees) },
      { path: 'skill-store', element: withSuspense(SkillStore) },
      { path: 'resources/knowledge', element: withSuspense(ResKnowledge) },
      { path: 'resources/workflow-templates', element: withSuspense(ResWorkflowTemplates) },
      // Task 12: AgentExt 閲嶅懡鍚嶏紙鍘?AgentTags锛屽師鏃犺矾鐢憋紝鏂板锛?      { path: 'agent-ext', element: withSuspense(AdminAgentExt) },
      { path: 'analytics/users', element: withSuspense(AnaUsers) },
      { path: 'analytics/calls', element: withSuspense(AnaCalls) },
      { path: 'analytics/revenue', element: withSuspense(AnaRevenue) },
      // Task 27: 瀹㈡埛绔増鏈鐞?      { path: 'versions', element: withSuspense(AdminVersions) },
      // Task 28/17: 绯荤粺閰嶇疆 鈥?缁熶竴鍏ュ彛 /admin/system 娓叉煋 Tabs 鏁村悎椤碉紝娣遍摼鎺ヤ粛鎸囧悜瀛愭ā鍧?      { path: 'system', element: withSuspense(AdminSystemUnified) },
      { path: 'system/config', element: withSuspense(SystemConfig) },
      { path: 'system/tenant', element: withSuspense(SystemTenant) },
      { path: 'system/announcements', element: withSuspense(SystemAnnouncements) }
    ]
  },

  { path: '*', element: <Navigate to="/" replace /> }
])

export default router
