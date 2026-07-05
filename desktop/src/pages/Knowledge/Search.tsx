// 知识库检索测试页
// 布局：搜索框 + Top-K 选择 + 检索结果列表（内容/来源/相似度分数/元数据）
// 调用 POST /knowledge/bases/:id/search，body: { query, topK }

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Input,
  Select,
  Skeleton,
  Spin,
  Tag,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  SearchOutlined,
  FileTextOutlined,
  PercentageOutlined
} from '@ant-design/icons'
import * as kbApi from '@/api/knowledge-api'
import type { SearchResult } from '@/types/knowledge'
import styles from './styles.module.css'

/** Top-K 选项 */
const TOP_K_OPTIONS = [
  { label: 'Top 3', value: 3 },
  { label: 'Top 5', value: 5 },
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 }
]

/** 格式化相似度分数 */
function formatScore(score: number): string {
  if (typeof score !== 'number') return '-'
  return `${(score * 100).toFixed(1)}%`
}

/** 格式化元数据为可读字符串 */
function formatMetadata(meta: unknown): Array<{ key: string; value: string }> {
  if (!meta || typeof meta !== 'object') return []
  const entries = Object.entries(meta as Record<string, unknown>)
  return entries.map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
}

export default function KnowledgeSearch() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const kbId = id ? Number(id) : NaN

  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  /** 执行检索 */
  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      message.warning('请输入检索内容')
      return
    }
    if (!Number.isFinite(kbId)) {
      message.error('知识库 ID 无效')
      return
    }

    setLoading(true)
    setSearched(true)
    try {
      const list = await kbApi.search(kbId, query.trim(), topK)
      setResults(list || [])
    } catch (err) {
      console.error('[KnowledgeSearch] search failed:', err)
      message.error('检索失败: ' + (err as Error).message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, topK, kbId])

  /** 回车检索 */
  const handlePressEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSearch()
    }
  }

  /** 返回 */
  const handleBack = () => {
    navigate(`/knowledge/${kbId}/documents`)
  }

  /** 返回列表 */
  const handleBackToList = () => {
    navigate('/knowledge')
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <SearchOutlined />
          <span>知识库检索测试</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<BookOutlined />}
            onClick={handleBack}
          >
            文档管理
          </Button>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={handleBackToList}
          >
            返回列表
          </Button>
        </div>
      </div>

      <div className={styles.searchContainer}>
        {/* 搜索栏 */}
        <div className={styles.searchCard}>
          <div className={styles.searchBar}>
            <Input
              className={styles.searchInput}
              size="large"
              placeholder="输入检索内容，按 Enter 检索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={handlePressEnter}
              prefix={<SearchOutlined style={{ color: '#a5b4fc' }} />}
            />
            <Select
              className={styles.topKSelect}
              size="large"
              value={topK}
              onChange={setTopK}
              options={TOP_K_OPTIONS}
            />
            <Button
              type="primary"
              size="large"
              className={styles.searchBtn}
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loading}
            >
              检索
            </Button>
          </div>
        </div>

        {/* 检索结果 */}
        <Spin spinning={loading}>
          {!searched ? (
            <div className={styles.emptyState}>
              <SearchOutlined className={styles.emptyStateIcon} />
              <div className={styles.emptyStateText}>
                输入查询内容后点击「检索」按钮，结果将在此处显示
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className={styles.emptyState}>
              <SearchOutlined className={styles.emptyStateIcon} />
              <div className={styles.emptyStateText}>未找到相关结果</div>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={styles.resultCard}>
                      <Skeleton active paragraph={{ rows: 2 }} />
                    </div>
                  ))
                : results.map((result, index) => (
                    <div key={result.id ?? index} className={styles.resultCard}>
                      {/* 头部：来源 + 相似度 */}
                      <div className={styles.resultHeader}>
                        <span className={styles.resultSource}>
                          <FileTextOutlined />
                          <span>来源: {result.documentName || `#${result.documentId}`}</span>
                          <Tag color="purple" style={{ marginLeft: 6 }}>
                            #{index + 1}
                          </Tag>
                        </span>
                        <span className={styles.scoreBadge}>
                          <PercentageOutlined />
                          相似度: {formatScore(result.score)}
                        </span>
                      </div>

                      {/* 内容 */}
                      <div className={styles.resultContent}>{result.content}</div>

                      {/* 元数据 */}
                      {formatMetadata(result.metadata).length > 0 && (
                        <div className={styles.resultMeta}>
                          {formatMetadata(result.metadata).map((item) => (
                            <span key={item.key} className={styles.resultMetaItem}>
                              <span style={{ color: '#6e7681' }}>{item.key}:</span>
                              <span style={{ color: '#a5b4fc' }}>{item.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          )}
        </Spin>
      </div>
    </div>
  )
}
