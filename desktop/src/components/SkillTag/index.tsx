// SKILL 类型标签 - v0.3.1 共享组件 Task 3
// 4 种变体：flow / reasoning / tool / custom
// Task 20: 新增 'custom' 类型支持 customColor / customLabel 自定义扩展
import type { ReactNode, CSSProperties } from 'react'
import styles from './styles.module.css'

export type SkillTagType = 'flow' | 'reasoning' | 'tool' | 'custom'
export type SkillTagSize = 'small' | 'default'

export interface SkillTagProps {
  /** 标签类型，默认 'flow'。'custom' 时使用 customColor / customLabel */
  type?: SkillTagType
  size?: SkillTagSize
  children?: ReactNode
  /** type='custom' 时的自定义颜色（CSS 颜色字符串，如 '#FF5733' 或 'var(--color-primary)'） */
  customColor?: string
  /** type='custom' 时的自定义标签文本（替代 type 默认 label；children 优先级更高） */
  customLabel?: string
}

const TYPE_LABEL: Record<Exclude<SkillTagType, 'custom'>, string> = {
  flow: '流程',
  reasoning: '推理',
  tool: '工具'
}

const DEFAULT_CUSTOM_COLOR = 'var(--color-primary)'
const DEFAULT_CUSTOM_LABEL = '自定义'

export default function SkillTag({
  type = 'flow',
  size = 'default',
  children,
  customColor,
  customLabel
}: SkillTagProps) {
  const sizeClass = size === 'small' ? styles.small : styles.default

  // type='custom'：使用 customColor / customLabel 自定义渲染
  if (type === 'custom') {
    const color = customColor ?? DEFAULT_CUSTOM_COLOR
    const label = children ?? customLabel ?? DEFAULT_CUSTOM_LABEL
    const customStyle: CSSProperties = {
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      color,
      borderColor: color
    }
    return (
      <span className={`${styles.tag} ${sizeClass}`} style={customStyle}>
        {label}
      </span>
    )
  }

  // 默认 3 种类型：保留现有逻辑（向后兼容）
  const typeClass =
    type === 'flow'
      ? styles.flow
      : type === 'reasoning'
        ? styles.reasoning
        : styles.tool
  return (
    <span className={`${styles.tag} ${typeClass} ${sizeClass}`}>
      {children ?? TYPE_LABEL[type]}
    </span>
  )
}
