/**
 * Sidebar — v5.0 Kimi 风格极简导航
 * 主导航 5 项（对话/ST-Claw/团队/AI办公室/知识库），固定展开不折叠
 * 次级入口收纳到左下角「用户 + 更多」弹出菜单
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Dropdown, type MenuProps } from 'antd'
import {
  MessageSquare,
  Clapperboard,
  Users,
  Building2,
  BookOpen,
  Workflow,
  Store,
  Send,
  Zap,
  Coins,
  Settings,
  Server,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import styles from './styles.module.css'

interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  path: string
}

/** 主导航（用户确认顺序） */
const PRIMARY_NAV: NavItem[] = [
  { key: 'chat', label: '对话', icon: MessageSquare, path: '/chat' },
  { key: 'video-claw', label: 'ST-Claw', icon: Clapperboard, path: '/video-claw' },
  { key: 'team', label: '团队', icon: Users, path: '/team' },
  { key: 'office', label: 'AI 办公室', icon: Building2, path: '/office' },
  { key: 'knowledge', label: '知识库', icon: BookOpen, path: '/knowledge' },
]

/** 次级入口（隐藏收纳，通过左下角「更多」展开） */
const MORE_NAV: NavItem[] = [
  { key: 'workflow', label: '工作流', icon: Workflow, path: '/workflow' },
  { key: 'market', label: '市场', icon: Store, path: '/skill-market' },
  { key: 'channels', label: '渠道', icon: Send, path: '/channels' },
  { key: 'automation', label: '自动化', icon: Zap, path: '/automation' },
  { key: 'credits', label: '积分', icon: Coins, path: '/credits' },
  { key: 'settings', label: '设置', icon: Settings, path: '/settings' },
  { key: 'services', label: '服务', icon: Server, path: '/services' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  const isActive = (path: string): boolean => {
    // /office 不参与前缀匹配（避免成为默认激活项）
    if (path === '/office') return location.pathname === '/office'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const moreItems: MenuProps['items'] = MORE_NAV.map((item) => {
    const Icon = item.icon
    return {
      key: item.key,
      icon: <Icon size={15} />,
      label: item.label,
      onClick: () => navigate(item.path),
    }
  })

  const activeMoreKey = MORE_NAV.find((item) => isActive(item.path))?.key

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.navList}>
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <div
              key={item.key}
              className={styles.navItem + (active ? ' ' + styles.navActive : '')}
              onClick={() => navigate(item.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(item.path)
              }}
            >
              <span className={styles.navIcon}>
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className={styles.navLabel}>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {/* 左下角：用户 + 更多 */}
      <div className={styles.userArea}>
        <Avatar
          size={28}
          src={user?.avatar || undefined}
          className={styles.userAvatar}
        >
          {(user?.username || '用').slice(0, 1).toUpperCase()}
        </Avatar>
        <span className={styles.userName}>{user?.username || '用户'}</span>
        <Dropdown
          menu={{
            items: moreItems,
            selectedKeys: activeMoreKey ? [activeMoreKey] : [],
          }}
          trigger={['click']}
          placement="topLeft"
        >
          <span className={styles.moreBtn} role="button" tabIndex={0}>
            <MoreHorizontal size={16} />
            <span className={styles.moreText}>更多</span>
          </span>
        </Dropdown>
      </div>
    </aside>
  )
}
