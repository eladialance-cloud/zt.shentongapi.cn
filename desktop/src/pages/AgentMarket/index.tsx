// Agent 市场 - 首页
// SubTask 7.1
// 顶部 Tab（全部/官方推荐/社区）+ 分类筛选 + 搜索 + Agent 卡片列表 + 分页

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Tabs,
  Select,
  Input,
  Rate,
  Button,
  Pagination,
  Spin,
  Empty,
  Tooltip,
  message
} from 'antd'
import {
  SearchOutlined,
  RobotOutlined,
  CrownOutlined,
  HeartOutlined,
  HeartFilled,
  ThunderboltOutlined,
  FireOutlined,
  AppstoreOutlined,
  RollbackOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { listMarketAgents, favoriteAgent, unfavoriteAgent } from '@/api/agent-api'
import type { Agent, MarketQuery, MarketTab, AgentCategory } from '@/types/agent'
import styles from './styles.module.css'

const CATEGORY_OPTIONS: Array<{ label: string; value: AgentCategory | '' }> = [
  { label: '全部分类', value: '' },
  { label: '办公', value: 'office' },
  { label: '编程', value: 'programming' },
  { label: '文案', value: 'copywriting' },
  { label: '数据分析', value: 'data_analysis' },
  { label: '其他', value: 'other' }
]

const TAB_ITEMS: Array<{ key: MarketTab; label: string; icon: React.ReactNode }> = [
  { key: 'all', label: '全部', icon: <AppstoreOutlined /> },
  { key: 'official', label: '官方推荐', icon: <CrownOutlined /> },
  { key: 'community', label: '社区', icon: <RobotOutlined /> }
]

const PAGE_SIZE = 12

export default function AgentMarket() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<MarketTab>('all')
  const [category, setCategory] = useState<string>('')
  const [keyword, setKeyword] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const query: MarketQuery = {
      tab,
      page,
      pageSize: PAGE_SIZE
    }
    if (category) query.category = category
    if (keyword.trim()) query.keyword = keyword.trim()
    try {
      const result = await listMarketAgents(query)
      setAgents(result.list || [])
      setTotal(result.total || 0)
    } catch (err) {
      console.error('[AgentMarket] load failed:', err)
      message.error('加载 Agent 列表失败')
    } finally {
      setLoading(false)
    }
  }, [tab, category, keyword, page])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleTabChange = (key: string) => {
    setTab(key as MarketTab)
    setPage(1)
  }

  const handleSearch = () => {
    setPage(1)
    void loadData()
  }

  const handleUse = (agent: Agent) => {
    navigate(`/chat?agentId=${agent.id}`)
  }

  const handleToggleFav = async (agent: Agent) => {
    const wasFav = agent.isFavorited
    // 乐观更新
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agent.id ? { ...a, isFavorited: !wasFav } : a
      )
    )
    try {
      if (wasFav) {
        await unfavoriteAgent(agent.id)
        message.success('已取消收藏')
      } else {
        await favoriteAgent(agent.id)
        message.success('已收藏')
      }
    } catch (err) {
      // 回滚
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id ? { ...a, isFavorited: wasFav } : a
        )
      )
      console.error('[AgentMarket] toggle fav failed:', err)
      message.error('操作失败')
    }
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <RobotOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 市场</h1>
            <div className={styles.subtitle}>发现并使用智能 Agent</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/dashboard')}
          className={styles.backBtn}
        >
          返回主页
        </Button>
      </div>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <Tabs
          activeKey={tab}
          onChange={handleTabChange}
          items={TAB_ITEMS.map((item) => ({
            key: item.key,
            label: (
              <span>
                {item.icon}
                <span style={{ marginLeft: 6 }}>{item.label}</span>
              </span>
            )
          }))}
          style={{ marginBottom: 0 }}
        />
        <div className={styles.toolbarLeft}>
          <Select
            value={category}
            onChange={(v) => {
              setCategory(v)
              setPage(1)
            }}
            options={CATEGORY_OPTIONS}
            style={{ width: 140 }}
          />
          <Input
            placeholder="搜索 Agent 名称 / 描述"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined style={{ color: '#64748b' }} />}
            className={styles.searchBox}
            allowClear
          />
        </div>
      </div>

      {/* Agent 列表 */}
      <Spin spinning={loading}>
        {agents.length === 0 && !loading ? (
          <Empty description="暂无 Agent" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.agentGrid}>
            {agents.map((agent) => (
              <AgentCardItem
                key={agent.id}
                agent={agent}
                onUse={() => handleUse(agent)}
                onToggleFav={() => handleToggleFav(agent)}
                onOpenDetail={() => navigate(`/agents/${agent.id}`)}
              />
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(p) => setPage(p)}
            />
          </div>
        )}
      </Spin>
    </div>
  )
}

/** Agent 卡片项 */
function AgentCardItem({
  agent,
  onUse,
  onToggleFav,
  onOpenDetail
}: {
  agent: Agent
  onUse: () => void
  onToggleFav: () => void
  onOpenDetail: () => void
}) {
  const isFree = agent.pricePerCall === 0
  return (
    <Card className={styles.agentCard} bordered={false}>
      <div className={styles.agentCardBody}>
        {/* 头部：头像 + 名称 + 收藏 */}
        <div className={styles.agentHeader}>
          <div className={styles.agentAvatar}>
            {agent.avatar ? (
              <img
                src={agent.avatar}
                alt={agent.name}
                className={styles.agentAvatarImg}
              />
            ) : (
              agent.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className={styles.agentTitleRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.agentName} onClick={onOpenDetail} style={{ cursor: 'pointer' }}>
                {agent.isOfficial && (
                  <span className={styles.officialBadge}>
                    <CrownOutlined /> 官方
                  </span>
                )}
                <span>{agent.name}</span>
              </div>
              <div className={styles.agentMeta}>
                <span className={styles.agentRating}>
                  <Rate
                    disabled
                    allowHalf
                    value={agent.rating}
                    character={<ThunderboltOutlined className={styles.ratingStar} />}
                    style={{ fontSize: 12 }}
                  />
                  <span style={{ color: '#facc15' }}>{agent.rating.toFixed(1)}</span>
                  <span className={styles.callCount}>({agent.ratingCount})</span>
                </span>
              </div>
            </div>
            <Tooltip title={agent.isFavorited ? '取消收藏' : '收藏'}>
              <Button
                type="text"
                size="small"
                icon={
                  agent.isFavorited ? (
                    <HeartFilled className={styles.favBtnActive} />
                  ) : (
                    <HeartOutlined />
                  )
                }
                onClick={onToggleFav}
                className={
                  agent.isFavorited
                    ? `${styles.favBtn} ${styles.favBtnActive}`
                    : styles.favBtn
                }
              />
            </Tooltip>
          </div>
        </div>

        {/* 描述 */}
        <div className={styles.agentDesc}>{agent.description || '暂无描述'}</div>

        {/* 标签 */}
        {agent.tags && agent.tags.length > 0 && (
          <div className={styles.agentTags}>
            {agent.tags.slice(0, 4).map((tag, idx) => (
              <span key={idx} className={styles.agentTag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 价格 + 调用次数 */}
        <div className={styles.agentMeta}>
          <span className={isFree ? styles.priceTagFree : styles.priceTag}>
            {isFree ? (
              '免费'
            ) : (
              <>
                {agent.pricePerCall} 积分/次
                {(agent.pricePerToken.input > 0 ||
                  agent.pricePerToken.output > 0) && (
                  <span style={{ marginLeft: 4, fontSize: 10 }}>+ Token</span>
                )}
              </>
            )}
          </span>
          <span className={styles.callCount}>
            <FireOutlined style={{ marginRight: 4, color: '#fb923c' }} />
            {agent.callCount.toLocaleString()} 次调用
          </span>
        </div>

        {/* 操作 */}
        <div className={styles.agentActions}>
          <Button
            type="primary"
            className={styles.useBtn}
            onClick={onUse}
          >
            使用
          </Button>
          <Button onClick={onOpenDetail} className={styles.favBtn}>
            详情
          </Button>
        </div>
      </div>
    </Card>
  )
}
