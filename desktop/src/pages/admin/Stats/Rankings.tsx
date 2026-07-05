// 排行榜页 - SubTask 26.3
//
// Tab:热门 Agent/热门工作流/热门插件/模型消耗
// 每个 Tab 表格:排名/名称/调用次数/收入/平均评分/趋势(↑↓)
// API: GET /admin/stats/rankings

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ApartmentOutlined,
  BlockOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  TrophyOutlined
} from '@ant-design/icons'
import { Card, Empty, Spin, Table, Tabs, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { getRankings } from '@/api/admin-stats-api'
import type { RankingItem, RankingType } from '@/types/admin-stats'
import styles from './styles.module.css'

const TYPE_TABS: Array<{ key: RankingType; label: string }> = [
  { key: 'agent', label: '热门 Agent' },
  { key: 'workflow', label: '热门工作流' },
  { key: 'plugin', label: '热门插件' },
  { key: 'model', label: '模型消耗' }
]

const PERIOD_OPTIONS = ['day', 'week', 'month']

const TAB_ICON: Record<RankingType, ReactNode> = {
  agent: <ThunderboltOutlined />,
  workflow: <ApartmentOutlined />,
  plugin: <BlockOutlined />,
  model: <TrophyOutlined />
}

export default function StatsRankings() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<RankingItem[]>([])
  const [tab, setTab] = useState<RankingType>('agent')
  const [period] = useState<string>(PERIOD_OPTIONS[1])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRankings({ type: tab, period })
      setItems(data || [])
    } catch (err) {
      console.error('[StatsRankings] load failed:', err)
      message.error('加载排行榜失败')
    } finally {
      setLoading(false)
    }
  }, [tab, period])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setTab(key as RankingType)
  }

  const columns: TableColumnsType<RankingItem> = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: unknown, __: RankingItem, index: number) => {
        const rank = index + 1
        const color = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#fb923c' : '#8b949e'
        return <span style={{ color, fontWeight: 700, fontSize: 16 }}>#{rank}</span>
      }
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '调用次数',
      dataIndex: 'callCount',
      key: 'callCount',
      width: 130,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
    },
    {
      title: '收入(积分)',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 130,
      render: (v: number) => <span style={{ color: '#fbbf24' }}>{v.toLocaleString()}</span>
    },
    {
      title: '平均评分',
      dataIndex: 'avgRating',
      key: 'avgRating',
      width: 110,
      render: (v: number) => (
        <span style={{ color: '#34d399' }}>{v.toFixed(2)} / 5</span>
      )
    },
    {
      title: '趋势',
      dataIndex: 'trendPercent',
      key: 'trendPercent',
      width: 120,
      render: (v: number) =>
        v >= 0 ? (
          <span style={{ color: '#34d399' }}>
            <ArrowUpOutlined /> +{v.toFixed(1)}%
          </span>
        ) : (
          <span style={{ color: '#f87171' }}>
            <ArrowDownOutlined /> {v.toFixed(1)}%
          </span>
        )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TrophyOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>排行榜</h1>
            <div className={styles.subtitle}>查看各类资源的活跃排行</div>
          </div>
        </div>
      </div>

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={TYPE_TABS.map((t) => ({
          key: t.key,
          label: (
            <span>
              {TAB_ICON[t.key]} {t.label}
            </span>
          )
        }))}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无排行数据" style={{ marginTop: 80 }} />
        ) : (
          <Card className={styles.card} bordered={false}>
            <Table<RankingItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
            />
          </Card>
        )}
      </Spin>
    </div>
  )
}
