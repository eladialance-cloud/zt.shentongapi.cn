// 服务状态指示器 - v0.3.1 共享组件 Task 3
// 状态点 + 名称 + 端口 + 点击跳转
import styles from './styles.module.css'

export type ServiceStatusValue = 'running' | 'warning' | 'stopped' | 'unknown'

export interface ServiceStatusProps {
  name: string
  status: ServiceStatusValue
  port?: number
  onClick?: () => void
}

const STATUS_DOT_COLOR: Record<ServiceStatusValue, string> = {
  running: 'var(--color-success)',
  warning: 'var(--color-warning)',
  stopped: 'var(--color-error)',
  unknown: 'var(--color-text-quaternary)'
}

export default function ServiceStatus({
  name,
  status,
  port,
  onClick
}: ServiceStatusProps) {
  const dotColor = STATUS_DOT_COLOR[status]
  const breathingClass = status === 'running' ? styles.breathing : ''
  return (
    <div
      className={`${styles.wrap} ${onClick ? styles.clickable : ''}`}
      onClick={onClick}
    >
      <span
        className={`${styles.dot} ${breathingClass}`}
        style={{ background: dotColor }}
      />
      <span className={styles.name}>{name}</span>
      {port !== undefined && <span className={styles.port}>:{port}</span>}
    </div>
  )
}
