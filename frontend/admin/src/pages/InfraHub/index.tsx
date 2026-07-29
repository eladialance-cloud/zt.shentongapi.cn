// 基础设施聚合页 - Task 2
//
// 聚合两类基础设施相关页面到统一 Tab 页面：
//   存储配置（OSS）/ 任务中心（任务详情查询）
// 复用现有组件（import 而非复制），保留旧页面文件不删除
// 支持 ?tab=xxx URL 参数控制激活的 Tab（oss/tasks）

import { useCallback, useMemo } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import AdminOss from '@/pages/Oss'
import AdminTasks from '@/pages/Tasks'
import styles from './styles.module.css'

type InfraTabKey = 'oss' | 'tasks'

const VALID_TABS: ReadonlyArray<InfraTabKey> = ['oss', 'tasks']

function resolveTab(value: string | null): InfraTabKey {
  if (value && (VALID_TABS as ReadonlyArray<string>).includes(value)) {
    return value as InfraTabKey
  }
  return 'oss'
}

export default function InfraHub() {
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
      { key: 'oss', label: '存储配置', children: <AdminOss /> },
      { key: 'tasks', label: '任务中心', children: <AdminTasks /> }
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
