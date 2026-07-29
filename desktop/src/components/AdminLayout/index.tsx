/**
 * AdminLayout — v0.3.1 管理后台主布局 (Task 22)
 * 结构: TopBar(56px) + [Sidebar(220px, 不可折叠) + Content] + BottomBar(32px)
 * 浅色主题, 白色背景, design tokens, Ant Design Layout 组件
 * 侧边栏分组: 仪表盘/用户管理/内容管理/资源管理/财务管理/系统管理/数据统计
 */
import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Tag, type MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  FundOutlined,
  LogoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useAdminAuthStore } from '@/store/admin-auth'
import { adminLogout } from '@/api/admin-auth-api'
import Breadcrumb from '@/components/Breadcrumb'
import styles from './styles.module.css'

const { Header, Sider, Content, Footer } = Layout

type NavChild = { key: string; label: string; path: string }
type NavGroup = { key: string; label: string; icon: React.ReactNode; children: NavChild[] }

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'dashboard',
    label: '仪表盘',
    icon: <DashboardOutlined />,
    children: [{ key: 'dashboard', label: '仪表盘', path: '/admin/dashboard' }]
  },
  {
    key: 'users',
    label: '用户管理',
    icon: <TeamOutlined />,
    children: [
      { key: 'users-list', label: '用户列表', path: '/admin/users' },
      { key: 'users-roles', label: '角色权限', path: '/admin/roles' },
      { key: 'users-login-log', label: '登录日志', path: '/admin/users/login-log' },
      // Task 18: 修改密码入口（路由由 Task 3 在 router/index.tsx 注册）
      { key: 'change-password', label: '修改密码', path: '/admin/change-password' }
    ]
  },
  {
    key: 'content',
    label: '内容管理',
    icon: <SafetyCertificateOutlined />,
    children: [
      { key: 'review-agent', label: 'Agent审核', path: '/admin/agents/review' },
      { key: 'review-plugin', label: 'Plugin审核', path: '/admin/plugins/review' },
      { key: 'review-workflow', label: 'Workflow审核', path: '/admin/workflows/review' },
      { key: 'review-knowledge', label: 'Knowledge审核', path: '/admin/review/knowledge' },
      // Task 12: AgentExt 重命名（原 AgentTags，新增菜单项）
      { key: 'agent-ext', label: '扩展审核', path: '/admin/agent-ext' }
    ]
  },
  {
    key: 'resources',
    label: '资源管理',
    icon: <AppstoreOutlined />,
    children: [
      { key: 'res-ai-employees', label: 'AI员工', path: '/admin/resources/ai-employees' },
      { key: 'skill-store', label: 'SKILL', path: '/admin/skill-store' },
      { key: 'res-knowledge', label: '知识库', path: '/admin/resources/knowledge' },
      { key: 'res-workflow-templates', label: '工作流模板', path: '/admin/resources/workflow-templates' }
    ]
  },
  {
    key: 'finance',
    label: '财务管理',
    icon: <DollarOutlined />,
    children: [
      { key: 'fin-orders', label: '充值订单', path: '/admin/finance/orders' },
      { key: 'fin-consumption', label: '消费记录', path: '/admin/finance/consumption' },
      { key: 'fin-credit-flow', label: '积分流水', path: '/admin/finance/credit-flow' },
      { key: 'fin-pricing', label: '定价方案', path: '/admin/finance/pricing' }
    ]
  },
  {
    key: 'system',
    label: '系统管理',
    icon: <SettingOutlined />,
    children: [
      { key: 'sys-services', label: '服务监控', path: '/admin/system/services' },
      { key: 'sys-call-logs', label: '调用日志', path: '/admin/system/call-logs' },
      { key: 'sys-config', label: '系统配置', path: '/admin/system/config' },
      { key: 'sys-announcements', label: '公告管理', path: '/admin/system/announcements' }
    ]
  },
  {
    key: 'analytics',
    label: '数据统计',
    icon: <BarChartOutlined />,
    children: [
      { key: 'ana-users', label: '用户分析', path: '/admin/analytics/users' },
      { key: 'ana-calls', label: '调用分析', path: '/admin/analytics/calls' },
      { key: 'ana-revenue', label: '收入分析', path: '/admin/analytics/revenue' }
    ]
  }
]

const ENV_LABEL: Record<string, { text: string; color: string }> = {
  development: { text: 'DEV', color: 'var(--color-warning)' },
  staging: { text: 'STAGING', color: 'var(--color-purple)' },
  production: { text: 'PROD', color: 'var(--color-success)' }
}

function getEnv(): string {
  const env = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE || 'development'
  return env
}

function findActiveKey(pathname: string): string {
  let best = 'dashboard'
  let bestLen = 0
  for (const g of NAV_GROUPS) {
    for (const c of g.children) {
      if (pathname.startsWith(c.path) && c.path.length > bestLen) {
        best = c.key
        bestLen = c.path.length
      }
    }
  }
  return best
}

function findOpenGroup(pathname: string): string[] {
  for (const g of NAV_GROUPS) {
    for (const c of g.children) {
      if (pathname.startsWith(c.path)) return [g.key]
    }
  }
  return ['dashboard']
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAdminAuthStore((s) => s.user)
  const clearAdminAuth = useAdminAuthStore((s) => s.clearAdminAuth)

  const selectedKey = useMemo(() => findActiveKey(location.pathname), [location.pathname])
  const openKeys = useMemo(() => findOpenGroup(location.pathname), [location.pathname])

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        key: g.key,
        icon: g.icon,
        label: g.label,
        children: g.children.map((c) => ({
          key: c.key,
          label: c.label,
          onClick: () => navigate(c.path)
        }))
      })),
    [navigate]
  )

  const handleLogout = async () => {
    try {
      await adminLogout()
    } catch {
      // 后端登出失败不阻塞
    }
    clearAdminAuth()
    navigate('/admin/login', { replace: true })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '管理员信息'
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ]

  const env = getEnv()
  const envInfo = ENV_LABEL[env] || ENV_LABEL.development

  return (
    <Layout className={styles.layout}>
      <Header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <SafetyCertificateOutlined className={styles.topbarLogo} />
          <span className={styles.topbarTitle}>管理后台</span>
          <Tag color="blue" className={styles.envTag}>{envInfo.text}</Tag>
        </div>
        <div className={styles.topbarRight}>
          <BellOutlined className={styles.iconBtn} />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className={styles.avatarWrap}>
              <Avatar size={28} icon={<UserOutlined />} src={user?.avatar} />
              <span className={styles.adminName}>{user?.username || '管理员'}</span>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout className={styles.body}>
        <Sider width={220} className={styles.sidebar} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={openKeys}
            items={menuItems}
            className={styles.menu}
          />
        </Sider>

        <Layout className={styles.contentLayout}>
          <Content className={styles.content}>
            <Breadcrumb />
            <Outlet />
          </Content>
        </Layout>
      </Layout>

      <Footer className={styles.bottombar}>
        <div className={styles.bottomLeft}>
          <span className={styles.bottomItem}>深瞳AI 管理后台 v0.3.1</span>
          <span className={styles.bottomItem}>
            环境: <span style={{ color: envInfo.color, fontWeight: 600 }}>{envInfo.text}</span>
          </span>
        </div>
        <div className={styles.bottomRight}>
          <span className={styles.bottomItem}>
            <UserOutlined style={{ marginRight: 4 }} />
            {user?.username || '管理员'}
          </span>
          <span className={styles.bottomItem}>© 2026 深瞳AI</span>
        </div>
      </Footer>
    </Layout>
  )
}
