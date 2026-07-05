// Agent 定价管理页 - SubTask 20.3
//
// 定价管理:展示所有已发布 Agent 的定价信息,支持快速调整价格
// (基础定价字段已在 index.tsx 编辑模态框中提供,本页用于批量查看与快速调价)
// API: GET /admin/agents?status=published, PATCH /admin/agents/:id

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DollarOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { listAdminAgents, updateAdminAgent } from '@/api/admin-agent-api'
import type {
  AdminAgentItem,
  AgentCategory,
  AgentPricingMode
} from '@/types/admin-agent'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const PRICING_MODE_OPTIONS: Array<{ label: string; value: AgentPricingMode }> = [
  { label: '按次计费', value: 'perCall' },
  { label: '按 Token 计费', value: 'perToken' }
]

const CATEGORY_LABEL: Record<AgentCategory, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他'
}

interface PriceEditValues {
  pricingMode: AgentPricingMode
  pricePerCall: number
  pricePerTokenInput: number
  pricePerTokenOutput: number
}

export default function AdminAgentsPricing() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminAgentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<AgentCategory | ''>('')

  const [editTarget, setEditTarget] = useState<AdminAgentItem | null>(null)
  const [editValues, setEditValues] = useState<PriceEditValues | null>(null)
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: 'published' }
      if (statusFilter) query.category = statusFilter
      const result = await listAdminAgents(query)
      const r = result as AdminPaginatedResult<AdminAgentItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AgentPricing] load failed:', err)
      message.error('加载定价列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleEdit = (item: AdminAgentItem) => {
    setEditTarget(item)
    setEditValues({
      pricingMode: item.pricingMode,
      pricePerCall: item.pricePerCall,
      pricePerTokenInput: item.pricePerTokenInput,
      pricePerTokenOutput: item.pricePerTokenOutput
    })
  }

  const handleSave = async () => {
    if (!editTarget || !editValues) return
    setSaving(true)
    try {
      await updateAdminAgent(editTarget.id, {
        pricingMode: editValues.pricingMode,
        pricePerCall: editValues.pricePerCall,
        pricePerTokenInput: editValues.pricePerTokenInput,
        pricePerTokenOutput: editValues.pricePerTokenOutput
      })
      message.success('定价已更新')
      setItems((prev) =>
        prev.map((a) =>
          a.id === editTarget.id
            ? {
                ...a,
                pricingMode: editValues.pricingMode,
                pricePerCall: editValues.pricePerCall,
                pricePerTokenInput: editValues.pricePerTokenInput,
                pricePerTokenOutput: editValues.pricePerTokenOutput
              }
            : a
        )
      )
      setEditTarget(null)
    } catch (err) {
      console.error('[AgentPricing] save failed:', err)
      message.error('更新定价失败')
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<AdminAgentItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: 'Agent 名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: AgentCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '计费模式',
      dataIndex: 'pricingMode',
      key: 'pricingMode',
      width: 120,
      render: (m: AgentPricingMode) => (
        <Tag color={m === 'perCall' ? 'gold' : 'geekblue'}>
          {m === 'perCall' ? '按次' : '按 Token'}
        </Tag>
      )
    },
    {
      title: '每次调用价格(积分)',
      dataIndex: 'pricePerCall',
      key: 'pricePerCall',
      width: 160,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '输入 Token 单价',
      dataIndex: 'pricePerTokenInput',
      key: 'pricePerTokenInput',
      width: 150,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '输出 Token 单价',
      dataIndex: 'pricePerTokenOutput',
      key: 'pricePerTokenOutput',
      width: 150,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: AdminAgentItem) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
          调价
        </Button>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <DollarOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 定价管理</h1>
            <div className={styles.subtitle}>查看与调整已发布 Agent 的定价</div>
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
          <Select
            placeholder="分类筛选"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as AgentCategory | '')}
            className={styles.filterSelect}
            allowClear
            options={[
              { label: '办公', value: 'office' },
              { label: '编程', value: 'programming' },
              { label: '文案', value: 'copywriting' },
              { label: '数据分析', value: 'data_analysis' },
              { label: '其他', value: 'other' }
            ]}
          />
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminAgentItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1200 }}
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

      {/* 调价 Modal */}
      <Modal
        title={`调价 - ${editTarget?.name || ''}`}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        {editValues ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#e6edf3' }}>计费模式</label>
              <Select
                value={editValues.pricingMode}
                onChange={(v: AgentPricingMode) =>
                  setEditValues({ ...editValues, pricingMode: v })
                }
                options={PRICING_MODE_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#e6edf3' }}>每次调用价格(积分)</label>
              <InputNumber
                min={0}
                value={editValues.pricePerCall}
                onChange={(v) =>
                  setEditValues({ ...editValues, pricePerCall: v ?? 0 })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#e6edf3' }}>输入 Token 单价</label>
              <InputNumber
                min={0}
                step={0.0001}
                value={editValues.pricePerTokenInput}
                onChange={(v) =>
                  setEditValues({ ...editValues, pricePerTokenInput: v ?? 0 })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, color: '#e6edf3' }}>输出 Token 单价</label>
              <InputNumber
                min={0}
                step={0.0001}
                value={editValues.pricePerTokenOutput}
                onChange={(v) =>
                  setEditValues({ ...editValues, pricePerTokenOutput: v ?? 0 })
                }
                style={{ width: '100%' }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
