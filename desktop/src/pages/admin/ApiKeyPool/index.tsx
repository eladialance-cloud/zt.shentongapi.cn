// API Key 池列表页 - SubTask 19.1-19.6
//
// 筛选:provider/status
// 表格:别名/Provider/优先级/状态/总额度/已用/剩余/最后使用/最后检查/错误次数/操作
// 新增/编辑模态框:provider/apiKey(密码输入)/alias/priority/totalQuota
// 操作:编辑/禁用/启用/删除/重置错误计数/配额限制
// API: GET/POST/PATCH/DELETE /admin/api-key-pool, reset-errors, limits

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  KeyOutlined,
  StopOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import {
  createApiKey,
  deleteApiKey,
  listApiKeyPool,
  resetApiKeyErrors,
  updateApiKey,
  updateApiKeyLimits
} from '@/api/admin-api-key-pool-api'
import type {
  ApiKeyPoolItem,
  ApiKeyProvider,
  ApiKeyStatus,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  UpdateApiKeyLimitsDto
} from '@/types/admin-api-key-pool'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const PROVIDER_OPTIONS: Array<{ label: string; value: ApiKeyProvider | '' }> = [
  { label: '全部 Provider', value: '' },
  { label: 'OpenAI', value: 'openai' },
  { label: '豆包', value: 'doubao' },
  { label: '通义千问', value: 'qwen' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '其他', value: 'other' }
]

const PROVIDER_LABEL: Record<ApiKeyProvider, string> = {
  openai: 'OpenAI',
  doubao: '豆包',
  qwen: '通义千问',
  deepseek: 'DeepSeek',
  other: '其他'
}

const STATUS_OPTIONS: Array<{ label: string; value: ApiKeyStatus | '' }> = [
  { label: '全部状态', value: '' },
  { label: '正常', value: 'active' },
  { label: '已耗尽', value: 'exhausted' },
  { label: '错误', value: 'error' },
  { label: '已禁用', value: 'disabled' }
]

const STATUS_TAG: Record<
  ApiKeyStatus,
  { color: string; text: string }
> = {
  active: { color: 'green', text: '正常' },
  exhausted: { color: 'orange', text: '已耗尽' },
  error: { color: 'red', text: '错误' },
  disabled: { color: 'default', text: '已禁用' }
}

interface KeyFormValues {
  provider: ApiKeyProvider
  apiKey: string
  alias: string
  priority: number
  totalQuota: number
}

interface LimitsFormValues {
  dailyQuota: number
  monthlyQuota: number
}

export default function AdminApiKeyPool() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ApiKeyPoolItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState<ApiKeyProvider | ''>('')
  const [status, setStatus] = useState<ApiKeyStatus | ''>('')

  // 新增/编辑
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<ApiKeyPoolItem | null>(null)
  const [form] = Form.useForm<KeyFormValues>()
  const [saving, setSaving] = useState(false)

  // 配额限制
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [limitsTarget, setLimitsTarget] = useState<ApiKeyPoolItem | null>(null)
  const [limitsForm] = Form.useForm<LimitsFormValues>()
  const [limitsSaving, setLimitsSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (provider) query.provider = provider
      if (status) query.status = status
      const result = await listApiKeyPool(query)
      const r = result as AdminPaginatedResult<ApiKeyPoolItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[ApiKeyPool] load failed:', err)
      message.error('加载 Key 池列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, provider, status])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleSearch = () => {
    setPage(1)
    void loadList()
  }

  const handleReset = () => {
    setProvider('')
    setStatus('')
    setPage(1)
  }

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      provider: 'openai',
      priority: 0,
      totalQuota: 0
    })
    setEditOpen(true)
  }

  const handleEdit = (item: ApiKeyPoolItem) => {
    setEditing(item)
    form.setFieldsValue({
      provider: item.provider,
      apiKey: '',
      alias: item.alias,
      priority: item.priority,
      totalQuota: item.totalQuota
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateApiKeyDto = {
          provider: values.provider,
          alias: values.alias,
          priority: values.priority,
          totalQuota: values.totalQuota
        }
        await updateApiKey(editing.id, dto)
        message.success('Key 已更新')
      } else {
        const dto: CreateApiKeyDto = {
          provider: values.provider,
          apiKey: values.apiKey,
          alias: values.alias,
          priority: values.priority,
          totalQuota: values.totalQuota
        }
        await createApiKey(dto)
        message.success('Key 已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[ApiKeyPool] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDisable = async (item: ApiKeyPoolItem) => {
    try {
      const newStatus: ApiKeyStatus = item.status === 'disabled' ? 'active' : 'disabled'
      await updateApiKey(item.id, { status: newStatus })
      message.success(newStatus === 'disabled' ? '已禁用' : '已启用')
      setItems((prev) =>
        prev.map((k) => (k.id === item.id ? { ...k, status: newStatus } : k))
      )
    } catch (err) {
      console.error('[ApiKeyPool] toggle failed:', err)
      message.error('操作失败')
    }
  }

  const handleResetErrors = async (item: ApiKeyPoolItem) => {
    try {
      await resetApiKeyErrors(item.id)
      message.success('错误计数已重置')
      setItems((prev) =>
        prev.map((k) =>
          k.id === item.id ? { ...k, errorCount: 0, status: 'active' } : k
        )
      )
    } catch (err) {
      console.error('[ApiKeyPool] reset errors failed:', err)
      message.error('重置失败')
    }
  }

  const handleDelete = async (item: ApiKeyPoolItem) => {
    try {
      await deleteApiKey(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[ApiKeyPool] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleOpenLimits = (item: ApiKeyPoolItem) => {
    setLimitsTarget(item)
    limitsForm.setFieldsValue({
      dailyQuota: item.dailyQuota ?? 0,
      monthlyQuota: item.monthlyQuota ?? 0
    })
    setLimitsOpen(true)
  }

  const handleSaveLimits = async () => {
    if (!limitsTarget) return
    try {
      const values = await limitsForm.validateFields()
      const dto: UpdateApiKeyLimitsDto = {
        dailyQuota: values.dailyQuota,
        monthlyQuota: values.monthlyQuota
      }
      setLimitsSaving(true)
      await updateApiKeyLimits(limitsTarget.id, dto)
      message.success('配额限制已更新')
      setLimitsOpen(false)
      setItems((prev) =>
        prev.map((k) =>
          k.id === limitsTarget.id
            ? { ...k, dailyQuota: dto.dailyQuota, monthlyQuota: dto.monthlyQuota }
            : k
        )
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[ApiKeyPool] save limits failed:', err)
      message.error('更新配额失败')
    } finally {
      setLimitsSaving(false)
    }
  }

  const columns: TableColumnsType<ApiKeyPoolItem> = [
    {
      title: '别名',
      dataIndex: 'alias',
      key: 'alias',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 110,
      render: (p: ApiKeyProvider) => <Tag color="blue">{PROVIDER_LABEL[p]}</Tag>
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: ApiKeyStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '总额度',
      dataIndex: 'totalQuota',
      key: 'totalQuota',
      width: 110,
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '已用',
      dataIndex: 'usedQuota',
      key: 'usedQuota',
      width: 110,
      render: (v: number) => <span style={{ color: '#fbbf24' }}>{v.toLocaleString()}</span>
    },
    {
      title: '剩余',
      dataIndex: 'remainingQuota',
      key: 'remainingQuota',
      width: 110,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
    },
    {
      title: '最后使用',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheckedAt',
      key: 'lastCheckedAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '错误次数',
      dataIndex: 'errorCount',
      key: 'errorCount',
      width: 90,
      render: (v: number) =>
        v >= 5 ? (
          <span style={{ color: '#f87171', fontWeight: 600 }}>
            <WarningOutlined /> {v}
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>{v}</span>
        )
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record: ApiKeyPoolItem) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.status === 'disabled' ? <CheckCircleOutlined /> : <StopOutlined />}
            onClick={() => handleToggleDisable(record)}
          >
            {record.status === 'disabled' ? '启用' : '禁用'}
          </Button>
          <Button type="link" size="small" onClick={() => handleOpenLimits(record)}>
            配额
          </Button>
          <Button type="link" size="small" onClick={() => handleResetErrors(record)}>
            重置错误
          </Button>
          <Popconfirm
            title="确认删除该 Key?"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <KeyOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>API Key 池管理</h1>
            <div className={styles.subtitle}>管理供应商 API Key 与配额</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadList}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            className={styles.primaryBtn}
          >
            新增 Key
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="Provider"
            value={provider}
            onChange={(v) => setProvider(v as ApiKeyProvider | '')}
            className={styles.filterSelect}
            options={PROVIDER_OPTIONS}
            allowClear
          />
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v as ApiKeyStatus | '')}
            className={styles.filterSelect}
            options={STATUS_OPTIONS}
            allowClear
          />
        </div>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className={styles.primaryBtn}>
          查询
        </Button>
        <Button onClick={handleReset} className={styles.ghostBtn}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无 Key" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<ApiKeyPoolItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1500 }}
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

      {/* 新增/编辑 Modal */}
      <Modal
        title={editing ? `编辑 Key - ${editing.alias}` : '新增 Key'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        <Form<KeyFormValues> form={form} layout="vertical">
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: '请选择 Provider' }]}
          >
            <Select
              options={PROVIDER_OPTIONS.filter((o) => o.value !== '').map((o) => ({
                label: o.label,
                value: o.value as ApiKeyProvider
              }))}
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={
              editing
                ? []
                : [{ required: true, message: '请输入 API Key' }]
            }
            extra={editing ? '留空表示不修改 Key' : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="alias"
            label="别名"
            rules={[{ required: true, message: '请输入别名' }]}
          >
            <Input placeholder="如:openai-main" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级(数字越大越优先)"
            rules={[{ required: true, message: '请输入优先级' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="totalQuota"
            label="总额度"
            rules={[{ required: true, message: '请输入总额度' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 配额限制 Modal */}
      <Modal
        title={`配额限制 - ${limitsTarget?.alias || ''}`}
        open={limitsOpen}
        onCancel={() => setLimitsOpen(false)}
        onOk={handleSaveLimits}
        confirmLoading={limitsSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<LimitsFormValues> form={limitsForm} layout="vertical">
          <Form.Item
            name="dailyQuota"
            label="日配额上限"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="monthlyQuota"
            label="月配额上限"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
