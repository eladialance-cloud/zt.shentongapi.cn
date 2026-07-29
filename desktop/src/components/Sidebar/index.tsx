/**
 * Sidebar — v0.3.1 左侧导航栏 (Task 5)
 * 4 个分组 17 项导航，200px 展开 / 64px 折叠
 * 干净浅色主题（移除赛博矩阵装饰），激活态使用 primary-light 背景
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { Tooltip } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import styles from './styles.module.css'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface NavItem {
  key: string
  label: string
  icon: string
  path: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

/** 4 个分组 × 12 项导航（去重精简：合并 agents→agent-market、opc→team、skill-market→hermes 子Tab、mcp-config→services） */
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'AI 办公区',
    items: [
      { key: 'dashboard', label: '仪表盘', icon: '📊', path: '/dashboard' },
      { key: 'office', label: 'AI 办公室', icon: '🏢', path: '/office' },
      { key: 'chat', label: '对话', icon: '💬', path: '/chat' },
      { key: 'automation', label: '自动化', icon: '⚡', path: '/automation' }
    ]
  },
  {
    title: '工作区',
    items: [
      { key: 'hermes', label: 'Hermes', icon: '🧩', path: '/hermes' },
      { key: 'plugins', label: '插件', icon: '🔌', path: '/plugins' },
      { key: 'knowledge', label: '知识库', icon: '📚', path: '/knowledge' },
      { key: 'team', label: '团队', icon: '👥', path: '/team' }
    ]
  },
  {
    title: '资源区',
    items: [
      { key: 'agent-market', label: '智能体市场', icon: '🤖', path: '/agent-market' },
      { key: 'workflows', label: '工作流', icon: '📋', path: '/workflows' },
      { key: 'credits', label: '积分', icon: '💎', path: '/credits' }
    ]
  },
  {
    title: '设置区',
    items: [
      { key: 'settings', label: '设置', icon: '⚙️', path: '/settings' },
      { key: 'services', label: '服务', icon: '🔧', path: '/services' }
    ]
  }
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  const isActive = (path: string): boolean => {
    // /office 不参与前缀匹配（避免成为默认激活项）
    if (path === '/office') return location.pathname === '/office'
    return (
      location.pathname === path || location.pathname.startsWith(path + '/')
    )
  }

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
    >
      <nav className={styles.navList}>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className={styles.navGroup}>
            {!collapsed && (
              <div className={styles.groupTitle}>{group.title}</div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.path)
              const itemEl = (
                <div
                  key={item.key}
                  className={`${styles.navItem} ${
                    active ? styles.navActive : ''
                  }`}
                  onClick={() => handleNavigate(item.path)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {!collapsed && (
                    <span className={styles.navLabel}>{item.label}</span>
                  )}
                </div>
              )
              return collapsed ? (
                <Tooltip
                  key={item.key}
                  title={item.label}
                  placement="right"
                >
                  {itemEl}
                </Tooltip>
              ) : (
                itemEl
              )
            })}
          </div>
        ))}
      </nav>

      {/* 折叠按钮 */}
      <div
        className={styles.collapseBtn}
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
        {collapsed ? (
          <MenuUnfoldOutlined />
        ) : (
          <MenuFoldOutlined />
        )}
      </div>
    </aside>
  )
}
