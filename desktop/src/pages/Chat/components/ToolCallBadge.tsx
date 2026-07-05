// 工具调用展示组件
// 显示工具调用标签：[🔧 工具调用] 工具名称
// 展开后显示：输入参数、输出结果、执行耗时、积分消耗
// 状态：running（转圈）/ success（绿色对勾）/ failed（红色叉）

import { useState } from 'react'
import { Tooltip } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  ToolOutlined,
  DownOutlined,
  RightOutlined
} from '@ant-design/icons'
import type { ToolCallInfo } from '@/types/chat'
import styles from '../styles.module.css'

interface ToolCallBadgeProps {
  toolCall: ToolCallInfo
  /** 默认是否展开 */
  defaultExpanded?: boolean
}

/** 状态图标 */
function StatusIcon({ status }: { status: ToolCallInfo['status'] }) {
  if (status === 'running') {
    return <LoadingOutlined className={styles.toolCallStatusRunning} spin />
  }
  if (status === 'success') {
    return <CheckCircleFilled className={styles.toolCallStatusSuccess} />
  }
  return <CloseCircleFilled className={styles.toolCallStatusFailed} />
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** 安全 stringify */
function safeStringify(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallBadge({ toolCall, defaultExpanded = false }: ToolCallBadgeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const statusText =
    toolCall.status === 'running'
      ? '执行中'
      : toolCall.status === 'success'
        ? '执行完成'
        : '执行失败'

  return (
    <div className={styles.toolCallBadge}>
      <div
        className={styles.toolCallHeader}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <ToolOutlined />
        <span className={styles.toolCallName}>{toolCall.name}</span>
        <StatusIcon status={toolCall.status} />
        <span style={{ color: '#6e7681' }}>{statusText}</span>
        {toolCall.status !== 'running' && (
          <Tooltip title="执行耗时">
            <span style={{ color: '#6e7681' }}>· {formatDuration(toolCall.duration)}</span>
          </Tooltip>
        )}
        {toolCall.creditsCost > 0 && (
          <Tooltip title="积分消耗">
            <span style={{ color: '#34d399' }}>· 💎 {toolCall.creditsCost}</span>
          </Tooltip>
        )}
      </div>
      {expanded && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallRow}>
            <span className={styles.toolCallRowLabel}>输入:</span>
            <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
              {safeStringify(toolCall.input)}
            </pre>
          </div>
          {toolCall.status !== 'running' && (
            <div className={styles.toolCallRow}>
              <span className={styles.toolCallRowLabel}>输出:</span>
              <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {safeStringify(toolCall.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ToolCallBadge
