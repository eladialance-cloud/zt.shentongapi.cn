// AI 员工卡片 - v0.3.1 共享组件 Task 3
// 展示头像、状态灯、铭牌、今日完成数、待办数、主题边框
// Task 19: 状态颜色映射灵活化（statusColorMap / themeColor 可选覆盖）
import styles from './styles.module.css'

export type AIEmployeeStatus =
  | 'IDLE'
  | 'WORKING'
  | 'WORKING_DEEP'
  | 'MOVING'
  | 'VISITING'
  | 'IN_MEETING'
  | 'AT_RESOURCE'
  | 'RESTING'
  | 'OFFLINE'

export interface AIEmployeeCardProps {
  name: string
  emoji: string
  /** 主题色（边框/标题色），未提供时 fallback 到 var(--color-primary) */
  themeColor?: string
  /** 主题色浅色（头像背景），未提供时 fallback 到 var(--color-brand-light) */
  themeColorLight?: string
  status: AIEmployeeStatus
  todayCompleted: number
  todoCount: number
  onClick?: () => void
  /** 状态颜色映射覆盖：key 为状态字符串（大小写不敏感，如 'idle' / 'WORKING'），value 为 CSS 颜色 */
  statusColorMap?: Record<string, string>
}

const DEFAULT_STATUS_LIGHT_COLOR: Record<AIEmployeeStatus, string> = {
  IDLE: 'var(--color-success)',
  RESTING: 'var(--color-success)',
  WORKING: 'var(--color-warning)',
  WORKING_DEEP: 'var(--color-warning)',
  MOVING: 'var(--color-primary)',
  VISITING: 'var(--color-primary)',
  IN_MEETING: 'var(--color-primary)',
  AT_RESOURCE: 'var(--color-primary)',
  OFFLINE: 'var(--color-text-tertiary)'
}

const STATUS_LABEL: Record<AIEmployeeStatus, string> = {
  IDLE: '空闲',
  WORKING: '工作中',
  WORKING_DEEP: '深度工作',
  MOVING: '移动中',
  VISITING: '拜访中',
  IN_MEETING: '会议中',
  AT_RESOURCE: '资源位',
  RESTING: '休息中',
  OFFLINE: '离线'
}

const DEFAULT_THEME_COLOR = 'var(--color-primary)'
const DEFAULT_THEME_COLOR_LIGHT = 'var(--color-brand-light)'

export default function AIEmployeeCard({
  name,
  emoji,
  themeColor,
  themeColorLight,
  status,
  todayCompleted,
  todoCount,
  onClick,
  statusColorMap
}: AIEmployeeCardProps) {
  // 状态灯颜色：优先 statusColorMap（大小写不敏感），fallback 到默认 CSS 变量
  const resolveStatusLightColor = (): string => {
    if (statusColorMap) {
      const lowerStatus = status.toLowerCase()
      const matchedKey = Object.keys(statusColorMap).find(
        (k) => k.toLowerCase() === lowerStatus
      )
      if (matchedKey) return statusColorMap[matchedKey]
    }
    return DEFAULT_STATUS_LIGHT_COLOR[status]
  }
  const statusLightColor = resolveStatusLightColor()

  // 主题色：优先 themeColor prop，fallback 到默认 var(--color-primary)
  const resolvedThemeColor = themeColor ?? DEFAULT_THEME_COLOR
  const resolvedThemeColorLight = themeColorLight ?? DEFAULT_THEME_COLOR_LIGHT

  return (
    <div
      className={`${styles.card} animate-enter-zoom`}
      style={{
        borderColor: resolvedThemeColor,
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      <div className={styles.avatarWrap}>
        <div className={styles.avatar} style={{ background: resolvedThemeColorLight }}>
          <span className={styles.emoji}>{emoji}</span>
        </div>
        <span
          className={styles.statusLight}
          style={{ background: statusLightColor }}
          title={STATUS_LABEL[status]}
        />
      </div>
      <div className={styles.namePlate} style={{ color: resolvedThemeColor }}>
        {name}
      </div>
      <div className={styles.stats}>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>今日完成</span>
          <span className={styles.statValue}>{todayCompleted}</span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>待办</span>
          <span className={styles.statValue}>{todoCount}</span>
        </div>
      </div>
    </div>
  )
}
