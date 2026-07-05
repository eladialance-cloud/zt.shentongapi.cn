// 大模型配置管理页 - SubTask 23.1 + 23.2 + 23.3
//
// 筛选:provider/openai/doubao/qwen/deepseek/other)/enabled
// 表格:模型 ID/Provider/显示名/输入单价/输出单价/最低等级/启用状态/同步状态/操作
// 启用/禁用开关(antd Switch)
// 模态框字段:provider/modelId(unique)/displayName/apiKey(密码)/apiEndpoint/
//   inputPricePerToken/outputPricePerToken/capabilities(多选)/enabled/
//   concurrencyLimit/rateLimitPerMinute/minUserLevel
// 同步状态:颜色标签,操作:手动同步 POST /admin/models/:id/sync
// API: GET/POST/PATCH /admin/models, POST /admin/models/:id/sync

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
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CloudSyncOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined
} from '@ant-design/icons'
import {
  createAdminModel,
  listAdminModels,
  syncAdminModel,
  updateAdminModel
} from '@/api/admin-model-api'
import type {
  AdminModelItem,
  CreateAdminModelDto,
  MinUserLevel,
  ModelCapability,
  ModelProvider,
  ModelSyncStatus,
  UpdateAdminModelDto
} from '@/types/admin-model'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const PROVIDER_OPTIONS: Array<{ label: string; value: ModelProvider }> = [
  { label: 'OpenAI', value: 'openai' },
  { label: '豆包', value: 'doubao' },
  { label: '通义千问', value: 'qwen' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '其他', value: 'other' }
]

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  doubao: '豆包',
  qwen: '通义千问',
  deepseek: 'DeepSeek',
  other: '其他'
}

const PROVIDER_COLOR: Record<ModelProvider, string> = {
  openai: 'green',
  doubao: 'orange',
  qwen: 'purple',
  deepseek: 'blue',
  other: 'default'
}

const CAPABILITY_OPTIONS: Array<{ label: string; value: ModelCapability }> = [
  { label: '视觉 (Vision)', value: 'vision' },
  { label: '函数调用 (Function Calling)', value: 'function_calling' },
  { label: '流式 (Streaming)', value: 'streaming' },
  { label: '推理 (Reasoning)', value: 'reasoning' },
  { label: 'JSON 模式 (JSON Mode)', value: 'json_mode' }
]

const CAPABILITY_LABEL: Record<ModelCapability, string> = {
  vision: '视觉',
  function_calling: '函数调用',
  streaming: '流式',
  reasoning: '推理',
  json_mode: 'JSON'
}

const SYNC_TAG: Record<ModelSyncStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待同步' },
  synced: { color: 'green', text: '已同步' },
  failed: { color: 'red', text: '同步失败' }
}

const LEVEL_OPTIONS: Array<{ label: string; value: MinUserLevel }> = [
  { label: 'Lv1', value: 1 },
  { label: 'Lv2', value: 2 },
  { label: 'Lv3', value: 3 },
  { label: 'Lv4', value: 4 },
  { label: 'Lv5', value: 5 }
]

const ENABLED_OPTIONS = [
  { label: '全部', value: '' },
  { label: '已启用', value: 'true' },
  { label: '已禁用', value: 'false' }
]

interface ModelFormValues {
  provider: ModelProvider
  modelId: string
  displayName: string
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken: number
  outputPricePerToken: number
  capabilities: ModelCapability[]
  enabled: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel: MinUserLevel
}

export default function AdminModels() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminModelItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [provider, setProvider] = useState<ModelProvider | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminModelItem | null>(null)
  const [form] = Form.useForm<ModelFormValues>()
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (provider) query.provider = provider
      if (enabledFilter) query.enabled = enabledFilter === 'true'
      const result = await listAdminModels(query)
      const r = result as AdminPaginatedResult<AdminModelItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminModels] load failed:', err)
      message.error('加载模型列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, provider, enabledFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleSearch = () => {
    setPage(1)
    void loadList()
  }

  const handleReset = () => {
    setProvider('')
    setEnabledFilter('')
    setPage(1)
  }

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      provider: 'openai',
      inputPricePerToken: 0,
      outputPricePerToken: 0,
      capabilities: [],
      enabled: true,
      minUserLevel: 1,
      concurrencyLimit: 10,
      rateLimitPerMinute: 60
    })
    setEditOpen(true)
  }

  const handleEdit = (item: AdminModelItem) => {
    setEditing(item)
    form.setFieldsValue({
      provider: item.provider,
      modelId: item.modelId,
      displayName: item.displayName,
      apiKey: '',
      apiEndpoint: item.apiEndpoint,
      inputPricePerToken: item.inputPricePerToken,
      outputPricePerToken: item.outputPricePerToken,
      capabilities: item.capabilities || [],
      enabled: item.enabled,
      concurrencyLimit: item.concurrencyLimit,
      rateLimitPerMinute: item.rateLimitPerMinute,
      minUserLevel: item.minUserLevel
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateAdminModelDto = {
          provider: values.provider,
          modelId: values.modelId,
          displayName: values.displayName,
          apiEndpoint: values.apiEndpoint,
          inputPricePerToken: values.inputPricePerToken,
          outputPricePerToken: values.outputPricePerToken,
          capabilities: values.capabilities,
          enabled: values.enabled,
          concurrencyLimit: values.concurrencyLimit,
          rateLimitPerMinute: values.rateLimitPerMinute,
          minUserLevel: values.minUserLevel
        }
        if (values.apiKey && values.apiKey.trim()) {
          dto.apiKey = values.apiKey
        }
        await updateAdminModel(editing.id, dto)
        message.success('模型已更新')
      } else {
        const dto: CreateAdminModelDto = {
          provider: values.provider,
          modelId: values.modelId,
          displayName: values.displayName,
          apiKey: values.apiKey,
          apiEndpoint: values.apiEndpoint,
          inputPricePerToken: values.inputPricePerToken,
          outputPricePerToken: values.outputPricePerToken,
          capabilities: values.capabilities,
          enabled: values.enabled,
          concurrencyLimit: values.concurrencyLimit,
          rateLimitPerMinute: values.rateLimitPerMinute,
          minUserLevel: values.minUserLevel
        }
        await createAdminModel(dto)
        message.success('模型已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminModels] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnabled = async (item: AdminModelItem, checked: boolean) => {
    try {
      await updateAdminModel(item.id, { enabled: checked })
      message.success(checked ? '已启用' : '已禁用')
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, enabled: checked } : m))
      )
    } catch (err) {
      console.error('[AdminModels] toggle failed:', err)
      message.error('操作失败')
    }
  }

  const handleSync = async (item: AdminModelItem) => {
    setSyncingId(item.id)
    try {
      await syncAdminModel(item.id)
      message.success(`已触发 ${item.displayName} 同步`)
      setItems((prev) =>
        prev.map((m) =>
          m.id === item.id
            ? { ...m, syncStatus: 'pending', syncErrorMessage: undefined }
            : m
        )
      )
    } catch (err) {
      console.error('[AdminModels] sync failed:', err)
      message.error('同步失败')
    } finally {
      setSyncingId(null)
    }
  }

  const columns: TableColumnsType<AdminModelItem> = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 110,
      render: (p: ModelProvider) => <Tag color={PROVIDER_COLOR[p]}>{PROVIDER_LABEL[p]}</Tag>
    },
    {
      title: '显示名',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 140,
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '输入单价',
      dataIndex: 'inputPricePerToken',
      key: 'inputPricePerToken',
      width: 110,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '输出单价',
      dataIndex: 'outputPricePerToken',
      key: 'outputPricePerToken',
      width: 110,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '最低等级',
      dataIndex: 'minUserLevel',
      key: 'minUserLevel',
      width: 90,
      render: (lv: MinUserLevel) => <Tag color="purple">Lv{lv}</Tag>
    },
    {
      title: '能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
      render: (caps: ModelCapability[]) =>
        caps && caps.length > 0 ? (
          <span>
            {caps.map((c) => (
              <Tag key={c} style={{ marginRight: 4, fontSize: 11 }}>
                {CAPABILITY_LABEL[c]}
              </Tag>
            ))}
          </span>
        ) : (
          <span style={{ color: '#8b949e' }}>-</span>
        )
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: AdminModelItem) => (
        <Switch
          checked={enabled}
          size="small"
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      )
    },
    {
      title: '同步状态',
      dataIndex: 'syncStatus',
      key: 'syncStatus',
      width: 110,
      render: (s: ModelSyncStatus, record: AdminModelItem) => (
        <Tag color={SYNC_TAG[s].color} title={record.syncErrorMessage || ''}>
          {SYNC_TAG[s].text}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: AdminModelItem) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={`确认手动同步 ${record.displayName}?`}
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
              同步
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
          <CloudSyncOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>大模型配置</h1>
            <div className={styles.subtitle}>管理模型 Provider / 价格 / 同步状态</div>
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
            新增模型
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="Provider"
            value={provider}
            onChange={(v) => setProvider(v as ModelProvider | '')}
            className={styles.filterSelect}
            allowClear
            options={PROVIDER_OPTIONS}
          />
          <Select
            placeholder="启用状态"
            value={enabledFilter}
            onChange={(v) => setEnabledFilter((v ?? '') as '' | 'true' | 'false')}
            className={styles.filterSelect}
            allowClear
            options={ENABLED_OPTIONS}
          />
        </div>
        <Button type="primary" onClick={handleSearch} className={styles.primaryBtn}>
          查询
        </Button>
        <Button onClick={handleReset} className={styles.ghostBtn}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无模型" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminModelItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1300 }}
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
        title={editing ? `编辑模型 - ${editing.displayName}` : '新增模型'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={680}
      >
        <Form<ModelFormValues> form={form} layout="vertical">
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: '请选择 Provider' }]}
          >
            <Select options={PROVIDER_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="modelId"
            label="模型 ID(unique)"
            rules={[{ required: true, message: '请输入模型 ID' }]}
          >
            <Input placeholder="如:gpt-4o-mini" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="如:GPT-4o mini" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key(AES 加密存储)"
            extra={editing ? `当前:${editing.apiKeyMasked || '******'}(留空不修改)` : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="apiEndpoint" label="API Endpoint">
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item
            name="inputPricePerToken"
            label="输入单价(每千 token,decimal)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="outputPricePerToken"
            label="输出单价(每千 token,decimal)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="capabilities"
            label="能力(多选)"
            rules={[{ required: true, message: '请至少选择一项能力' }]}
          >
            <Select mode="multiple" options={CAPABILITY_OPTIONS} placeholder="选择模型支持的能力" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item name="concurrencyLimit" label="并发上限">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rateLimitPerMinute" label="每分钟速率限制">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="minUserLevel"
            label="最低用户等级"
            rules={[{ required: true, message: '请选择等级' }]}
          >
            <Select options={LEVEL_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
