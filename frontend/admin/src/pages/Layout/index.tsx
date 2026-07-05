// 管理端主布局 - SubTask 17.7
//
// 结构：顶栏(48px,logo + 管理员头像菜单) + 侧边栏(200px,12 项菜单) + 内容区(Outlet)
// 侧边栏菜单:仪表盘/用户管理/Key池/Agent/工作流/插件/模型/财务/审核/统计/版本/系统

import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Dropdown, Menu, type MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DollarOutlined,
  KeyOutlined,
  LogoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
  AuditOutlined,
  CloudSyncOutlined
} from '@ant-design/icons'
import { useAdminAuthStore } from '@/store/admin-auth'
import { adminLogout } from '@/api/admin-auth-api'
import styles from './styles.module.css'

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlined />, path: '/dashboard' },
  { key: 'users', label: '用户管理', icon: <TeamOutlined />, path: '/users' },
  { key: 'apikey-pool', label: 'Key 池', icon: <KeyOutlined />, path: '/api-key-pool' },
  { key: 'agent', label: 'Agent', icon: <RobotOutlined />, path: '/agents' },
  { key: 'workflow', label: '工作流', icon: <AppstoreOutlined />, path: '/workflows' },
  { key: 'plugin', label: '插件', icon: <ToolOutlined />, path: '/plugins' },
  { key: 'model', label: '模型', icon: <CloudServerOutlined />, path: '/models' },
  { key: 'finance', label: '财务', icon: <DollarOutlined />, path: '/finance' },
  { key: 'audit', label: '审核', icon: <AuditOutlined />, path: '/audit' },
  { key: 'stats', label: '统计', icon: <BarChartOutlined />, path: '/stats' },
  { key: 'version', label: '版本', icon: <CloudSyncOutlined />, path: '/versions' },
  { key: 'system', label: '系统', icon: <SettingOutlined />, path: '/system' }
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAdminAuthStore((s) => s.user)
  const clearAdminAuth = useAdminAuthStore((s) => s.clearAdminAuth)

  const selectedKey = useMemo(() => {
    const matched = MENU_ITEMS.find((item) =>
      location.pathname.startsWith(item.path)
    )
    return matched?.key || 'dashboard'
  }, [location.pathname])

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      MENU_ITEMS.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        onClick: () => navigate(item.path)
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
    navigate('/login', { replace: true })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'roles',
      icon: <SafetyCertificateOutlined />,
      label: '角色权限',
      onClick: () => navigate('/roles')
    },
    {
      key: 'logs',
      icon: <AuditOutlined />,
      label: '操作日志',
      onClick: () => navigate('/operation-logs')
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ]

  return (
    <div className={styles.layout}>
      {/* 顶栏 */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <SafetyCertificateOutlined className={styles.topbarLogo} />
          <span className={styles.topbarTitle}>深瞳AI 管理后台</span>
        </div>
        <div className={styles.topbarRight}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar
                size={28}
                icon={<UserOutlined />}
                src={user?.avatar}
                style={{ background: 'rgba(56, 189, 248, 0.25)' }}
              />
              <span className={styles.adminName}>{user?.username || '管理员'}</span>
            </div>
          </Dropdown>
        </div>
      </div>

      <div className={styles.body}>
        {/* 侧边栏 */}
        <div className={styles.sidebar}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            style={{
              background: 'transparent',
              borderInlineEnd: 'none'
            }}
            theme="dark"
          />
        </div>

        {/* 内容区 */}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
