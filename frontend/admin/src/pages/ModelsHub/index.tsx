// 模型管理聚合页 - Task 2
//
// 模型管理主入口：大模型配置（含 API 连接凭据 / 中转站批量导入）
// API Key 池已合并到模型模块中，每个模型独立管理连接凭据。
// 支持 ?tab=xxx URL 参数控制激活的 Tab（model/stats）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminModels from '@/pages/Models'
import styles from './styles.module.css'

type ModelsTabKey = 'model' | 'stats'

const VALID_TABS: ReadonlyArray<ModelsTabKey> = ['model', 'stats']

function resolveTab(value: string | null): ModelsTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as ModelsTabKey
  }
  return 'model'
}

export default function ModelsHub() {
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
      { key: 'model', label: '模型列表', children: <AdminModels /> },
      { key: 'stats', label: '使用统计', children: <div style={{ padding: 24, color: '#8b949e' }}>统计功能将随模型使用数据接入后启用。</div> }
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
