// 用户留存分析页 - SubTask 26.4
//
// Cohort 表格:行=注册日期(按周分组),列=Day+1/+7/+30 留存率
// 单元格颜色深浅表示留存率高低
// API: GET /admin/stats/retention

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Radio, Spin, message } from 'antd'
import { ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import { getStatsRetention } from '@/api/admin-stats-api'
import type { RetentionCohortRow, StatsRetention } from '@/types/admin-stats'
import styles from './styles.module.css'

const PERIOD_OPTIONS = [
  { label: '近 30 天', value: '30d' },
  { label: '近 90 天', value: '90d' },
  { label: '近半年', value: '180d' }
]

/** 根据留存率返回背景色(0-1) */
function retentionColor(rate: number): string {
  if (rate <= 0) return 'transparent'
  // 0 -> 淡蓝,1 -> 深亮蓝
  const alpha = 0.15 + rate * 0.75
  return `rgba(56, 189, 248, ${alpha.toFixed(2)})`
}

export default function StatsRetention() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<string>('90d')
  const [data, setData] = useState<StatsRetention | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getStatsRetention({ period })
      setData(result)
    } catch (err) {
      console.error('[StatsRetention] load failed:', err)
      message.error('加载留存数据失败')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const renderCell = (rate: number) => (
    <td
      style={{
        background: retentionColor(rate),
        color: rate > 0.5 ? '#0a0e1a' : '#c7d2fe',
        fontWeight: 600
      }}
    >
      {(rate * 100).toFixed(1)}%
    </td>
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TeamOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>用户留存分析</h1>
            <div className={styles.subtitle}>Cohort 留存矩阵(按周分组)</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadList}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Radio.Group
            value={period}
            onChange={(e) => setPeriod(e.target.value as string)}
            optionType="button"
            buttonStyle="solid"
            options={PERIOD_OPTIONS}
          />
        </div>
      </div>

      <Spin spinning={loading}>
        <Card className={styles.card} bordered={false}>
          {data && data.cohorts.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.cohortTable}>
                <thead>
                  <tr>
                    <th>注册周</th>
                    <th>用户数</th>
                    <th>Day+1</th>
                    <th>Day+7</th>
                    <th>Day+30</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((row: RetentionCohortRow) => (
                    <tr key={row.cohortDate}>
                      <td className={styles.cohortHeader}>{row.cohortDate.slice(0, 10)}</td>
                      <td>{row.users.toLocaleString()}</td>
                      {renderCell(row.day1)}
                      {renderCell(row.day7)}
                      {renderCell(row.day30)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 16, color: '#8b949e', fontSize: 12 }}>
                单元格颜色越深表示留存率越高
              </div>
            </div>
          ) : (
            <Empty description="暂无留存数据" style={{ padding: 60 }} />
          )}
        </Card>
      </Spin>
    </div>
  )
}
