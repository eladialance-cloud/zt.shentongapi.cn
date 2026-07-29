/**
 * CommandPalette — v1.0 ⌘K 全屏命令面板
 * Raycast 风格：暗色遮罩 + 居中浮层 + 分组结果 + 键盘导航
 *
 * 复用 TopBar 搜索逻辑（搜索结果数据、路由跳转、搜索范围 API）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Spin, Tag } from 'antd'
import type { InputRef } from 'antd'
import {
  RobotOutlined,
  ThunderboltOutlined,
  BookOutlined,
  ApartmentOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { getSearchCategories, type SearchCategory } from '@/api/search-api'
import styles from './styles.module.css'

interface SearchResultItem {
  id: string
  type: 'agent' | 'skill' | 'knowledge' | 'workflow'
  title: string
  subtitle?: string
}

const RESULT_TYPE_LABEL: Record<string, string> = {
  agent: 'AI 员工',
  skill: '技能',
  knowledge: '知识库',
  workflow: '工作流',
}

const RESULT_TYPE_COLOR: Record<string, string> = {
  agent: 'var(--color-brand)',
  skill: 'var(--color-purple)',
  knowledge: 'var(--color-success)',
  workflow: 'var(--color-ai-delivery)',
}

const RESULT_TYPE_ICON: Record<string, React.ReactNode> = {
  agent: <RobotOutlined />,
  skill: <ThunderboltOutlined />,
  knowledge: <BookOutlined />,
  workflow: <ApartmentOutlined />,
}

/** 占位搜索结果（与 TopBar 保持一致） */
const SEARCH_RESULTS: SearchResultItem[] = [
  { id: '1', type: 'agent', title: '商务AI', subtitle: '销售跟进与客户管理' },
  { id: '2', type: 'agent', title: '内容AI', subtitle: '内容创作与发布' },
  { id: '3', type: 'agent', title: '交付AI', subtitle: '任务交付与协调' },
  { id: '4', type: 'agent', title: '财务AI', subtitle: '财务核算与对账' },
  { id: '5', type: 'skill', title: '工作流模板生成', subtitle: '可视化编辑器' },
  { id: '6', type: 'skill', title: '文档检索', subtitle: '基于向量库的语义检索' },
  { id: '7', type: 'skill', title: '邮件自动回复', subtitle: 'IMAP/SMTP 集成' },
  { id: '8', type: 'knowledge', title: '产品手册', subtitle: '12 篇文档' },
  { id: '9', type: 'knowledge', title: '运营手册', subtitle: '8 篇文档' },
  { id: '10', type: 'knowledge', title: '技术规范', subtitle: '5 篇文档' },
  { id: '11', type: 'workflow', title: '内容生成 v2', subtitle: '5 节点' },
  { id: '12', type: 'workflow', title: '客户对接流程', subtitle: '8 节点' },
  { id: '13', type: 'workflow', title: '月度复盘', subtitle: '6 节点' },
]

function buildRoutePath(item: SearchResultItem, query: string): string {
  switch (item.type) {
    case 'agent':      return `/agents/${item.id}`
    case 'skill':      return '/skill-market'
    case 'knowledge':  return `/knowledge/search?q=${encodeURIComponent(query)}`
    case 'workflow':   return `/workflows/${item.id}`
    default:           return '/dashboard'
  }
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const inputRef = useRef<InputRef>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [categories, setCategories] = useState<SearchCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  // 打开时自动聚焦 + 拉取搜索范围
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)

      if (categories.length === 0 && !categoriesLoading) {
        setCategoriesLoading(true)
        getSearchCategories()
          .then((data) => setCategories(data))
          .catch(() => setCategories([]))
          .finally(() => setCategoriesLoading(false))
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 过滤搜索结果
  const filteredResults = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCH_RESULTS.filter((item) => {
      const haystack = `${item.title} ${item.subtitle || ''} ${RESULT_TYPE_LABEL[item.type]}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query])

  // 分组结果
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {}
    for (const item of filteredResults) {
      const label = RESULT_TYPE_LABEL[item.type]
      if (!groups[label]) groups[label] = []
      groups[label].push(item)
    }
    return groups
  }, [filteredResults])

  // 扁平化结果列表（用于键盘导航索引）
  const flatResults = useMemo(() => Object.values(groupedResults).flat(), [groupedResults])

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatResults[activeIndex]
      if (item) {
        const path = buildRoutePath(item, query.trim())
        onClose()
        navigate(path)
      }
    }
  }, [flatResults, activeIndex, query, onClose, navigate])

  // 重置 activeIndex 当结果变化
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  // 全局索引计数器（用于 activeIndex 比较）
  let globalIndex = -1

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchWrap}>
          <SearchOutlined className={styles.searchIcon} />
          <Input
            ref={inputRef}
            placeholder="搜索 AI员工、技能、知识库、工作流..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.searchInput}
            variant="borderless"
          />
          <kbd className={styles.escHint}>ESC</kbd>
        </div>

        {!query.trim() ? (
          <div className={styles.hint}>
            <span>输入关键词开始搜索</span>
            {categoriesLoading ? (
              <Spin size="small" />
            ) : categories.length > 0 ? (
              <div className={styles.categories}>
                {categories.filter((c) => c.enabled).map((cat) => (
                  <span key={cat.key} className={styles.categoryTag}>
                    {cat.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className={styles.hint}>
            <span>未找到 "{query}" 相关结果</span>
          </div>
        ) : (
          <div className={styles.resultList}>
            {Object.entries(groupedResults).map(([groupLabel, items]) => (
              <div key={groupLabel} className={styles.group}>
                <div className={styles.groupTitle}>{groupLabel}</div>
                {items.map((item) => {
                  globalIndex++
                  const isActive = globalIndex === activeIndex
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                      onClick={() => {
                        const path = buildRoutePath(item, query.trim())
                        onClose()
                        navigate(path)
                      }}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                    >
                      <span
                        className={styles.itemIcon}
                        style={{ color: RESULT_TYPE_COLOR[item.type] }}
                      >
                        {RESULT_TYPE_ICON[item.type]}
                      </span>
                      <div className={styles.itemText}>
                        <div className={styles.itemTitle}>{item.title}</div>
                        {item.subtitle && (
                          <div className={styles.itemSubtitle}>{item.subtitle}</div>
                        )}
                      </div>
                      <Tag
                        color={RESULT_TYPE_COLOR[item.type]}
                        className={styles.itemTag}
                      >
                        {RESULT_TYPE_LABEL[item.type]}
                      </Tag>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
