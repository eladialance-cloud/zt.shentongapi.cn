// 统一审核中心 - Task 3
//
// 聚合三类资源上架审核（智能体/工作流/插件）到统一 Tab 页面
// 复用现有审核组件（import 而非复制），保留旧 Review.tsx 文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（agent/workflow/plugin）
//
// 注：技能审核功能已在 SkillStore 页面内（技能包 Tab），不在此重复；
//     后续 Task 4 会重构 SkillStore，审核功能随之重组。

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminAgentsReview from '@/pages/Agents/Review'
import AdminWorkflowsReview from '@/pages/Workflows/Review'
import AdminPluginsReview from '@/pages/Plugins/Review'
import styles from './styles.module.css'

type ReviewTabKey = 'agent' | 'workflow' | 'plugin'

const VALID_TABS: ReadonlyArray<ReviewTabKey> = ['agent', 'workflow', 'plugin']

function resolveTab(value: string | null): ReviewTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as ReviewTabKey
  }
  return 'agent'
}

export default function AdminReview() {
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
      { key: 'agent', label: '智能体', children: <AdminAgentsReview /> },
      { key: 'workflow', label: '工作流', children: <AdminWorkflowsReview /> },
      { key: 'plugin', label: '插件', children: <AdminPluginsReview /> }
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
