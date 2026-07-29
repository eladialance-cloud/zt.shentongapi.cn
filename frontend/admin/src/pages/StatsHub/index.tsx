// 数据统计聚合页 - Task 2
//
// 聚合四类统计相关页面到统一 Tab 页面：
//   总览 / 趋势分析 / 排行榜 / 用户留存
// 复用现有组件（import 而非复制），保留旧页面文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（overview/trends/rankings/retention）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import StatsOverview from '@/pages/Stats/Overview'
import StatsTrends from '@/pages/Stats/Trends'
import StatsRankings from '@/pages/Stats/Rankings'
import StatsRetention from '@/pages/Stats/Retention'
import styles from './styles.module.css'

type StatsTabKey = 'overview' | 'trends' | 'rankings' | 'retention'

const VALID_TABS: ReadonlyArray<StatsTabKey> = [
  'overview',
  'trends',
  'rankings',
  'retention'
]

function resolveTab(value: string | null): StatsTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as StatsTabKey
  }
  return 'overview'
}

export default function StatsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))

  const handleTabChange = useCallback(
    (key: string) => {
      setSearchParams({ tab: key }, { replace: true })
    },
    [setSearchParams]
  )

  const items = useMemo(
    () => [
      { key: 'overview', label: '总览', children: <StatsOverview /> },
      { key: 'trends', label: '趋势分析', children: <StatsTrends /> },
      { key: 'rankings', label: '排行榜', children: <StatsRankings /> },
      { key: 'retention', label: '用户留存', children: <StatsRetention /> }
    ],
    []
  )

  return (
    <div className={styles.page}>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={items}
      />
    </div>
  )
}
