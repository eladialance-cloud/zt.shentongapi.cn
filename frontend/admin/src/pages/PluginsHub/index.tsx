// 插件与技能聚合页 - Task 2
//
// 聚合三类插件/技能相关页面到统一 Tab 页面：
//   插件（官方插件）/ 同步（MCP 同步状态）/ 技能商店（技能源与技能包）
// 复用现有组件（import 而非复制），保留旧页面文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（plugin/sync/skill）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminPlugins from '@/pages/Plugins'
import AdminPluginsSync from '@/pages/Plugins/Sync'
import AdminSkillStore from '@/pages/SkillStore'
import styles from './styles.module.css'

type PluginsTabKey = 'plugin' | 'sync' | 'skill'

const VALID_TABS: ReadonlyArray<PluginsTabKey> = ['plugin', 'sync', 'skill']

function resolveTab(value: string | null): PluginsTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as PluginsTabKey
  }
  return 'plugin'
}

export default function PluginsHub() {
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
      { key: 'plugin', label: '插件', children: <AdminPlugins /> },
      { key: 'sync', label: '同步', children: <AdminPluginsSync /> },
      { key: 'skill', label: '技能商店', children: <AdminSkillStore /> }
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
