// 插件 MCP 同步状态监控页 - SubTask 22.4
//
// 表格:插件名/MCP 同步状态(pending/synced/failed)/最后同步时间/错误信息/操作
// 操作:手动同步 POST /admin/plugins/:id/sync
// API: GET /admin/plugins/sync-status, POST /admin/plugins/:id/sync

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Pagination,
  Popconfirm,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CloudSyncOutlined,
  ReloadOutlined,
  SyncOutlined
} from '@ant-design/icons'
import {
  listPluginSyncStatus,
  syncPlugin
} from '@/api/admin-plugin-api'
import type {
  AdminPluginType,
  PluginSyncQuery,
  PluginSyncStatus,
  PluginSyncStatusItem
} from '@/types/admin-plugin'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_LABEL: Record<AdminPluginType, string> = {
  tool: '工具',
  connector: '连接器',
  knowledge_base: '知识库',
  workflow: '工作流'
}

const SYNC_TAG: Record<PluginSyncStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待同步' },
  synced: { color: 'green', text: '已同步' },
  failed: { color: 'red', text: '同步失败' }
}

export default function AdminPluginsSync() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PluginSyncStatusItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<PluginSyncStatus | 'synced' | ''>('')

  const [syncingId, setSyncingId] = useState<number | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: PluginSyncQuery = { page, pageSize: PAGE_SIZE }
      if (activeTab) query.status = activeTab
      const result = await listPluginSyncStatus(query)
      const r = result as AdminPaginatedResult<PluginSyncStatusItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[PluginSync] load failed:', err)
      message.error('加载同步状态失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as PluginSyncStatus | '')
    setPage(1)
  }

  const handleSync = async (item: PluginSyncStatusItem) => {
    setSyncingId(item.id)
    try {
      await syncPlugin(item.id)
      message.success(`已触发 ${item.name} 同步`)
      // 本地乐观更新状态为 pending
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, syncStatus: 'pending', errorMessage: undefined }
            : p
        )
      )
    } catch (err) {
      console.error('[PluginSync] sync failed:', err)
      message.error('同步失败')
    } finally {
      setSyncingId(null)
    }
  }

  const columns: TableColumnsType<PluginSyncStatusItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '插件名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (t: AdminPluginType) => <Tag color="blue">{TYPE_LABEL[t]}</Tag>
    },
    {
      title: '同步状态',
      dataIndex: 'syncStatus',
      key: 'syncStatus',
      width: 120,
      render: (s: PluginSyncStatus) => (
        <Tag color={SYNC_TAG[s].color}>{SYNC_TAG[s].text}</Tag>
      )
    },
    {
      title: '最后同步时间',
      dataIndex: 'lastSyncedAt',
      key: 'lastSyncedAt',
      width: 180,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (v?: string) =>
        v ? (
          <span style={{ color: '#f87171', fontSize: 12 }} title={v}>
            {v.length > 50 ? v.slice(0, 50) + '...' : v}
          </span>
        ) : (
          <span style={{ color: '#8b949e' }}>-</span>
        )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: PluginSyncStatusItem) => (
        <Popconfirm
          title={`确认手动同步 ${record.name}?`}
          onConfirm={() => handleSync(record)}
          okText="同步"
          cancelText="取消"
        >
          <Button
            type="link"
            size="small"
            icon={<SyncOutlined spin={syncingId === record.id} />}
            loading={syncingId === record.id}
          >
            手动同步
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <CloudSyncOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>插件 MCP 同步监控</h1>
            <div className={styles.subtitle}>查看同步状态并手动触发同步</div>
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

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: '', label: '全部' },
          { key: 'pending', label: '待同步' },
          { key: 'synced', label: '已同步' },
          { key: 'failed', label: '同步失败' }
        ]}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<PluginSyncStatusItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1100 }}
            />
          </div>
        )}
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </Spin>
    </div>
  )
}
