// 管理后台主布局 - SubTask 17.7
//
// 结构：顶栏 48px, logo + 管理员头像菜单 + 侧边栏 200px, 15 项菜单 + 内容区 (Outlet)

import { useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Dropdown, Menu, type MenuProps } from 'antd'
import {
  ApiOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DollarOutlined,
  KeyOutlined,
  LogoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
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
  { key: ''dashboard'', label: ''仪表盘'', icon: <DashboardOutlined />, path: ''/admin/dashboard'' },
  { key: ''users'', label: ''用户管理'', icon: <TeamOutlined />, path: ''/admin/users'' },
  { key: ''apikey-pool'', label: ''Key 池'', icon: <KeyOutlined />, path: ''/admin/api-key-pool'' },
  { key: ''agent'', label: ''Agent'', icon: <RobotOutlined />, path: ''/admin/agents'' },
  { key: ''workflow'', label: ''工作流'', icon: <AppstoreOutlined />, path: ''/admin/workflows'' },
  { key: ''plugin'', label: ''插件'', icon: <ToolOutlined />, path: ''/admin/plugins'' },
  { key: ''model'', label: ''模型'', icon: <CloudServerOutlined />, path: ''/admin/models'' },
  { key: ''finance'', label: ''财务'', icon: <DollarOutlined />, path: ''/admin/finance'' },
  { key: ''audit'', label: ''审核'', icon: <AuditOutlined />, path: ''/admin/audit'' },
  { key: ''stats'', label: ''统计'', icon: <BarChartOutlined />, path: ''/admin/stats'' },
  { key: ''version'', label: ''版本'', icon: <CloudSyncOutlined />, path: ''/admin/versions'' },
  { key: ''team'', label: ''团队'', icon: <TeamOutlined />, path: ''/admin/teams'' },
  { key: ''channel'', label: ''渠道'', icon: <ApiOutlined />, path: ''/admin/channels'' },
  { key: ''publish'', label: ''发布'', icon: <SendOutlined />, path: ''/admin/publish'' },
  { key: ''system'', label: ''系统'', icon: <SettingOutlined />, path: ''/admin/system'' }
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
    return matched?.key || ''dashboard''
  }, [location.pathname])

  const menuItems: MenuProps[''items''] = useMemo(
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
    } catch {}
    clearAdminAuth()
    navigate(''/admin/login'', { replace: true })
  }

  const userMenuItems: MenuProps[''items''] = [
    {
      key: ''logout'',
      icon: <LogoutOutlined />,
      label: ''退出登录'',
      onClick: handleLogout,
    },
  ]

  return (
    <div className={styles.layout}>
      <div className={styles.topBar}>
        <div className={styles.logo}>
          <SafetyCertificateOutlined style={{ fontSize: 18, color: ''#4F6EF7'' }} />
          <span className={styles.logoText}>深瞳AI-智能中台 · 管理后台</span>
        </div>
        <div className={styles.topRight}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className={styles.userInfo}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span className={styles.userName}>{user?.username || ''管理员''}</span>
            </div>
          </Dropdown>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.sidebar}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            style={{ background: ''transparent'', borderRight: ''none'' }}
            theme="dark"
          />
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
