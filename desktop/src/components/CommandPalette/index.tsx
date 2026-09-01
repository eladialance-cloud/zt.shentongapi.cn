/**
 * CommandPalette — v2.0 ⌘K 命令面板
 * Kimi 风格：三区检索 = 页面导航 + 常用动作 + 资源（AI员工/技能/知识库/工作流）
 * Raycast 风格：遮罩 + 居中浮层 + 分组结果 + 键盘导航
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Spin, Tag } from 'antd'
import type { InputRef } from 'antd'
import {
  HomeOutlined,
  MessageOutlined,
  VideoCameraOutlined,
  BookOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  SendOutlined,
  GiftOutlined,
  SettingOutlined,
  ToolOutlined,
  BulbOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useSettingsStore } from '@/store/settings'
import { getSearchCategories, type SearchCategory } from '@/api/search-api'
import styles from './styles.module.css'

/* ===== 页面导航 ===== */
interface NavEntry {
  key: string
  label: string
  icon: React.ReactNode
  path: string
}

const NAV_ENTRIES: NavEntry[] = [
  { key: 'dashboard', label: '仪表盘', icon: <HomeOutlined />, path: '/dashboard' },
  { key: 'chat', label: '需求对话', icon: <MessageOutlined />, path: '/chat' },
  { key: 'video-claw', label: 'ST-Claw', icon: <VideoCameraOutlined />, path: '/video-claw' },
  { key: 'knowledge', label: '知识库', icon: <BookOutlined />, path: '/knowledge' },
  { key: 'market', label: '市场', icon: <AppstoreOutlined />, path: '/skill-market' },
  { key: 'workflow', label: '工作流', icon: <ApartmentOutlined />, path: '/workflow' },
  { key: 'channels', label: '渠道', icon: <SendOutlined />, path: '/channels' },
  { key: 'credits', label: '积分', icon: <GiftOutlined />, path: '/credits' },
  { key: 'settings', label: '设置', icon: <SettingOutlined />, path: '/settings' },
  { key: 'services', label: '服务', icon: <ToolOutlined />, path: '/services' },
]

/* ===== 常用动作 ===== */
interface ActionEntry {
  key: string
  label: string
  icon: React.ReactNode
  run: () => void
}

/* ===== 资源搜索结果 ===== */
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

/** 占位资源数据（后续接入真实搜索 API） */
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
    case 'workflow':   return `/workflow/${item.id}`
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
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  /** 常用动作（依赖当前值构建） */
  const ACTION_ENTRIES: ActionEntry[] = useMemo(
    () => [
      { key: 'new-chat', label: '新建需求对话', icon: <PlusOutlined />, run: () => go('/chat') },
      { key: 'toggle-theme', label: '切换主题（浅色/深色）', icon: <BulbOutlined />, run: () => toggleTheme() },
      { key: 'open-market', label: '打开市场', icon: <AppstoreOutlined />, run: () => go('/skill-market') },
      { key: 'open-settings', label: '打开设置', icon: <SettingOutlined />, run: () => go('/settings') },
      { key: 'open-services', label: '查看服务状态', icon: <ThunderboltOutlined />, run: () => go('/services') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleTheme]
  )

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

  // 过滤页面 / 动作 / 资源
  const q = query.trim().toLowerCase()

  const filteredNav = useMemo(
    () =>
      NAV_ENTRIES.filter((e) => {
        const hay = `${e.label}`.toLowerCase()
        return hay.includes(q)
      }),
    [q]
  )

  const filteredActions = useMemo(
    () =>
      ACTION_ENTRIES.filter((e) => {
        const hay = `${e.label}`.toLowerCase()
        return hay.includes(q)
      }),
    [q, ACTION_ENTRIES]
  )

  const filteredResults = useMemo<SearchResultItem[]>(() => {
    if (!q) return []
    return SEARCH_RESULTS.filter((item) => {
      const haystack = `${item.title} ${item.subtitle || ''} ${RESULT_TYPE_LABEL[item.type]}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [q])

  // 分组资源结果
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {}
    for (const item of filteredResults) {
      const label = RESULT_TYPE_LABEL[item.type]
      if (!groups[label]) groups[label] = []
      groups[label].push(item)
    }
    return groups
  }, [filteredResults])

  // 扁平化全部可选项（键盘导航索引）
  const flatItems = useMemo(() => {
    const items: Array<{ kind: 'nav' | 'action' | 'result'; entry: NavEntry | ActionEntry | SearchResultItem }> = []
    if (!q) {
      for (const e of NAV_ENTRIES) items.push({ kind: 'nav', entry: e })
      for (const e of ACTION_ENTRIES) items.push({ kind: 'action', entry: e })
    } else {
      for (const e of filteredNav) items.push({ kind: 'nav', entry: e })
      for (const e of filteredActions) items.push({ kind: 'action', entry: e })
      for (const item of filteredResults) items.push({ kind: 'result', entry: item })
    }
    return items
  }, [q, filteredNav, filteredActions, filteredResults, ACTION_ENTRIES])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatItems[activeIndex]
        if (!item) return
        onClose()
        if (item.kind === 'nav') navigate((item.entry as NavEntry).path)
        else if (item.kind === 'action') (item.entry as ActionEntry).run()
        else {
          const r = item.entry as SearchResultItem
          navigate(buildRoutePath(r, query.trim()))
        }
      }
    },
    [flatItems, activeIndex, query, onClose, navigate]
  )

  // 重置 activeIndex 当输入变化
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  // 全局索引计数器（用于 activeIndex 比较）
  let globalIndex = -1

  const renderNavGroup = (list: NavEntry[], showAll: boolean) => {
    const items = showAll ? NAV_ENTRIES : list
    if (items.length === 0) return null
    return (
      <div className={styles.group}>
        <div className={styles.groupTitle}>页面</div>
        {items.map((e) => {
          globalIndex++
          const isActive = globalIndex === activeIndex
          return (
            <div
              key={e.key}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => go(e.path)}
              onMouseEnter={() => setActiveIndex(globalIndex)}
            >
              <span className={styles.itemIcon}>{e.icon}</span>
              <div className={styles.itemText}>
                <div className={styles.itemTitle}>{e.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderActionGroup = (list: ActionEntry[], showAll: boolean) => {
    const items = showAll ? ACTION_ENTRIES : list
    if (items.length === 0) return null
    return (
      <div className={styles.group}>
        <div className={styles.groupTitle}>常用动作</div>
        {items.map((e) => {
          globalIndex++
          const isActive = globalIndex === activeIndex
          return (
            <div
              key={e.key}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => {
                onClose()
                e.run()
              }}
              onMouseEnter={() => setActiveIndex(globalIndex)}
            >
              <span className={styles.itemIcon}>{e.icon}</span>
              <div className={styles.itemText}>
                <div className={styles.itemTitle}>{e.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchWrap}>
          <SearchOutlined className={styles.searchIcon} />
          <Input
            ref={inputRef}
            placeholder="搜索页面、动作或 AI员工/技能/知识库/工作流..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.searchInput}
            variant="borderless"
          />
          <kbd className={styles.escHint}>ESC</kbd>
        </div>

        {!q ? (
          <div className={styles.resultList}>
            {renderNavGroup(NAV_ENTRIES, true)}
            {renderActionGroup(ACTION_ENTRIES, true)}
          </div>
        ) : flatItems.length === 0 ? (
          <div className={styles.hint}>
            <span>未找到 "{query}" 相关结果</span>
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
        ) : (
          <div className={styles.resultList}>
            {renderNavGroup(filteredNav, false)}
            {renderActionGroup(filteredActions, false)}
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
