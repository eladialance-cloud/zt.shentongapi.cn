// 大模型配置管理页 (v0.7.0 供应商体系)
//
// 新流程：添加第三方供应商(名称+Base URL+API Key) -> 测试 -> 读取模型 -> 勾选 -> 逐模型定价 -> 导入
// 模型管理：编辑(显示名/类型标签/积分单价/能力)/上下架/删除
//
// API:
//   GET/PATCH/DELETE /admin/models, POST /admin/models/:id/{enable,disable,test}
//   GET/POST/PATCH/DELETE /admin/models/providers, POST /admin/models/providers/test
//   POST /admin/models/providers/:id/{fetch-models,import}

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ShopOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import {
  disableAdminModel,
  enableAdminModel,
  listAdminModels,
  listAdminProviders,
  removeAdminModel,
  removeAdminProvider,
  testAdminProvider,
  testModel,
  updateAdminModel,
  updateAdminProvider
} from '@/api/admin-model-api'
import ProviderImportModal from './ProviderImportModal'
import type {
  AdminModelItem,
  AdminProviderItem,
  ConnectionStatus,
  ModelCapability,
  ModelType,
  UpdateAdminModelDto,
  UpdateProviderDto
} from '@/types/admin-model'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const MODEL_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '对话 chat', value: 'chat' },
  { label: '推理 reasoning', value: 'reasoning' },
  { label: '图像 image', value: 'image' },
  { label: '向量 embedding', value: 'embedding' },
  { label: '音频 audio', value: 'audio' }
]

const CAPABILITY_OPTIONS: Array<{ label: string; value: ModelCapability }> = [
  { label: '视觉 (Vision)', value: 'vision' },
  { label: '函数调用 (Function Calling)', value: 'function_calling' },
  { label: '流式 (Streaming)', value: 'streaming' },
  { label: '推理 (Reasoning)', value: 'reasoning' },
  { label: 'JSON 模式 (JSON Mode)', value: 'json_mode' }
]

const CAPABILITY_LABEL: Record<string, string> = {
  vision: '视觉',
  function_calling: '函数调用',
  streaming: '流式',
  reasoning: '推理',
  json_mode: 'JSON'
}

const CONNECTION_TAG: Record<string, { color: string; text: string }> = {
  untested: { color: 'default', text: '未测试' },
  connected: { color: 'green', text: '已连接' },
  failed: { color: 'red', text: '连接失败' }
}

const MODEL_TYPE_COLOR: Record<string, string> = {
  chat: 'geekblue',
  reasoning: 'purple',
  image: 'green',
  embedding: 'cyan',
  audio: 'orange'
}

const ENABLED_OPTIONS = [
  { label: '全部', value: '' },
  { label: '已上架', value: 'true' },
  { label: '已下架', value: 'false' }
]

interface ModelFormValues {
  displayName: string
  modelType: ModelType
  inputPricePerToken?: number
  outputPricePerToken?: number
  capabilities: ModelCapability[]
  enabled: boolean
}

export default function AdminModels() {
  // ----- 模型列表 -----
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminModelItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState<string | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')

  // ----- 供应商 -----
  const [providers, setProviders] = useState<AdminProviderItem[]>([])
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [providerLoading, setProviderLoading] = useState(false)
  const [editProvider, setEditProvider] = useState<AdminProviderItem | null>(null)
  const [providerForm] = Form.useForm()
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerTestingId, setProviderTestingId] = useState<number | null>(null)

  // ----- 模型编辑 -----
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminModelItem | null>(null)
  const [form] = Form.useForm<ModelFormValues>()
  const [saving, setSaving] = useState(false)

  // ----- 导入向导 -----
  const [importOpen, setImportOpen] = useState(false)
  const [importProvider, setImportProvider] = useState<AdminProviderItem | null>(null)
  const [testingModelId, setTestingModelId] = useState<number | null>(null)

  const loadProviders = useCallback(async () => {
    try {
      const list = await listAdminProviders()
      setProviders(list || [])
    } catch (err) {
      console.error('[AdminModels] load providers failed:', err)
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (providerFilter) query.provider = providerFilter
      if (enabledFilter) query.enabled = enabledFilter === 'true'
      if (searchKeyword) query.keyword = searchKeyword
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
  }, [page, providerFilter, enabledFilter, searchKeyword])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const handleReset = () => {
    setProviderFilter('')
    setEnabledFilter('')
    setKeyword('')
    setSearchKeyword('')
    setPage(1)
  }

  // ----- 模型编辑 -----
  const openEdit = (item: AdminModelItem) => {
    setEditing(item)
    form.setFieldsValue({
      displayName: item.displayName,
      modelType: item.modelType || 'chat',
      inputPricePerToken: item.inputPricePerToken ?? 0,
      outputPricePerToken: item.outputPricePerToken ?? 0,
      capabilities: item.capabilities || [],
      enabled: item.enabled
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (!editing) return
      setSaving(true)
      const dto: UpdateAdminModelDto = {
        displayName: values.displayName,
        modelType: values.modelType || 'chat',
        inputPricePerToken: values.inputPricePerToken ?? 0,
        outputPricePerToken: values.outputPricePerToken ?? 0,
        capabilities: values.capabilities,
        enabled: values.enabled
      }
      await updateAdminModel(editing.id, dto)
      message.success('模型已更新')
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
      if (checked) {
        await enableAdminModel(item.id)
      } else {
        await disableAdminModel(item.id)
      }
      message.success(checked ? '已上架' : '已下架')
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, enabled: checked } : m))
      )
    } catch (err) {
      console.error('[AdminModels] toggle failed:', err)
      message.error('操作失败')
    }
  }

  const handleDelete = async (item: AdminModelItem) => {
    try {
      await removeAdminModel(item.id)
      message.success('模型已删除')
      void loadList()
      void loadProviders()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.message || ''))
    }
  }

  const handleTestModel = async (item: AdminModelItem) => {
    setTestingModelId(item.id)
    try {
      const result = await testModel(item.id)
      message.success('测试通过: ' + (result.response || '').slice(0, 60))
      setItems((prev) =>
        prev.map((m) =>
          m.id === item.id
            ? { ...m, connectionStatus: 'connected' as ConnectionStatus }
            : m
        )
      )
    } catch (err: any) {
      console.error('[AdminModels] test failed:', err)
      message.error('测试失败: ' + (err?.message || ''))
      setItems((prev) =>
        prev.map((m) =>
          m.id === item.id ? { ...m, connectionStatus: 'failed' as ConnectionStatus } : m
        )
      )
    } finally {
      setTestingModelId(null)
    }
  }

  const columns: TableColumnsType<AdminModelItem> = [
    {
      title: '模型 ID',
      key: 'modelId',
      width: 220,
      render: (_, m) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.modelId}</div>
          {m.upstreamModelId && m.upstreamModelId !== m.modelId && (
            <div style={{ fontSize: 12, color: '#8b949e' }}>上游: {m.upstreamModelId}</div>
          )}
        </div>
      )
    },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', width: 160 },
    {
      title: '供应商',
      key: 'provider',
      width: 160,
      render: (_, m) => (
        <Space size={4} direction="vertical" style={{ gap: 0 }}>
          <span>{m.providerName || m.provider}</span>
          <span style={{ fontSize: 12, color: '#8b949e' }}>{m.provider}</span>
        </Space>
      )
    },
    {
      title: '类型标签',
      dataIndex: 'modelType',
      key: 'modelType',
      width: 120,
      render: (t: string) => (
        <Tag color={MODEL_TYPE_COLOR[t] || 'default'}>{t || 'chat'}</Tag>
      )
    },
    {
      title: '积分(输入/输出, 千token)',
      key: 'price',
      width: 170,
      render: (_, m) => (
        <span style={{ color: '#c7d2fe' }}>
          {m.inputPricePerToken ?? 0} / {m.outputPricePerToken ?? 0}
        </span>
      )
    },
    {
      title: '能力',
      key: 'capabilities',
      width: 180,
      render: (_, m) => (
        <Space size={4} wrap>
          {(m.capabilities || []).map((c) => (
            <Tag key={c} color="blue" style={{ marginRight: 0 }}>
              {CAPABILITY_LABEL[c] || c}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: '连接',
      key: 'connection',
      width: 100,
      render: (_, m) => {
        const c = CONNECTION_TAG[m.connectionStatus || 'untested'] || CONNECTION_TAG.untested
        return <Tag color={c.color}>{c.text}</Tag>
      }
    },
    {
      title: '状态',
      key: 'enabled',
      width: 90,
      render: (_, m) => (
        <Switch
          checked={m.enabled}
          onChange={(v) => void handleToggleEnabled(m, v)}
          checkedChildren="上架"
          unCheckedChildren="下架"
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, m) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testingModelId === m.id}
            onClick={() => void handleTestModel(m)}
          >
            测试
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(m)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该模型？"
            onConfirm={() => void handleDelete(m)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  // ----- 供应商管理 -----
  const loadProviderList = useCallback(async () => {
    setProviderLoading(true)
    try {
      const list = await listAdminProviders()
      setProviders(list || [])
    } catch (err: any) {
      message.error('加载供应商列表失败: ' + (err?.message || ''))
    } finally {
      setProviderLoading(false)
    }
  }, [])

  const openAddProvider = () => {
    setImportProvider(null)
    setImportOpen(true)
  }

  const openReadModels = (p: AdminProviderItem) => {
    setImportProvider(p)
    setImportOpen(true)
  }

  const openEditProvider = (p: AdminProviderItem) => {
    setEditProvider(p)
    providerForm.setFieldsValue({
      name: p.name,
      baseUrl: p.baseUrl,
      status: p.status
    })
  }

  const handleSaveProvider = async () => {
    if (!editProvider) return
    try {
      const values = await providerForm.validateFields()
      setProviderSaving(true)
      const dto: UpdateProviderDto = {
        name: values.name,
        baseUrl: values.baseUrl,
        status: values.status
      }
      if (values.apiKey && String(values.apiKey).trim()) dto.apiKey = String(values.apiKey).trim()
      await updateAdminProvider(editProvider.id, dto)
      message.success('供应商已更新')
      setEditProvider(null)
      void loadProviderList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('保存失败')
    } finally {
      setProviderSaving(false)
    }
  }

  const handleTestProvider = async (p: AdminProviderItem) => {
    setProviderTestingId(p.id)
    try {
      const r = await testAdminProvider({ providerId: p.id })
      message.success('连接成功: ' + (r.response || '').slice(0, 60))
      void loadProviderList()
    } catch (err: any) {
      message.error('连接失败: ' + (err?.message || ''))
      void loadProviderList()
    } finally {
      setProviderTestingId(null)
    }
  }

  const handleDeleteProvider = async (p: AdminProviderItem) => {
    try {
      await removeAdminProvider(p.id)
      message.success('供应商已删除')
      void loadProviderList()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.message || ''))
    }
  }

  const providerColumns: TableColumnsType<AdminProviderItem> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span>
    },
    {
      title: '连接状态',
      key: 'conn',
      width: 110,
      render: (_, p) => {
        const c = CONNECTION_TAG[p.connectionStatus || 'untested'] || CONNECTION_TAG.untested
        return <Tag color={c.color}>{c.text}</Tag>
      }
    },
    {
      title: '模型数',
      dataIndex: 'modelCount',
      key: 'modelCount',
      width: 80,
      render: (v: number) => <Tag color="geekblue">{v ?? 0}</Tag>
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (_, p) =>
        p.status === 'active' ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, p) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditProvider(p)}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={providerTestingId === p.id}
            onClick={() => void handleTestProvider(p)}
          >
            测试
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ApiOutlined />}
            onClick={() => openReadModels(p)}
          >
            读取模型
          </Button>
          <Popconfirm
            title="确认删除该供应商？"
            description="供应商下存在模型时不允许删除"
            onConfirm={() => void handleDeleteProvider(p)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const providerFilterOptions = useMemo(
    () => providers.map((p) => ({ label: p.name, value: p.slug })),
    [providers]
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApiOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>模型管理</h1>
            <p className={styles.subtitle}>
              添加第三方供应商 -&gt; 读取模型 -&gt; 勾选 -&gt; 逐模型定价导入；模型列表可直接编辑/上下架/删除
            </p>
          </div>
        </div>
        <Space>
          <Button
            className={styles.ghostBtn}
            icon={<ShopOutlined />}
            onClick={() => setProviderModalOpen(true)}
          >
            供应商管理
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={openAddProvider}
          >
            添加第三方供应商
          </Button>
        </Space>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="供应商"
            value={providerFilter}
            onChange={(v) => setProviderFilter(v as string | '')}
            className={styles.filterSelect}
            allowClear
            options={providerFilterOptions}
          />
          <Select
            placeholder="上架状态"
            value={enabledFilter}
            onChange={(v) => setEnabledFilter((v ?? '') as '' | 'true' | 'false')}
            className={styles.filterSelect}
            allowClear
            options={ENABLED_OPTIONS}
          />
          <Input.Search
            placeholder="搜索模型 ID / 名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => {
              setSearchKeyword(v)
              setPage(1)
            }}
            className={styles.searchBox}
            allowClear
          />
        </div>
        <Button type="primary" className={styles.primaryBtn} onClick={handleReset}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty
            description="暂无模型，请先点击右上角「添加第三方供应商」"
            style={{ marginTop: 80 }}
          />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminModelItem>
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

      {/* 编辑模型 */}
      <Modal
        title={editing ? `编辑模型 - ${editing.displayName}` : '编辑模型'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={620}
      >
        <Form<ModelFormValues> form={form} layout="vertical">
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="modelType" label="模型类型标签" extra="用户端按标签展示，可修改">
            <Select options={MODEL_TYPE_OPTIONS} allowClear placeholder="选择类型" />
          </Form.Item>
          <Form.Item
            name="inputPricePerToken"
            label="输入单价(积分/千token)"
            extra="用户使用该模型时按此价格扣除积分"
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="outputPricePerToken"
            label="输出单价(积分/千token)"
            extra="用户使用该模型时按此价格扣除积分"
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="capabilities" label="能力(多选)">
            <Select mode="multiple" options={CAPABILITY_OPTIONS} placeholder="选择模型支持的能力" />
          </Form.Item>
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch checkedChildren="上架" unCheckedChildren="下架" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 供应商管理 */}
      <Modal
        title="供应商管理"
        open={providerModalOpen}
        onCancel={() => setProviderModalOpen(false)}
        footer={null}
        width={980}
      >
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddProvider}>
            添加供应商
          </Button>
        </div>
        <Spin spinning={providerLoading}>
          <Table<AdminProviderItem>
            rowKey="id"
            columns={providerColumns}
            dataSource={providers}
            pagination={false}
            size="middle"
            scroll={{ x: 980 }}
            locale={{ emptyText: <Empty description="暂无供应商" /> }}
          />
        </Spin>
      </Modal>

      {/* 编辑供应商 */}
      <Modal
        title={editProvider ? `编辑供应商 - ${editProvider.name}` : '编辑供应商'}
        open={Boolean(editProvider)}
        onCancel={() => setEditProvider(null)}
        onOk={handleSaveProvider}
        confirmLoading={providerSaving}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input placeholder="https://api.xxx.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={editProvider ? `当前: ${editProvider.apiKeyMasked || '未设置'}(留空不修改)` : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'active' },
                { label: '停用', value: 'disabled' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加供应商/读取模型导入向导 */}
      <ProviderImportModal
        open={importOpen}
        existingProvider={importProvider}
        onClose={() => {
          setImportOpen(false)
          setImportProvider(null)
        }}
        onRefresh={() => {
          void loadList()
          void loadProviderList()
        }}
      />
    </div>
  )
}
