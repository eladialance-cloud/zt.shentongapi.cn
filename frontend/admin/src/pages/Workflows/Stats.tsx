// 工作流统计页 - SubTask 21.3
//
// 统计页:按 engineType 分组统计 + Top 10 热门工作流 + 近 30 天执行趋势(用统计卡片代替图表)
// API: GET /admin/workflows/stats

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined,
  BarChartOutlined,
  FireOutlined,
  ReloadOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { getWorkflowStats } from '@/api/admin-workflow-api'
import type {
  AdminWorkflowStats,
  WorkflowEngineType
} from '@/types/admin-workflow'
import styles from './styles.module.css'

const ENGINE_LABEL: Record<WorkflowEngineType, string> = {
  n8n: 'n8n',
  coze: 'Coze'
}

interface TopWorkflow {
  id: number
  name: string
  engineType: WorkflowEngineType
  executionCount: number
}

export default function AdminWorkflowsStats() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<AdminWorkflowStats | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWorkflowStats()
      setStats(data)
    } catch (err) {
      console.error('[WorkflowStats] load failed:', err)
      message.error('加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const maxTrend = stats && stats.executionTrend.length > 0
    ? Math.max(1, ...stats.executionTrend.map((t) => t.count))
    : 1

  const statCards = [
    {
      label: '总工作流',
      value: stats?.total ?? 0,
      icon: <ApartmentOutlined />,
      iconClass: styles.statIconBlue
    },
    {
      label: '活跃数',
      value: stats?.active ?? 0,
      icon: <ThunderboltOutlined />,
      iconClass: styles.statIconGreen
    },
    {
      label: '近 30 天执行总数',
      value: stats?.executionTrend.reduce((sum, t) => sum + t.count, 0) ?? 0,
      icon: <FireOutlined />,
      iconClass: styles.statIconOrange
    }
  ]

  const topColumns: TableColumnsType<TopWorkflow> = [
    { title: '排名', key: 'rank', width: 70, render: (_: unknown, __: TopWorkflow, idx: number) => idx + 1 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '引擎',
      dataIndex: 'engineType',
      key: 'engineType',
      width: 100,
      render: (e: WorkflowEngineType) => (
        <Tag color={e === 'n8n' ? 'purple' : 'magenta'}>{ENGINE_LABEL[e]}</Tag>
      )
    },
    {
      title: '执行次数',
      dataIndex: 'executionCount',
      key: 'executionCount',
      width: 140,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <BarChartOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>工作流统计</h1>
            <div className={styles.subtitle}>按引擎分组 / 热门 Top10 / 近 30 天趋势</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadStats}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {/* 顶部统计卡片 */}
        <div className={styles.statsGrid}>
          {statCards.map((c) => (
            <Card key={c.label} className={styles.statCard} bordered={false}>
              <div className={styles.statCardBody}>
                <div className={`${styles.statIcon} ${c.iconClass}`}>{c.icon}</div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>{c.label}</span>
                  <span className={styles.statValue}>{c.value.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* 按 engineType 分组 */}
        <div className={styles.sectionTitle}>
          <BarChartOutlined /> 按 Engine 分组
        </div>
        <Card className={styles.card} bordered={false} style={{ marginBottom: 20 }}>
          {stats && stats.byEngineType.length > 0 ? (
            stats.byEngineType.map((e) => (
              <div className={styles.detailSection} key={e.engineType} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c7d2fe' }}>
                  <span>
                    <Tag color={e.engineType === 'n8n' ? 'purple' : 'magenta'}>
                      {ENGINE_LABEL[e.engineType]}
                    </Tag>
                    总数 {e.total} · 活跃 {e.active}
                  </span>
                  <span style={{ color: '#7dd3fc' }}>
                    执行 {e.executionCount.toLocaleString()} 次
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty description="暂无数据" />
          )}
        </Card>

        {/* Top 10 热门工作流 */}
        <div className={styles.sectionTitle}>
          <FireOutlined /> Top 10 热门工作流
        </div>
        <Card className={styles.card} bordered={false} style={{ marginBottom: 20 }}>
          {stats && stats.topWorkflows.length > 0 ? (
            <Table<TopWorkflow>
              rowKey="id"
              columns={topColumns}
              dataSource={stats.topWorkflows}
              pagination={false}
              size="middle"
            />
          ) : (
            <Empty description="暂无数据" style={{ padding: 40 }} />
          )}
        </Card>

        {/* 近 30 天执行趋势 */}
        <div className={styles.sectionTitle}>
          <ThunderboltOutlined /> 近 30 天执行趋势
        </div>
        <Card className={styles.card} bordered={false}>
          {stats && stats.executionTrend.length > 0 ? (
            <div className={styles.trendRow}>
              {stats.executionTrend.map((t) => {
                const heightPct = (t.count / maxTrend) * 100
                return (
                  <div
                    key={t.date}
                    className={styles.trendBar}
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                    title={`${t.date}: ${t.count} 次`}
                  >
                    <span className={styles.trendBarLabel}>{t.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty description="暂无趋势数据" style={{ padding: 40 }} />
          )}
        </Card>
      </Spin>
    </div>
  )
}
