// 智能体聚合页 - Task 2
//
// 聚合三类智能体相关页面到统一 Tab 页面：
//   列表（Agent 列表）/ 扩展（部门与标签）/ 分类（5 固定分类）
// 复用现有组件（import 而非复制），保留旧页面文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（agent/ext/categories）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminAgents from '@/pages/Agents'
import AdminAgentExt from '@/pages/AgentExt'
import AdminAgentCategories from '@/pages/Agents/Categories'
import styles from './styles.module.css'

type AgentsTabKey = 'agent' | 'ext' | 'categories'

const VALID_TABS: ReadonlyArray<AgentsTabKey> = ['agent', 'ext', 'categories']

function resolveTab(value: string | null): AgentsTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as AgentsTabKey
  }
  return 'agent'
}

export default function AgentsHub() {
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
      { key: 'agent', label: '列表', children: <AdminAgents /> },
      { key: 'ext', label: '扩展', children: <AdminAgentExt /> },
      { key: 'categories', label: '分类', children: <AdminAgentCategories /> }
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
