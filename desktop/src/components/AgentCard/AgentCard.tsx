/**
 * AgentCard — Agent 市场卡片组件（重新设计版）
 *
 * 设计风格：赛博科技深色 + 玻璃拟态 + 微光效
 * 设计系统：基于 design-tokens.css CSS 变量
 *
 * 特点：
 * - 头像区：渐变背景 + 光晕 + 状态指示灯
 * - 信息区：名称/官方徽章/评分/标签/描述
 * - 数据区：调用次数 + 价格（玻璃胶囊）
 * - 操作区：使用按钮 + 收藏 + 详情
 * - 悬停：上浮 + 边框发光 + 头像光晕扩散
 */

import { CSSProperties, MouseEvent } from 'react'
import {
  CrownOutlined,
  HeartOutlined,
  HeartFilled,
  ThunderboltOutlined,
  FireOutlined,
  RobotOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import type { Agent } from '@/types/agent'
import styles from './AgentCard.module.css'

// ===== 分类配色映射 =====
const CATEGORY_THEME: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  office:           { color: '#4F6EF7', bg: 'rgba(79, 110, 247, 0.12)',  border: 'rgba(79, 110, 247, 0.35)',  icon: '💼' },
  programming:      { color: '#22D3EE', bg: 'rgba(34, 211, 238, 0.12)',  border: 'rgba(34, 211, 238, 0.35)',  icon: '⚡' },
  copywriting:      { color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.35)', icon: '✍️' },
  data_analysis:    { color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)',  border: 'rgba(52, 211, 153, 0.35)',  icon: '📊' },
  other:            { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)',  border: 'rgba(251, 191, 36, 0.35)',  icon: '🌟' },
}

function getCategoryTheme(category: string) {
  return CATEGORY_THEME[category] || CATEGORY_THEME.other
}

// ===== 评分星星渲染 =====
function RatingStars({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.5
  return (
    <div className={styles.ratingWrap}>
      <div className={styles.stars}>
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full
          const half = i === full && hasHalf
          return (
            <span
              key={i}
              className={`${styles.star} ${filled ? styles.starFull : half ? styles.starHalf : styles.starEmpty}`}
            >
              ★
            </span>
          )
        })}
      </div>
      <span className={styles.ratingValue}>{rating.toFixed(1)}</span>
      <span className={styles.ratingCount}>({count})</span>
    </div>
  )
}

// ===== 主组件 =====
export interface AgentCardProps {
  agent: Agent
  onUse?: () => void
  onToggleFav?: () => void
  onOpenDetail?: () => void
  /** 自定义样式覆盖 */
  style?: CSSProperties
}

export default function AgentCard({
  agent,
  onUse,
  onToggleFav,
  onOpenDetail,
  style
}: AgentCardProps) {
  const theme = getCategoryTheme(agent.category)
  const isFree = agent.pricePerCall === 0
  const avatarText = agent.name.charAt(0).toUpperCase()

  const handleCardClick = (e: MouseEvent) => {
    // 点击卡片本身 → 详情
    if ((e.target as HTMLElement).closest('[data-action]')) return
    onOpenDetail?.()
  }

  return (
    <div
      className={styles.card}
      style={{
        ...style,
        // 动态注入分类主题色作为 CSS 变量
        ['--card-accent' as string]: theme.color,
        ['--card-accent-bg' as string]: theme.bg,
        ['--card-accent-border' as string]: theme.border,
      }}
      onClick={handleCardClick}
    >
      {/* ====== 顶部光效条 ====== */}
      <div className={styles.topGlow} />

      {/* ====== 头像区 ====== */}
      <div className={styles.header}>
        <div className={styles.avatarSection}>
          <div
            className={styles.avatar}
            style={{
              background: `linear-gradient(135deg, ${theme.bg}, ${theme.color}22)`,
              borderColor: theme.border,
            }}
          >
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarText} style={{ color: theme.color }}>
                {avatarText}
              </span>
            )}
          </div>
          {/* 状态指示灯（官方/社区） */}
          {agent.isOfficial && (
            <div className={styles.officialDot} title="官方认证" />
          )}
        </div>

        <div className={styles.titleSection}>
          <div className={styles.nameRow}>
            {agent.isOfficial && (
              <span className={styles.officialBadge}>
                <CrownOutlined /> 官方
              </span>
            )}
            <h3 className={styles.name}>{agent.name}</h3>
          </div>
          <RatingStars rating={agent.rating} count={agent.ratingCount} />
        </div>

        {/* 收藏按钮 */}
        <button
          className={`${styles.favBtn} ${agent.isFavorited ? styles.favBtnActive : ''}`}
          data-action="fav"
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav?.()
          }}
          title={agent.isFavorited ? '取消收藏' : '收藏'}
        >
          {agent.isFavorited ? <HeartFilled /> : <HeartOutlined />}
        </button>
      </div>

      {/* ====== 描述 ====== */}
      <p className={styles.description}>
        {agent.description || '暂无描述'}
      </p>

      {/* ====== 标签 ====== */}
      {agent.tags && agent.tags.length > 0 && (
        <div className={styles.tags}>
          {agent.tags.slice(0, 4).map((tag, i) => (
            <span key={i} className={styles.tag}>{tag}</span>
          ))}
        </div>
      )}

      {/* ====== 数据胶囊 ====== */}
      <div className={styles.metaRow}>
        <div className={`${styles.pill} ${isFree ? styles.pillFree : styles.pillPaid}`}>
          {isFree ? (
            <>
              <ThunderboltOutlined className={styles.pillIcon} />
              <span>免费</span>
            </>
          ) : (
            <>
              <ThunderboltOutlined className={styles.pillIcon} />
              <span>{agent.pricePerCall} 积分/次</span>
              {(agent.pricePerToken.input > 0 || agent.pricePerToken.output > 0) && (
                <span className={styles.pillSub}>+Token</span>
              )}
            </>
          )}
        </div>
        <div className={styles.pillUsage}>
          <FireOutlined className={styles.pillIcon} />
          <span>{agent.callCount.toLocaleString()} 次调用</span>
        </div>
      </div>

      {/* ====== 操作区 ====== */}
      <div className={styles.actions}>
        <button
          className={styles.useBtn}
          data-action="use"
          onClick={(e) => {
            e.stopPropagation()
            onUse?.()
          }}
        >
          <RobotOutlined className={styles.useBtnIcon} />
          <span>使用 Agent</span>
        </button>
        <button
          className={styles.detailBtn}
          data-action="detail"
          onClick={(e) => {
            e.stopPropagation()
            onOpenDetail?.()
          }}
        >
          <ArrowRightOutlined />
        </button>
      </div>
    </div>
  )
}
