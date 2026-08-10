// 管理端主布局 - SubTask 17.7
//
// 结构：顶栏(48px, logo + 管理员头像菜单) + 侧边栏(200px, 分组菜单) + 内容区(Outlet)
// 侧边栏菜单(Task 2 精简版 6 项): 仪表盘/用户管理/内容管理/模型与配置/财务管理/系统管理

import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Dropdown, Menu, type MenuProps } from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DollarOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useAdminAuthStore } from '@/store/admin-auth'
import { adminLogout } from '@/api/admin-auth-api'
import styles from './styles.module.css'

interface MenuEntry {
  key: string
  label: string
  icon?: React.ReactNode
  path?: string
  children?: MenuEntry[]
}

const MENU_ENTRIES: MenuEntry[] = [
  { key: 'dashboard', label: '仪表盘', icon: <DashboardOutlined />, path: '/dashboard' },
  {
    key: 'group-users',
    label: '用户管理',
    icon: <TeamOutlined />,
    children: [
      { key: 'users', label: '用户列表', path: '/users' },
      { key: 'users-levels', label: '用户等级', path: '/users/levels' },
      { key: 'users-orders', label: '用户订单', path: '/users/orders' },
      { key: 'users-devices', label: '设备管理', path: '/users/devices' }
    ]
  },
  {
    key: 'group-content',
    label: '内容管理',
    icon: <AppstoreOutlined />,
    children: [
      { key: 'agents', label: '智能体', path: '/agents' },
      { key: 'workflows', label: '工作流', path: '/workflows' },
      { key: 'plugins', label: '插件', path: '/plugins' },
      { key: 'skills', label: '技能', path: '/skills' },
      { key: 'knowledge-bases', label: '官方知识库', path: '/content/knowledge-bases' },
      { key: 'review', label: '审核中心', path: '/review' }
    ]
  },
  {
    key: 'group-config',
    label: '模型与配置',
    icon: <CloudServerOutlined />,
    children: [
      { key: 'models', label: '模型管理', path: '/models' },
      { key: 'mcp', label: 'MCP 服务', path: '/mcp' },
      { key: 'infra', label: '基础设施', path: '/infra' }
    ]
  },
  {
    key: 'group-finance',
    label: '财务管理',
    icon: <DollarOutlined />,
    children: [
      { key: 'finance-transactions', label: '积分流水', path: '/finance/transactions' },
      { key: 'finance-orders', label: '订单管理', path: '/finance/orders' },
      {
        key: 'finance-more',
        label: '更多设置',
        children: [
          { key: 'finance-invoices', label: '发票管理', path: '/finance/invoices' },
          { key: 'finance-reconciliation', label: '对账管理', path: '/finance/reconciliation' },
          { key: 'finance-recharge-plans', label: '充值档位', path: '/finance/recharge-plans' },
          { key: 'finance-payment-config', label: '支付配置', path: '/finance/payment-config' },
          { key: 'plans', label: '套餐管理', path: '/plans' }
        ]
      }
    ]
  },
  {
    key: 'group-system',
    label: '系统管理',
    icon: <SettingOutlined />,
    children: [
      { key: 'system-config', label: '系统参数', path: '/system/config' },
      { key: 'system-announcements', label: '公告管理', path: '/system/announcements' },
      { key: 'versions', label: '版本发布', path: '/versions' },
      { key: 'stats', label: '数据统计', path: '/stats' },
      { key: 'audit-queue', label: '审核队列', path: '/audit/queue' },
      { key: 'audit-sensitive-words', label: '敏感词库', path: '/audit/sensitive-words' },
      { key: 'audit-ai-config', label: 'AI 审核配置', path: '/audit/ai-config' }
    ]
  }
]

interface LeafInfo {
  key: string
  path: string
  /** 展开链（从一级分组到最深父级），用于多级菜单自动展开 */
  parentChain: string[]
}

// 展开所有叶子节点，便于根据 pathname 反查选中项与所属分组。
const ALL_LEAVES: LeafInfo[] = (() => {
  const leaves: LeafInfo[] = []
  const walk = (entries: MenuEntry[], chain: string[]): void => {
    for (const entry of entries) {
      if (entry.children && entry.children.length > 0) {
        walk(entry.children, [...chain, entry.key])
      } else if (entry.path) {
        leaves.push({ key: entry.key, path: entry.path, parentChain: chain })
      }
    }
  }
  walk(MENU_ENTRIES, [])
  return leaves
})()

// 按路径长度降序，保证更具体的路径优先匹配（如 /users/levels 优先于 /users）。
const SORTED_LEAVES: LeafInfo[] = [...ALL_LEAVES].sort(
  (a, b) => b.path.length - a.path.length
)

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAdminAuthStore((s) => s.user)
  const clearAdminAuth = useAdminAuthStore((s) => s.clearAdminAuth)

  const { selectedKey, parentChain } = useMemo(() => {
    const matched = SORTED_LEAVES.find((leaf) =>
      location.pathname.startsWith(leaf.path)
    )
    return {
      selectedKey: matched?.key || 'dashboard',
      parentChain: matched?.parentChain ?? []
    }
  }, [location.pathname])

  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const matched = SORTED_LEAVES.find((leaf) =>
      location.pathname.startsWith(leaf.path)
    )
    return matched?.parentChain ?? []
  })

  // 当选中项所在分组未展开时自动展开（如通过 URL 直接访问子页面）
  useEffect(() => {
    if (parentChain.some((key) => !openKeys.includes(key))) {
      setOpenKeys((prev) => Array.from(new Set([...prev, ...parentChain])))
    }
  }, [parentChain, openKeys])

  const handleOpenChange = (keys: React.Key[]) => {
    setOpenKeys(keys.map(String))
  }

  const buildMenuItems = (entries: MenuEntry[]): MenuProps['items'] =>
    entries.map((entry) => {
      if (entry.children && entry.children.length > 0) {
        return {
          key: entry.key,
          icon: entry.icon,
          label: entry.label,
          children: buildMenuItems(entry.children)
        }
      }
      return {
        key: entry.key,
        icon: entry.icon,
        label: entry.label,
        onClick: () => entry.path && navigate(entry.path)
      }
    })

  const menuItems: MenuProps['items'] = useMemo(
    () => buildMenuItems(MENU_ENTRIES),
    [navigate]
  )

  const handleLogout = async () => {
    try {
      await adminLogout()
    } catch {
      // 后端登出失败不阻止。
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
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
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
