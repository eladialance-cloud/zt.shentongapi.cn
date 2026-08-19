/**
 * 数据分析（Task 7：KPI 卡 + 30 天发布趋势 + 平台分布 + 简易周报 + 平台数据占位）
 * 数据源: GET /statistics/user-overview（按当前登录用户聚合）
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, Empty, Spin, Tag, Tooltip, message } from 'antd'
import {
  BarChart3, CheckCircle2, Eye, FolderOpen, RefreshCw, Send, TrendingUp,
} from 'lucide-react'
import { getStatisticsOverview } from '@/api/statistics-api'
import type { StatisticsOverview } from '@/api/statistics-api'
import {
  buildWeeklyReport, platformName, PLATFORM_COLORS, toTrendBars, weeklyInsight,
} from './stats'
import styles from './styles.module.css'

interface KpiItem {
  key: string
  label: string
  value: number
  sub: string
  icon: ReactElement
}

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [overview, setOverview] = useState<StatisticsOverview | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const data = await getStatisticsOverview()
      setOverview(data)
    } catch {
      setFailed(true)
      setOverview(null)
      message.error('加载数据分析失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className={styles.analytics}>
        <div className={styles.loadingWrap}>
          <Spin tip="数据加载中" />
        </div>
      </div>
    )
  }

  if (failed || !overview) {
    return (
      <div className={styles.analytics}>
        <div className={styles.emptyWrap}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="数据分析加载失败"
          >
            <Button icon={<RefreshCw size={14} />} onClick={() => void loadData()}>
              重新加载
            </Button>
          </Empty>
        </div>
      </div>
    )
  }

  const kpis: KpiItem[] = [
    { key: 'published', label: '本周发布', value: overview.weekPublished, sub: '近 7 天已发布计划', icon: <Send size={18} /> },
    { key: 'tasks', label: '本周完成任务', value: overview.weekCompletedTasks, sub: '任务中心口径', icon: <CheckCircle2 size={18} /> },
    { key: 'assets', label: '素材总数', value: overview.assetCount, sub: '素材库资产', icon: <FolderOpen size={18} /> },
    { key: 'review', label: '待审核', value: overview.pendingReview, sub: '待审核发布计划', icon: <Eye size={18} /> },
  ]

  const trendBars = toTrendBars(overview.publishTrend30d)
  const hasTrendData = trendBars.some((b) => b.count > 0)
  const reportRows = buildWeeklyReport(overview)

  return (
    <div className={styles.analytics}>
      {/* 顶部标题 + 刷新 */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.headerIcon}>
            <BarChart3 size={18} />
          </span>
          <div>
            <h2 className={styles.title}>数据分析</h2>
            <p className={styles.sub}>按当前登录用户聚合 · 发布 / 任务 / 素材</p>
          </div>
        </div>
        <Button
          icon={<RefreshCw size={14} />}
          loading={loading}
          onClick={() => void loadData()}
        >
          刷新
        </Button>
      </div>

      {/* 4 张 KPI 卡 */}
      <div className={styles.stats}>
        {kpis.map((kpi) => (
          <div key={kpi.key} className={styles.statCard}>
            <span className={styles.statIcon}>{kpi.icon}</span>
            <div className={styles.statInfo}>
              <div className={styles.statLabel}>{kpi.label}</div>
              <div className={styles.statValue}>{kpi.value}</div>
              <div className={styles.statSub}>{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 30 天发布趋势 + 平台分布 */}
      <div className={styles.grid2}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>
            <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            近 30 天发布趋势
          </h3>
          {hasTrendData ? (
            <>
              <div className={styles.trendChart}>
                {trendBars.map((bar) => (
                  <Tooltip key={bar.date} title={bar.label}>
                    <div className={styles.trendCol}>
                      <div className={styles.trendBar} style={{ height: bar.heightPct + '%' }} />
                    </div>
                  </Tooltip>
                ))}
              </div>
              <div className={styles.trendTicks}>
                {trendBars.map((bar, index) => (
                  <div key={bar.date} className={styles.trendTick}>
                    {index % 5 === 0 ? bar.date.slice(5) : ''}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.trendEmpty}>近 30 天暂无发布记录</div>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>平台分布</h3>
          {overview.platformDist.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已发布计划" />
          ) : (
            <div className={styles.platformList}>
              {overview.platformDist.map((item) => (
                <div key={item.platform} className={styles.platformRow}>
                  <Tag color={PLATFORM_COLORS[item.platform] ?? 'default'}>
                    {platformName(item.platform)}
                  </Tag>
                  <span className={styles.platformCount}>{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 简易周报 + 平台数据占位 */}
      <div className={styles.grid2b}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>运营周报</h3>
          {reportRows.map((row) => (
            <div key={row.key} className={styles.reportRow}>
              <span className={styles.reportLabel}>{row.label}</span>
              <span className={styles.reportValue}>
                {row.value}
                <span className={styles.reportSuffix}>{row.suffix}</span>
              </span>
            </div>
          ))}
          <p className={styles.insight}>{weeklyInsight(overview)}</p>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>阅读 / 爆款数据</h3>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="待接入平台 API"
          >
            <span className={styles.placeholderHint}>
              平台侧阅读量、爆款榜与粉丝净增数据接入后在此展示
            </span>
          </Empty>
        </section>
      </div>
    </div>
  )
}
