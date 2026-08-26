// 路由配置
// 默认路由：onboarding_completed=false 重定向到 /onboarding，否则到 /dashboard
// Task 34: 用户端已认证路由使用 MainLayout 包裹（顶栏+侧边栏+内容区+底栏）
import { createHashRouter, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Credits from "@/pages/Credits";
import CreditsRecharge from "@/pages/Credits/Recharge";
import CreditsTransactions from "@/pages/Credits/Transactions";
import CreditsConsumption from "@/pages/Credits/Consumption";
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
import AgentDetail from "@/pages/AgentMarket/Detail";
import AgentFavorites from "@/pages/AgentMarket/Favorites";
import SkillMarket from "@/pages/SkillMarket";
import LocalDetail from "@/pages/SkillMarket/LocalDetail";
import HermesList from "@/pages/Hermes";
import HermesDetail from "@/pages/Hermes/Detail";
import HermesEvolution from "@/pages/Hermes/Evolution";
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
import VideoClaw from "@/pages/VideoClaw";
import OralWorkshopWorkbench from "@/pages/OralWorkshop/Workbench";
import OralWorkshopProjects from "@/pages/OralWorkshop/Projects";
import OralWorkshopDetail from "@/pages/OralWorkshop/Detail";
import OralWorkshopAccounts from "@/pages/OralWorkshop/Accounts";
import OralWorkshopMaterials from "@/pages/OralWorkshop/Materials";
import BriefsList from "@/pages/Briefs";
import BriefsNew from "@/pages/Briefs/New";
import BriefsDetail from "@/pages/Briefs/Detail";
import TaskCenter from "@/pages/TaskCenter";
import AssetsPage from "@/pages/Assets";
import Analytics from "@/pages/Analytics";
import MainLayout from "@/components/MainLayout";
import { useAuthStore } from "@/store";

function RootRedirect() {
  // 不需要本地离线引导：未登录由 RequireAuth 自动转到 /login
  return <Navigate to="/dashboard" replace />;
}

/**
 * 用户端路由守卫：未登录跳转 /login
 * 检查 authStore.isAuthenticated（accessToken 存在即为 true） */
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const router = createHashRouter([
  // 根路由：根据引导状态重定向
  { path: "/", element: <RootRedirect /> },

  // ===== 公开路由（不使用 MainLayout） =====
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },

  // ===== 用户端已认证路由（MainLayout 包裹） =====
  {
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/briefs", element: <BriefsList /> },
      { path: "/briefs/new", element: <BriefsNew /> },
      { path: "/briefs/:id", element: <BriefsDetail /> },
      { path: "/task-center", element: <TaskCenter /> },
      { path: "/assets", element: <AssetsPage /> },
      { path: "/chat", element: <Chat /> },
      { path: "/credits", element: <Credits /> },
      { path: "/credits/recharge", element: <CreditsRecharge /> },
      { path: "/credits/transactions", element: <CreditsTransactions /> },
      { path: "/credits/consumption", element: <CreditsConsumption /> },
      // ===== Task 9: 工作流 =====
      { path: "/workflow", element: <WorkflowList /> },
      { path: "/workflow/editor", element: <WorkflowEditor /> },
      { path: "/workflow/:id", element: <WorkflowDetail /> },
      // ===== Task 10: 插件 =====
      { path: "/plugins", element: <PluginMarket /> },
      { path: "/plugins/installed", element: <InstalledPlugins /> },
      { path: "/plugins/logs", element: <PluginLogs /> },
      // ===== Task 11: 知识库 =====
      { path: "/knowledge", element: <KnowledgeList /> },
      { path: "/knowledge/:id/documents", element: <KnowledgeDocuments /> },
      { path: "/knowledge/:id/search", element: <KnowledgeSearch /> },
      // ===== Task 12: Agent 创建 =====
      { path: "/creator", element: <AgentCreatorList /> },
      { path: "/creator/create", element: <AgentCreatorCreate /> },
      { path: "/creator/:id/edit", element: <AgentCreatorCreate /> },
      { path: "/creator/revenue", element: <AgentCreatorRevenue /> },
      // ===== Task 13: Hermes =====
      { path: "/hermes", element: <HermesList /> },
      { path: "/hermes/evolution", element: <HermesEvolution /> },
      { path: "/hermes/:id", element: <HermesDetail /> },
      { path: "/office", element: <Office /> },
      { path: "/channels", element: <ChannelList /> },
      { path: "/channels/:id", element: <ChannelDetail /> },
      { path: "/publish", element: <PublishList /> },
      { path: "/analytics", element: <Analytics /> },
      // ===== Agent 市场 / MCP 市场 / 自动化 =====
      { path: "/agent-market", element: <AgentMarket /> },
      { path: "/agent-market/favorites", element: <AgentFavorites /> },
      { path: "/agent-market/:id", element: <AgentDetail /> },
      { path: "/mcp-market", element: <McpConfig /> },
      { path: "/skill-market", element: <SkillMarket /> },
      { path: "/skill-market/detail/:type/:id", element: <LocalDetail /> },
      { path: "/automation", element: <Navigate to="/workflow" replace /> },
      // 兼容旧链接：复数 /workflows 别名指向单数路由
      { path: "/workflows", element: <Navigate to="/workflow" replace /> },
      // ===== Task 14: OPC =====
      // OPC 路径重定向到团队
      { path: "/opc", element: <Navigate to="/team" replace /> },
      { path: "/opc/:id", element: <Navigate to="/team" replace /> },
      { path: "/opc/:id/board", element: <Navigate to="/team" replace /> },
      { path: "/team", element: <TeamList /> },
      { path: "/team/:id", element: <TeamDetail /> },
      { path: "/team/:id/board", element: <TeamBoard /> },
      // ===== Task 15: 个人设置 =====
      { path: "/settings", element: <Settings /> },
      // ===== Task 16: 服务管理 =====
      { path: "/services", element: <ServiceManager /> },
      { path: "/video-claw", element: <VideoClaw /> },
      // ===== 口播工坊 =====
      { path: "/oral-workshop", element: <OralWorkshopProjects /> },
      { path: "/oral-workshop/workbench", element: <OralWorkshopWorkbench /> },
      { path: "/oral-workshop/accounts", element: <OralWorkshopAccounts /> },
      { path: "/oral-workshop/materials", element: <OralWorkshopMaterials /> },
      { path: "/oral-workshop/:id", element: <OralWorkshopDetail /> },
    ],
  },

  { path: "*", element: <Navigate to="/" replace /> },
]);

export default router;
