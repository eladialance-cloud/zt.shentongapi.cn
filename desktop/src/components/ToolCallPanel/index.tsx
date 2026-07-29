// 工具调用面板 - v0.3.1 共享组件 Task 3
// Ant Design Collapse 折叠面板展示工具名/参数/结果/耗时
import { Collapse, Spin, Tag } from 'antd'
import type { ReactNode } from 'react'
import styles from './styles.module.css'

export type ToolCallStatus = 'success' | 'error' | 'running'

export interface ToolCallPanelProps {
  toolName: string
  input: unknown
  output: unknown
  duration?: number
  status?: ToolCallStatus
  timestamp?: string
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function StatusBadge({ status }: { status: ToolCallStatus }) {
  if (status === 'running') {
    return (
      <Tag color="processing" icon={<Spin size="small" />}>
        运行中
      </Tag>
    )
  }
  if (status === 'error') {
    return <Tag color="error">失败</Tag>
  }
  return <Tag color="success">成功</Tag>
}

export default function ToolCallPanel({
  toolName,
  input,
  output,
  duration,
  status = 'success',
  timestamp
}: ToolCallPanelProps) {
  const header: ReactNode = (
    <div className={styles.header}>
      <span className={styles.toolName}>{toolName}</span>
      <StatusBadge status={status} />
      {duration !== undefined && (
        <span className={styles.duration}>{duration}ms</span>
      )}
      {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <Collapse
        items={[
          {
            key: '1',
            label: header,
            children: (
              <div className={styles.body}>
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>入参</div>
                  <pre className={styles.pre}>{formatJson(input)}</pre>
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>出参</div>
                  <pre className={styles.pre}>{formatJson(output)}</pre>
                </div>
              </div>
            )
          }
        ]}
        size="small"
      />
    </div>
  )
}
