// 会话项组件 - 单条会话显示

import { memo } from 'react'
import { Tooltip } from 'antd'
import { PushpinFilled, RobotOutlined } from '@ant-design/icons'
import type { ChatSession } from '@/types/chat'
import styles from '../styles.module.css'

interface SessionItemProps {
  session: ChatSession
  active: boolean
  /** 最后消息预览（外部传入，避免每次查询） */
  preview?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

/** 格式化时间为简短显示 */
function formatTime(date: Date): string {
  const d = new Date(date)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (isToday) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  if (isYesterday) {
    return '昨天'
  }

  // 7天内显示星期，否则显示日期
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weekdays[d.getDay()]
  }

  return `${d.getMonth() + 1}/${d.getDate()}`
}

function SessionItemBase({
  session,
  active,
  preview,
  onClick,
  onContextMenu
}: SessionItemProps) {
  return (
    <div
      className={`${styles.sessionItem} ${active ? styles.sessionItemActive : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className={styles.sessionItemTitle}>
        {session.pinned && (
          <Tooltip title="已置顶">
            <PushpinFilled className={styles.pinIcon} />
          </Tooltip>
        )}
        <RobotOutlined style={{ color: '#a5b4fc', fontSize: 12 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {session.title || '新对话'}
        </span>
      </div>
      {preview && <div className={styles.sessionItemPreview}>{preview}</div>}
      <div className={styles.sessionItemMeta}>
        <span>{formatTime(session.lastMessageAt || session.updatedAt)}</span>
        <span style={{ color: '#6e7681' }}>{session.modelId}</span>
      </div>
    </div>
  )
}

export const SessionItem = memo(SessionItemBase)
export default SessionItem
