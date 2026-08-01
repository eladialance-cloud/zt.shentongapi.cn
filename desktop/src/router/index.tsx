// 璺敱閰嶇疆
// 榛樿璺敱锛歰nboarding_completed=false 閲嶅畾鍚戝埌 /onboarding锛屽惁鍒欏埌 /dashboard
// 绠＄悊绔矾鐢卞墠缂€ /admin/*锛屼娇鐢?AdminRouteGuard + AdminLayout 鍖呰９
// Task 34: 鐢ㄦ埛绔凡璁よ瘉璺敱浣跨敤 MainLayout 鍖呰９锛堥《鏍?渚ц竟鏍?鍐呭鍖?搴曟爮锛?
import { createHashRouter, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Credits from "@/pages/Credits";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import WorkflowList from "@/pages/Workflow";
import WorkflowDetail from "@/pages/Workflow/Detail";
import WorkflowEditor from "@/pages/Workflow/Editor";
import PluginMarket from "@/pages/Plugin";
import InstalledPlugins from "@/pages/Plugin/Installed";
import PluginLogs from "@/pages/Plugin/Logs";
import KnowledgeList from "@/pages/Knowledge";
import KnowledgeDocuments from "@/pages/Knowledge/Documents";
import KnowledgeSearch from "@/pages/Knowledge/Search";
import AgentCreatorList from "@/pages/AgentCreator";
import AgentCreatorCreate from "@/pages/AgentCreator/Create";
import AgentCreatorRevenue from "@/pages/AgentCreator/Revenue";
import AgentMarket from "@/pages/AgentMarket";
import HermesList from "@/pages/Hermes";
import HermesDetail from "@/pages/Hermes/Detail";
import HermesSkillMarket from "@/pages/Hermes/SkillMarket";
import TeamList from "@/pages/Team";
import TeamDetail from "@/pages/Team/Detail";
import Office from "@/pages/Office";
import ChannelDetail from "@/pages/Channels/Detail";
import ChannelList from "@/pages/Channels";
import PublishList from "@/pages/Channels/Publish";
import McpConfig from "@/pages/McpConfig";
import TeamBoard from "@/pages/Team/Board";
import Settings from "@/pages/Settings";
import ServiceManager from "@/pages/ServiceManager";
import MainLayout from "@/components/MainLayout";
import { useOnboardingStore, useAuthStore } from "@/store";

// 绠＄悊绔〉闈㈠鍏
import AdminLogin from "@/pages/admin/Login";
import AdminLayout from "@/pages/admin/Layout";
import { AdminRouteGuard } from "@/pages/admin/components/AdminRouteGuard";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminRoles from "@/pages/admin/Roles";
import AdminOperationLogs from "@/pages/admin/OperationLogs";
import AdminUsers from "@/pages/admin/Users";
import AdminUserLevels from "@/pages/admin/Users/Levels";
import AdminUserCredits from "@/pages/admin/Users/Credits";
import AdminUserOrders from "@/pages/admin/Users/Orders";
import AdminUserDevices from "@/pages/admin/Users/Devices";
import AdminApiKeyPool from "@/pages/admin/ApiKeyPool";
import AdminApiKeyPoolStats from "@/pages/admin/ApiKeyPool/Stats";
import AdminAgents from "@/pages/admin/Agents";
import AdminAgentsReview from "@/pages/admin/Agents/Review";
import AdminAgentsPricing from "@/pages/admin/Agents/Pricing";
import AdminAgentsCategories from "@/pages/admin/Agents/Categories";
import AdminWorkflows from "@/pages/admin/Workflows";
import AdminWorkflowsReview from "@/pages/admin/Workflows/Review";
import AdminWorkflowsStats from "@/pages/admin/Workflows/Stats";
import AdminPlugins from "@/pages/admin/Plugins";
import AdminPluginsReview from "@/pages/admin/Plugins/Review";
import AdminPluginsSync from "@/pages/admin/Plugins/Sync";
import AdminModels from "@/pages/admin/Models";
import AdminFinanceTransactions from "@/pages/admin/Finance/Transactions";
import AdminFinanceOrders from "@/pages/admin/Finance/Orders";
import AdminFinanceInvoices from "@/pages/admin/Finance/Invoices";
import AdminFinanceReconciliation from "@/pages/admin/Finance/Reconciliation";
import AuditSensitiveWords from "@/pages/admin/Audit/SensitiveWords";
import AuditAIConfig from "@/pages/admin/Audit/AIConfig";
import AuditQueue from "@/pages/admin/Audit/Queue";
import StatsOverview from "@/pages/admin/Stats/Overview";
import StatsTrends from "@/pages/admin/Stats/Trends";
import StatsRankings from "@/pages/admin/Stats/Rankings";
import StatsRetention from "@/pages/admin/Stats/Retention";
import AdminVersions from "@/pages/admin/Versions";
import SystemConfig from "@/pages/admin/System/Config";
import SystemTenant from "@/pages/admin/System/Tenant";
import AdminTeams from "@/pages/admin/Teams";
import AdminChannels from "@/pages/admin/Channels";
import AdminPublish from "@/pages/admin/Publish";
import SystemAnnouncements from "@/pages/admin/System/Announcements";

function RootRedirect() {
  const completed = useOnboardingStore((s) => s.completed);
  return <Navigate to={completed ? "/dashboard" : "/onboarding"} replace />;
}

/**
 * 鐢ㄦ埛绔矾鐢卞畧鍗細鏈櫥褰曡烦杞?/login
 * 妫€鏌?authStore.isAuthenticated锛坅ccessToken 瀛樺湪鍗充负 true锛? */
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const router = createHashRouter([
  // 鏍硅矾鐢憋細鏍规嵁寮曞鐘舵€侀噸瀹氬悜
  { path: "/", element: <RootRedirect /> },

  // ===== 鍏紑璺敱锛堜笉浣跨敤 MainLayout锛?====
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },

  // ===== 鐢ㄦ埛绔凡璁よ瘉璺敱锛圡ainLayout 鍖呰９锛?====
  {
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/chat", element: <Chat /> },
      { path: "/credits", element: <Credits /> },
      // ===== Task 9: 宸ヤ綔娴?=====
      { path: "/workflow", element: <WorkflowList /> },
      { path: "/workflow/editor", element: <WorkflowEditor /> },
      { path: "/workflow/:id", element: <WorkflowDetail /> },
      // ===== Task 10: 鎻掍欢 =====
      { path: "/plugins", element: <PluginMarket /> },
      { path: "/plugins/installed", element: <InstalledPlugins /> },
      { path: "/plugins/logs", element: <PluginLogs /> },
      // ===== Task 11: 鐭ヨ瘑搴?=====
      { path: "/knowledge", element: <KnowledgeList /> },
      { path: "/knowledge/:id/documents", element: <KnowledgeDocuments /> },
      { path: "/knowledge/:id/search", element: <KnowledgeSearch /> },
      // ===== Task 12: Agent 鍒涘缓 =====
      { path: "/creator", element: <AgentCreatorList /> },
      { path: "/creator/create", element: <AgentCreatorCreate /> },
      { path: "/creator/:id/edit", element: <AgentCreatorCreate /> },
      { path: "/creator/revenue", element: <AgentCreatorRevenue /> },
      // ===== Task 13: Hermes =====
      { path: "/hermes", element: <HermesList /> },
      { path: "/hermes/skills", element: <HermesSkillMarket /> },
      { path: "/hermes/:id", element: <HermesDetail /> },
      { path: "/office", element: <Office /> },
      { path: "/channels", element: <ChannelList /> },
      { path: "/channels/:id", element: <ChannelDetail /> },
      { path: "/publish", element: <PublishList /> },
      // ===== Agent 市场 / MCP 市场 / 自动化 =====
      { path: "/agent-market", element: <AgentMarket /> },
      { path: "/mcp-market", element: <McpConfig /> },
      { path: "/automation", element: <Navigate to="/workflows" replace /> },
      // ===== Task 14: OPC =====
      // OPC 路径重定向到团队
      { path: "/opc", element: <Navigate to="/team" replace /> },
      { path: "/opc/:id", element: <Navigate to="/team" replace /> },
      { path: "/opc/:id/board", element: <Navigate to="/team" replace /> },
      { path: "/team", element: <TeamList /> },
      { path: "/team/:id", element: <TeamDetail /> },
      { path: "/team/:id/board", element: <TeamBoard /> },
      // ===== Task 15: 涓汉璁剧疆 =====
      { path: "/settings", element: <Settings /> },
      // ===== Task 16: 鏈嶅姟绠＄悊 =====
      { path: "/services", element: <ServiceManager /> },
    ],
  },

  // ===== 绠＄悊绔紙Task 17-28锛岀嫭绔嬪竷灞€锛屼笉浣跨敤 MainLayout锛?====
  { path: "/admin/login", element: <AdminLogin /> },
  {
    path: "/admin",
    element: (
      <AdminRouteGuard>
        <AdminLayout />
      </AdminRouteGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      // Task 17: 浠〃鐩?+ 瑙掕壊 + 鎿嶄綔鏃ュ織
      { path: "dashboard", element: <AdminDashboard /> },
      { path: "roles", element: <AdminRoles /> },
      { path: "operation-logs", element: <AdminOperationLogs /> },
      // Task 18: 鐢ㄦ埛绠＄悊
      { path: "users", element: <AdminUsers /> },
      { path: "users/levels", element: <AdminUserLevels /> },
      { path: "users/credits", element: <AdminUserCredits /> },
      { path: "users/orders", element: <AdminUserOrders /> },
      { path: "users/devices", element: <AdminUserDevices /> },
      // Task 19: API Key 姹?      { path: "api-key-pool", element: <AdminApiKeyPool /> },
      { path: "api-key-pool/stats", element: <AdminApiKeyPoolStats /> },
      // Task 20: Agent 甯傚満绠＄悊
      { path: "agents", element: <AdminAgents /> },
      { path: "agents/review", element: <AdminAgentsReview /> },
      { path: "agents/pricing", element: <AdminAgentsPricing /> },
      { path: "agents/categories", element: <AdminAgentsCategories /> },
      // Task 21: 宸ヤ綔娴佹ā鏉跨鐞?      { path: "workflows", element: <AdminWorkflows /> },
      { path: "workflows/review", element: <AdminWorkflowsReview /> },
      { path: "workflows/stats", element: <AdminWorkflowsStats /> },
      // Task 22: 鎻掍欢绠＄悊
      { path: "plugins", element: <AdminPlugins /> },
      { path: "plugins/review", element: <AdminPluginsReview /> },
      { path: "plugins/sync", element: <AdminPluginsSync /> },
      // Task 23: 澶фā鍨嬮厤缃?      { path: "models", element: <AdminModels /> },
      // Task 24: 绉垎璐㈠姟绠＄悊
      {
        path: "finance",
        element: <Navigate to="/admin/finance/transactions" replace />,
      },
      { path: "finance/transactions", element: <AdminFinanceTransactions /> },
      { path: "finance/orders", element: <AdminFinanceOrders /> },
      { path: "finance/invoices", element: <AdminFinanceInvoices /> },
      {
        path: "finance/reconciliation",
        element: <AdminFinanceReconciliation />,
      },
      // Task 25: 鍐呭瀹℃牳
      { path: "audit", element: <Navigate to="/admin/audit/queue" replace /> },
      { path: "audit/sensitive-words", element: <AuditSensitiveWords /> },
      { path: "audit/ai-config", element: <AuditAIConfig /> },
      { path: "audit/queue", element: <AuditQueue /> },
      // Task 26: 鏁版嵁缁熻杩愯惀
      {
        path: "stats",
        element: <Navigate to="/admin/stats/overview" replace />,
      },
      { path: "stats/overview", element: <StatsOverview /> },
      { path: "stats/trends", element: <StatsTrends /> },
      { path: "stats/rankings", element: <StatsRankings /> },
      { path: "stats/retention", element: <StatsRetention /> },
      // Task 27: 瀹㈡埛绔増鏈鐞?      { path: "versions", element: <AdminVersions /> },
      { path: "teams", element: <AdminTeams /> },
      { path: "channels", element: <AdminChannels /> },
      { path: "publish", element: <AdminPublish /> },
      // Task 28: 绯荤粺閰嶇疆
      {
        path: "system",
        element: <Navigate to="/admin/system/config" replace />,
      },
      { path: "system/config", element: <SystemConfig /> },
      { path: "system/tenant", element: <SystemTenant /> },
      { path: "system/announcements", element: <SystemAnnouncements /> },
    ],
  },

  { path: "*", element: <Navigate to="/" replace /> },
]);

export default router;
