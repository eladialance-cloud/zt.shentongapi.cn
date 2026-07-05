// 数据大盘页 - SubTask 26.1 + 26.5
//
// 顶部 2 个实时卡片(WebSocket 推送,失败降级为 5 秒轮询):当前在线用户数/实时调用量
// 8 个统计卡片:DAU/新增用户/总用户/调用量/总收入/总消费/平均客单价/在线用户
// 中部:近 7 天调用量趋势(CSS 柱状图)+ 收入趋势
// 底部:模型消耗占比(Progress 条形图)+ 模块调用占比
// API: GET /admin/stats/overview、GET /admin/stats/realtime

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Progress,
  Spin,
  message
} from 'antd'
import {
  BarChartOutlined,
  DashboardOutlined,
  DollarOutlined,
  FireOutlined,
  PieChartOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  WalletOutlined
} from '@ant-design/icons'
import { getStatsOverview, getStatsRealtime } from '@/api/admin-stats-api'
import type { StatsOverview, StatsRealtime } from '@/types/admin-stats'
import styles from './styles.module.css'

export default function StatsOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<StatsOverview | null>(null)

  // 实时数据(优先 WebSocket,失败降级 5 秒轮询)
  const [realtime, setRealtime] = useState<StatsRealtime | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getStatsOverview()
      setOverview(data)
    } catch (err) {
      console.error('[StatsOverview] load failed:', err)
      message.error('加载数据大盘失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const pollRealtime = useCallback(async () => {
    try {
      const data = await getStatsRealtime()
      setRealtime(data)
    } catch (err) {
      console.error('[StatsOverview] realtime poll failed:', err)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  // 实时数据:wsClient 当前未注册 admin:stats:realtime 事件转发,
  // 故直接采用降级方案(5 秒轮询 GET /admin/stats/realtime)
  useEffect(() => {
    void pollRealtime()
    pollTimerRef.current = setInterval(() => {
      void pollRealtime()
    }, 5000)
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [pollRealtime])

  const statCards = [
    { label: 'DAU', value: overview?.dau ?? 0, icon: <TeamOutlined />, iconClass: styles.statIconBlue },
    { label: '新增用户', value: overview?.newUsers ?? 0, icon: <UserAddOutlined />, iconClass: styles.statIconGreen },
    { label: '总用户', value: overview?.totalUsers ?? 0, icon: <TeamOutlined />, iconClass: styles.statIconBlue },
    { label: '调用量', value: overview?.callCount ?? 0, icon: <ThunderboltOutlined />, iconClass: styles.statIconOrange },
    { label: '总收入(元)', value: overview?.totalRevenue ?? 0, icon: <DollarOutlined />, iconClass: styles.statIconGreen },
    { label: '总消费(积分)', value: overview?.totalConsumption ?? 0, icon: <WalletOutlined />, iconClass: styles.statIconRed },
    { label: '平均客单价(元)', value: overview?.avgOrderValue ?? 0, icon: <RiseOutlined />, iconClass: styles.statIconOrange },
    { label: '在线用户', value: overview?.onlineUsers ?? 0, icon: <FireOutlined />, iconClass: styles.statIconBlue }
  ]

  // 计算 7 天调用量趋势柱状图最大值
  const maxCall = overview
    ? Math.max(1, ...overview.callTrend7d.map((p) => p.value))
    : 1
  const maxRevenue = overview
    ? Math.max(1, ...overview.revenueTrend7d.map((p) => p.value))
    : 1

  // 模型消耗/模块调用占比最大值
  const maxModelConsumption = overview && overview.modelConsumption.length > 0
    ? Math.max(1, ...overview.modelConsumption.map((p) => p.value))
    : 1
  const maxModuleCalls = overview && overview.moduleCalls.length > 0
    ? Math.max(1, ...overview.moduleCalls.map((p) => p.value))
    : 1

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <DashboardOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>数据大盘</h1>
            <div className={styles.subtitle}>核心运营指标实时概览</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadOverview}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {/* 实时卡片(2 个) */}
        <div className={styles.sectionTitle}>
          <ThunderboltOutlined /> 实时数据(每 5 秒更新)
        </div>
        <div className={styles.statsGrid}>
          <Card className={styles.statCard} bordered={false}>
            <div className={styles.statCardBody}>
              <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                <TeamOutlined />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>当前在线用户</span>
                <span className={styles.statValue}>
                  {(realtime?.onlineUsers ?? overview?.onlineUsers ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
          <Card className={styles.statCard} bordered={false}>
            <div className={styles.statCardBody}>
              <div className={`${styles.statIcon} ${styles.statIconOrange}`}>
                <ThunderboltOutlined />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>实时调用量(次/秒)</span>
                <span className={styles.statValue}>
                  {(realtime?.callsPerSecond ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* 8 个统计卡片 */}
        <div className={styles.sectionTitle}>
          <BarChartOutlined /> 核心指标
        </div>
        <div className={styles.statsGrid}>
          {statCards.map((c) => (
            <Card key={c.label} className={styles.statCard} bordered={false}>
              <div className={styles.statCardBody}>
                <div className={`${styles.statIcon} ${c.iconClass}`}>{c.icon}</div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>{c.label}</span>
                  <span className={styles.statValue}>
                    {typeof c.value === 'number' && c.value < 1000
                      ? c.value.toFixed(c.label.includes('元') ? 2 : 0)
                      : c.value.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* 近 7 天调用量趋势 + 收入趋势 */}
        <div className={styles.sectionTitle}>
          <BarChartOutlined /> 近 7 天趋势
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <Card className={styles.card} bordered={false}>
            <div style={{ color: '#7dd3fc', marginBottom: 8 }}>调用量趋势</div>
            {overview && overview.callTrend7d.length > 0 ? (
              <div className={styles.barChart}>
                {overview.callTrend7d.map((p) => {
                  const heightPercent = (p.value / maxCall) * 100
                  return (
                    <div className={styles.barItem} key={p.date}>
                      <span className={styles.barValue}>{p.value.toLocaleString()}</span>
                      <div className={styles.bar} style={{ height: `${heightPercent}%` }} />
                      <span className={styles.barLabel}>{p.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
          <Card className={styles.card} bordered={false}>
            <div style={{ color: '#7dd3fc', marginBottom: 8 }}>收入趋势(元)</div>
            {overview && overview.revenueTrend7d.length > 0 ? (
              <div className={styles.barChart}>
                {overview.revenueTrend7d.map((p) => {
                  const heightPercent = (p.value / maxRevenue) * 100
                  return (
                    <div className={styles.barItem} key={p.date}>
                      <span className={styles.barValue}>¥{p.value.toFixed(0)}</span>
                      <div className={`${styles.bar} ${styles.barRevenue}`} style={{ height: `${heightPercent}%` }} />
                      <span className={styles.barLabel}>{p.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </div>

        {/* 模型消耗占比 + 模块调用占比 */}
        <div className={styles.sectionTitle}>
          <PieChartOutlined /> 占比分布
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card className={styles.card} bordered={false}>
            <div style={{ color: '#7dd3fc', marginBottom: 12 }}>模型消耗占比</div>
            {overview && overview.modelConsumption.length > 0 ? (
              overview.modelConsumption.map((m) => {
                const percent = Math.round((m.value / maxModelConsumption) * 100)
                return (
                  <div className={styles.ratioRow} key={m.name}>
                    <span className={styles.ratioName}>{m.name}</span>
                    <div className={styles.ratioBar}>
                      <Progress
                        percent={percent}
                        size="small"
                        strokeColor={{ '0%': '#38bdf8', '100%': '#6366f1' }}
                        format={() => `${m.value.toLocaleString()}`}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
          <Card className={styles.card} bordered={false}>
            <div style={{ color: '#7dd3fc', marginBottom: 12 }}>模块调用占比</div>
            {overview && overview.moduleCalls.length > 0 ? (
              overview.moduleCalls.map((m) => {
                const percent = Math.round((m.value / maxModuleCalls) * 100)
                return (
                  <div className={styles.ratioRow} key={m.name}>
                    <span className={styles.ratioName}>{m.name}</span>
                    <div className={styles.ratioBar}>
                      <Progress
                        percent={percent}
                        size="small"
                        strokeColor={{ '0%': '#fbbf24', '100%': '#f97316' }}
                        format={() => `${m.value.toLocaleString()}`}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </div>
      </Spin>
    </div>
  )
}
