// API Key 池状态监控页 - SubTask 19.7
//
// 顶部 4 个统计卡片:总 Key 数/活跃数/已耗尽数/错误数
// 按 Provider 分组的柱状图(用 antd Progress 条形图代替)
// 日/月趋势(展示今日消耗/本月消耗统计卡片)
// 异常 Key 列表(error_count >= 5)

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Progress,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BarChartOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  KeyOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { getApiKeyPoolStats } from '@/api/admin-api-key-pool-api'
import type {
  ApiKeyPoolItem,
  ApiKeyPoolStats,
  ApiKeyProvider
} from '@/types/admin-api-key-pool'
import styles from './styles.module.css'

const PROVIDER_LABEL: Record<ApiKeyProvider, string> = {
  openai: 'OpenAI',
  doubao: '豆包',
  qwen: '通义千问',
  deepseek: 'DeepSeek',
  other: '其他'
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  active: { color: 'green', text: '正常' },
  exhausted: { color: 'orange', text: '已耗尽' },
  error: { color: 'red', text: '错误' },
  disabled: { color: 'default', text: '已禁用' }
}

export default function AdminApiKeyPoolStats() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ApiKeyPoolStats | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getApiKeyPoolStats()
      setStats(data)
    } catch (err) {
      console.error('[ApiKeyPoolStats] load failed:', err)
      message.error('加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const maxProviderTotal = stats
    ? Math.max(1, ...stats.byProvider.map((p) => p.total))
    : 1

  const statCards = [
    {
      label: '总 Key 数',
      value: stats?.total ?? 0,
      icon: <KeyOutlined />,
      iconClass: styles.statIconBlue
    },
    {
      label: '活跃数',
      value: stats?.active ?? 0,
      icon: <CheckCircleOutlined />,
      iconClass: styles.statIconGreen
    },
    {
      label: '已耗尽数',
      value: stats?.exhausted ?? 0,
      icon: <ExclamationCircleOutlined />,
      iconClass: styles.statIconOrange
    },
    {
      label: '错误数',
      value: stats?.error ?? 0,
      icon: <WarningOutlined />,
      iconClass: styles.statIconRed
    }
  ]

  const trendCards = [
    {
      label: '今日消耗',
      value: stats?.todayConsumed ?? 0,
      icon: <ThunderboltOutlined />,
      iconClass: styles.statIconOrange
    },
    {
      label: '本月消耗',
      value: stats?.monthConsumed ?? 0,
      icon: <FireOutlined />,
      iconClass: styles.statIconRed
    }
  ]

  const abnormalColumns: TableColumnsType<ApiKeyPoolItem> = [
    {
      title: '别名',
      dataIndex: 'alias',
      key: 'alias',
      render: (v: string) => <span style={{ color: '#f1f5f9' }}>{v}</span>
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 110,
      render: (p: ApiKeyProvider) => <Tag color="blue">{PROVIDER_LABEL[p]}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.text || s}</Tag>
      )
    },
    {
      title: '错误次数',
      dataIndex: 'errorCount',
      key: 'errorCount',
      width: 100,
      render: (v: number) => (
        <span style={{ color: '#f87171', fontWeight: 600 }}>
          <WarningOutlined /> {v}
        </span>
      )
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheckedAt',
      key: 'lastCheckedAt',
      width: 180,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <BarChartOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Key 池状态监控</h1>
            <div className={styles.subtitle}>实时监控 Key 池健康度</div>
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
        {/* 4 个统计卡片 */}
        <div className={styles.statsGrid}>
          {statCards.map((c) => (
            <Card key={c.label} className={styles.statCard} bordered={false}>
              <div className={styles.statCardBody}>
                <div className={`${styles.statIcon} ${c.iconClass}`}>
                  {c.icon}
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>{c.label}</span>
                  <span className={styles.statValue}>
                    {c.value.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* 按 Provider 分组的柱状图(Progress 条形图代替) */}
        <div className={styles.sectionTitle}>
          <BarChartOutlined /> 按 Provider 分组
        </div>
        <Card className={styles.card} bordered={false} style={{ marginBottom: 20 }}>
          {stats && stats.byProvider.length > 0 ? (
            stats.byProvider.map((p) => {
              const percent = Math.round((p.total / maxProviderTotal) * 100)
              const usedPercent =
                p.total > 0 ? Math.round((p.used / p.total) * 100) : 0
              return (
                <div className={styles.providerRow} key={p.provider}>
                  <div className={styles.providerHeader}>
                    <span>
                      <Tag color="blue">{PROVIDER_LABEL[p.provider]}</Tag>
                      <span style={{ color: '#94a3b8', marginLeft: 8 }}>
                        共 {p.total} · 活跃 {p.active}
                      </span>
                    </span>
                    <span style={{ color: '#7dd3fc' }}>
                      已用 {p.used.toLocaleString()} / 剩余{' '}
                      {p.remaining.toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    percent={usedPercent}
                    status={usedPercent >= 90 ? 'exception' : 'active'}
                    strokeColor={{
                      '0%': '#38bdf8',
                      '100%': '#6366f1'
                    }}
                  />
                  <Progress
                    percent={percent}
                    size="small"
                    status="normal"
                    format={() => `占池 ${percent}%`}
                  />
                </div>
              )
            })
          ) : (
            <Empty description="暂无 Provider 数据" />
          )}
        </Card>

        {/* 日/月趋势统计卡片 */}
        <div className={styles.sectionTitle}>
          <ThunderboltOutlined /> 消耗趋势
        </div>
        <div className={styles.statsGrid}>
          {trendCards.map((c) => (
            <Card key={c.label} className={styles.statCard} bordered={false}>
              <div className={styles.statCardBody}>
                <div className={`${styles.statIcon} ${c.iconClass}`}>
                  {c.icon}
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>{c.label}</span>
                  <span className={styles.statValue}>
                    {c.value.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* 异常 Key 列表 */}
        <div className={styles.sectionTitle}>
          <WarningOutlined /> 异常 Key 列表(error_count ≥ 5)
        </div>
        <Card className={styles.card} bordered={false}>
          {stats && stats.abnormalKeys.length > 0 ? (
            <Table<ApiKeyPoolItem>
              rowKey="id"
              columns={abnormalColumns}
              dataSource={stats.abnormalKeys}
              pagination={false}
              size="middle"
            />
          ) : (
            <Empty description="暂无异常 Key" style={{ padding: 40 }} />
          )}
        </Card>
      </Spin>
    </div>
  )
}
