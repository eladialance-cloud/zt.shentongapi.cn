// 趋势分析页 - SubTask 26.2
//
// 时间范围选择器(日/周/月)
// 多指标切换:用户增长/调用量/收入/消费
// 趋势图(SVG 折线图代替图表库)
// API: GET /admin/stats/trends

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Radio, Spin, message } from 'antd'
import { LineChartOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { getStatsTrends } from '@/api/admin-stats-api'
import type {
  StatsGranularity,
  StatsMetric,
  StatsTrends,
  TrendPoint
} from '@/types/admin-stats'
import styles from './styles.module.css'

const { RangePicker } = DatePicker

const METRIC_OPTIONS: Array<{ label: string; value: StatsMetric }> = [
  { label: '用户增长', value: 'user_growth' },
  { label: '调用量', value: 'call_count' },
  { label: '收入', value: 'revenue' },
  { label: '消费', value: 'consumption' }
]

const GRANULARITY_OPTIONS: Array<{ label: string; value: StatsGranularity }> = [
  { label: '按日', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' }
]

const METRIC_LABEL: Record<StatsMetric, string> = {
  user_growth: '用户增长',
  call_count: '调用量',
  revenue: '收入(元)',
  consumption: '消费(积分)'
}

/** 渲染 SVG 折线图 */
function LineChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const width = 800
  const height = 280
  const padding = { top: 20, right: 20, bottom: 40, left: 60 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const values = points.map((p) => p.value)
  const maxVal = Math.max(1, ...values)
  const minVal = Math.min(0, ...values)
  const range = maxVal - minVal || 1

  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW

  const coords = points.map((p, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + innerH - ((p.value - minVal) / range) * innerH,
    value: p.value,
    date: p.date
  }))

  const pathD = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')

  const areaD =
    coords.length > 0
      ? `${pathD} L ${coords[coords.length - 1].x.toFixed(2)} ${padding.top + innerH} L ${coords[0].x.toFixed(2)} ${padding.top + innerH} Z`
      : ''

  // Y 轴刻度(4 格)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: padding.top + innerH - r * innerH,
    value: minVal + r * range
  }))

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Y 轴网格 + 标签 */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={t.y}
            x2={padding.left + innerW}
            y2={t.y}
            stroke="rgba(56,189,248,0.12)"
            strokeWidth={1}
          />
          <text
            x={padding.left - 8}
            y={t.y + 4}
            textAnchor="end"
            fontSize={11}
            fill="#8b949e"
          >
            {Math.round(t.value).toLocaleString()}
          </text>
        </g>
      ))}
      {/* X 轴标签 */}
      {coords.map((c, i) =>
        points.length <= 12 || i % Math.ceil(points.length / 8) === 0 ? (
          <text
            key={i}
            x={c.x}
            y={padding.top + innerH + 18}
            textAnchor="middle"
            fontSize={11}
            fill="#8b949e"
          >
            {c.date.slice(5)}
          </text>
        ) : null
      )}
      {/* 区域填充 */}
      {areaD && <path d={areaD} fill="url(#trendArea)" />}
      {/* 折线 */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
      {/* 数据点 */}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3} fill={color}>
          <title>{`${c.date}: ${c.value.toLocaleString()}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export default function StatsTrendsPage() {
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<StatsMetric>('call_count')
  const [granularity, setGranularity] = useState<StatsGranularity>('day')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [trends, setTrends] = useState<StatsTrends | null>(null)

  const loadTrends = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { metric, granularity }
      if (range && range[0] && range[1]) {
        query.startDate = range[0].toISOString()
        query.endDate = range[1].toISOString()
      }
      const data = await getStatsTrends({
        metric,
        granularity,
        startDate: range?.[0]?.toISOString(),
        endDate: range?.[1]?.toISOString()
      })
      setTrends(data)
    } catch (err) {
      console.error('[StatsTrends] load failed:', err)
      message.error('加载趋势数据失败')
    } finally {
      setLoading(false)
    }
  }, [metric, granularity, range])

  useEffect(() => {
    void loadTrends()
  }, [loadTrends])

  const lineColor = useMemo(() => {
    switch (metric) {
      case 'user_growth':
        return '#34d399'
      case 'call_count':
        return '#38bdf8'
      case 'revenue':
        return '#fbbf24'
      case 'consumption':
        return '#f87171'
    }
  }, [metric])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <LineChartOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>趋势分析</h1>
            <div className={styles.subtitle}>查看各核心指标的变化趋势</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadTrends}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Radio.Group
            value={metric}
            onChange={(e) => setMetric(e.target.value as StatsMetric)}
            optionType="button"
            buttonStyle="solid"
            options={METRIC_OPTIONS}
          />
          <Radio.Group
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as StatsGranularity)}
            optionType="button"
            buttonStyle="solid"
            options={GRANULARITY_OPTIONS}
          />
          <RangePicker
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
          />
        </div>
      </div>

      <Spin spinning={loading}>
        <Card className={styles.card} bordered={false}>
          <div style={{ color: '#7dd3fc', marginBottom: 12 }}>
            {METRIC_LABEL[metric]} 趋势({METRIC_LABEL[metric]})
          </div>
          {trends && trends.points.length > 0 ? (
            <div className={styles.lineChartWrap}>
              <LineChart points={trends.points} color={lineColor} />
            </div>
          ) : (
            <div style={{ padding: 60, textAlign: 'center', color: '#8b949e' }}>
              暂无数据
            </div>
          )}
        </Card>
      </Spin>
    </div>
  )
}
