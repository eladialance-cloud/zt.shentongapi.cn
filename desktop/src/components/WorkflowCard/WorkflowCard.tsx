/**
 * WorkflowCard — 工作流模板展示卡片（重新设计版）
 *
 * 设计风格：赛博科技深色 + 玻璃拟态 + 流程可视化
 * 设计系统：基于 design-tokens.css CSS 变量
 *
 * 特点：
 * - 顶部预览区：渐变背景 + 流程节点缩略图（SVG 节点连线）
 * - 信息区：名称 / 分类标签 / 描述
 * - 数据区：使用次数 + 积分消耗（玻璃胶囊）
 * - 执行状态指示器（可选，传入 executionStatus 显示最近执行状态）
 * - 操作区：使用模板 + 详情
 * - 悬停：上浮 + 边框发光 + 预览区亮度提升
 */

import { CSSProperties, MouseEvent } from 'react'
import {
  ThunderboltOutlined,
  PlayCircleOutlined,
  FireOutlined,
  PictureOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  ArrowRightOutlined
} from '@ant-design/icons'
import type { WorkflowTemplate, WorkflowExecutionStatus } from '@/types/workflow'
import styles from './WorkflowCard.module.css'

// ===== 分类配色 =====
const CATEGORY_THEME: Record<string, { color: string; bg: string; border: string; gradient: string }> = {
  automation: {
    color: '#34D399',
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.35)',
    gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.18), rgba(34, 197, 94, 0.06))'
  },
  integration: {
    color: '#FBBF24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.35)',
    gradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(245, 158, 11, 0.06))'
  },
  data_processing: {
    color: '#F472B6',
    bg: 'rgba(244, 114, 182, 0.12)',
    border: 'rgba(244, 114, 182, 0.35)',
    gradient: 'linear-gradient(135deg, rgba(244, 114, 182, 0.18), rgba(236, 72, 153, 0.06))'
  },
  other: {
    color: '#A78BFA',
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.35)',
    gradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.18), rgba(139, 92, 246, 0.06))'
  },
}

function getCategoryTheme(category: string) {
  return CATEGORY_THEME[category] || CATEGORY_THEME.other
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    automation: '自动化',
    integration: '集成',
    data_processing: '数据处理',
    other: '其他'
  }
  return labels[category] || '其他'
}

// ===== 执行状态渲染 =====
const STATUS_CONFIG: Record<WorkflowExecutionStatus, { icon: React.ReactNode; label: string; color: string }> = {
  success:  { icon: <CheckCircleFilled />,   label: '成功',   color: '#34D399' },
  failed:   { icon: <CloseCircleFilled />,    label: '失败',   color: '#F87171' },
  running:  { icon: <ClockCircleFilled />,    label: '执行中', color: '#FBBF24' },
  canceled: { icon: <ClockCircleFilled />,    label: '已取消', color: '#8B949E' },
}

// ===== 流程节点缩略图（SVG） =====
function FlowPreview({ color }: { color: string }) {
  // 3 个节点 + 连线的简化流程图
  return (
    <svg className={styles.flowSvg} viewBox="0 0 200 80" fill="none">
      {/* 连线 */}
      <line x1="40" y1="40" x2="80" y2="40" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
      <line x1="120" y1="40" x2="160" y2="40" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
      {/* 节点 1：输入 */}
      <rect x="16" y="28" width="24" height="24" rx="6" fill={color} fillOpacity="0.15" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="28" cy="40" r="4" fill={color} fillOpacity="0.6" />
      {/* 节点 2：处理 */}
      <circle cx="100" cy="40" r="14" fill={color} fillOpacity="0.12" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="100" cy="40" r="5" fill={color} fillOpacity="0.6" />
      {/* 节点 3：输出 */}
      <rect x="160" y="28" width="24" height="24" rx="6" fill={color} fillOpacity="0.15" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
      <path d="M168 40 L174 36 L174 44 Z" fill={color} fillOpacity="0.6" />
    </svg>
  )
}

// ===== 主组件 =====
export interface WorkflowCardProps {
  template: WorkflowTemplate
  /** 最近执行状态（可选，展示在卡片右上角） */
  lastExecutionStatus?: WorkflowExecutionStatus
  onUse?: () => void
  onOpenDetail?: () => void
  style?: CSSProperties
}

export default function WorkflowCard({
  template,
  lastExecutionStatus,
  onUse,
  onOpenDetail,
  style
}: WorkflowCardProps) {
  const theme = getCategoryTheme(template.category)
  const statusConfig = lastExecutionStatus ? STATUS_CONFIG[lastExecutionStatus] : null

  const handleCardClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-action]')) return
    onOpenDetail?.()
  }

  return (
    <div
      className={styles.card}
      style={{
        ...style,
        ['--card-accent' as string]: theme.color,
        ['--card-accent-bg' as string]: theme.bg,
        ['--card-accent-border' as string]: theme.border,
        ['--card-accent-gradient' as string]: theme.gradient,
      }}
      onClick={handleCardClick}
    >
      {/* ====== 预览区 ====== */}
      <div className={styles.preview}>
        {template.previewImage ? (
          <img loading="lazy" src={template.previewImage} alt={template.name} className={styles.previewImg} />
        ) : (
          <div className={styles.previewPlaceholder}>
            <FlowPreview color={theme.color} />
          </div>
        )}

        {/* 分类标签（浮在预览区左上角） */}
        <span className={styles.categoryTag}>
          {categoryLabel(template.category)}
        </span>

        {/* 执行状态（浮在预览区右上角） */}
        {statusConfig && (
          <span
            className={styles.statusBadge}
            style={{ color: statusConfig.color, borderColor: `${statusConfig.color}55` }}
          >
            {statusConfig.icon}
            <span>{statusConfig.label}</span>
          </span>
        )}
      </div>

      {/* ====== 内容区 ====== */}
      <div className={styles.body}>
        {/* 标题 */}
        <h3 className={styles.title}>{template.name}</h3>

        {/* 描述 */}
        <p className={styles.description}>
          {template.description || '暂无描述'}
        </p>

        {/* 数据胶囊 */}
        <div className={styles.metaRow}>
          <div className={styles.pillUsage}>
            <FireOutlined className={styles.pillIcon} />
            <span>{(template.usageCount ?? 0).toLocaleString()} 次使用</span>
          </div>
          {template.pricePerExecution != null && template.pricePerExecution > 0 && (
            <div className={styles.pillCost}>
              <ThunderboltOutlined className={styles.pillIcon} />
              <span>{template.pricePerExecution} 积分/次</span>
            </div>
          )}
          {template.pricePerExecution === 0 && (
            <div className={styles.pillFree}>
              <ThunderboltOutlined className={styles.pillIcon} />
              <span>免费</span>
            </div>
          )}
        </div>
      </div>

      {/* ====== 操作区 ====== */}
      <div className={styles.footer}>
        <button
          className={styles.useBtn}
          data-action="use"
          onClick={(e) => {
            e.stopPropagation()
            onUse?.()
          }}
        >
          <PlayCircleOutlined className={styles.useBtnIcon} />
          <span>使用模板</span>
        </button>
        <button
          className={styles.detailBtn}
          data-action="detail"
          onClick={(e) => {
            e.stopPropagation()
            onOpenDetail?.()
          }}
          title="查看详情"
        >
          <ArrowRightOutlined />
        </button>
      </div>
    </div>
  )
}
