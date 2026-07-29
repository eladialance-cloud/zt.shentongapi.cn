/**
 * IconDock — v1.0 左侧图标导航栏
 * 48px 宽，7 个 lucide-react 图标，永久不展开
 * 激活态：brand-light 背景 + 左侧 2px 指示条
 * 快捷键：⌘1~7 / Ctrl+1~7 导航
 */
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Tooltip } from 'antd'
import {
  Building2,
  MessageSquare,
  Workflow,
  BookOpen,
  Bot,
  Users,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import styles from './styles.module.css'

interface DockItem {
  key: string
  icon: LucideIcon
  label: string
  shortcut: string
  path: string
}

const DOCK_ITEMS: DockItem[] = [
  { key: 'office',    icon: Building2,     label: 'AI 办公室',  shortcut: '⌘1', path: '/office'      },
  { key: 'chat',      icon: MessageSquare,  label: '对话',       shortcut: '⌘2', path: '/chat'        },
  { key: 'hermes',    icon: Workflow,       label: 'Hermes',    shortcut: '⌘3', path: '/hermes'      },
  { key: 'knowledge', icon: BookOpen,       label: '知识库',     shortcut: '⌘4', path: '/knowledge'   },
  { key: 'agents',    icon: Bot,            label: '智能体',     shortcut: '⌘5', path: '/agent-market' },
  { key: 'team',      icon: Users,          label: '团队',       shortcut: '⌘6', path: '/team'        },
  { key: 'settings',  icon: Settings,       label: '设置',       shortcut: '⌘7', path: '/settings'    },
]

export default function IconDock() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string): boolean => {
    if (path === '/office') return location.pathname === '/office'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  // ⌘1~7 / Ctrl+1~7 快捷键导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= DOCK_ITEMS.length) {
        e.preventDefault()
        navigate(DOCK_ITEMS[num - 1].path)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <aside className={styles.dock}>
      <nav className={styles.dockNav}>
        {DOCK_ITEMS.map((item) => {
          const active = isActive(item.path)
          const Icon = item.icon
          const el = (
            <div
              key={item.key}
              className={`${styles.dockItem} ${active ? styles.dockItemActive : ''}`}
              onClick={() => navigate(item.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(item.path)
                }
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            </div>
          )
          return (
            <Tooltip
              key={item.key}
              title={`${item.label}  ${item.shortcut}`}
              placement="right"
            >
              {el}
            </Tooltip>
          )
        })}
      </nav>
    </aside>
  )
}
