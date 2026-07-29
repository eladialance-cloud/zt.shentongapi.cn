// 工作流聚合页 - Task 2
//
// 聚合三类工作流相关页面到统一 Tab 页面：
//   列表（工作流模板）/ 统计（执行统计）/ 工作流库（GitHub 模板库）
// 复用现有组件（import 而非复制），保留旧页面文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（list/stats/lib）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminWorkflows from '@/pages/Workflows'
import AdminWorkflowsStats from '@/pages/Workflows/Stats'
import AdminWorkflowLib from '@/pages/WorkflowLib'
import styles from './styles.module.css'

type WorkflowsTabKey = 'list' | 'stats' | 'lib'

const VALID_TABS: ReadonlyArray<WorkflowsTabKey> = ['list', 'stats', 'lib']

function resolveTab(value: string | null): WorkflowsTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as WorkflowsTabKey
  }
  return 'list'
}

export default function WorkflowsHub() {
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
      { key: 'list', label: '列表', children: <AdminWorkflows /> },
      { key: 'stats', label: '统计', children: <AdminWorkflowsStats /> },
      { key: 'lib', label: '工作流库', children: <AdminWorkflowLib /> }
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
