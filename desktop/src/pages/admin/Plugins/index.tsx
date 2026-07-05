// 官方插件管理页 - SubTask 22.1 + 22.3
//
// 表格:ID/名称/类型(tool/connector/knowledge_base/workflow)/版本/状态/价格/调用次数/操作
// 新增/编辑模态框(含 sandboxConfig、定价配置)
// 操作:编辑/上架/下架/删除
// API: GET/POST/PATCH/DELETE /admin/plugins, publish/unpublish

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
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApiOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  createAdminPlugin,
  deleteAdminPlugin,
  listAdminPlugins,
  publishAdminPlugin,
  unpublishAdminPlugin,
  updateAdminPlugin
} from '@/api/admin-plugin-api'
import type {
  AdminPluginItem,
  AdminPluginStatus,
  AdminPluginType,
  CreateAdminPluginDto,
  PluginPricingMode,
  SandboxConfig,
  UpdateAdminPluginDto
} from '@/types/admin-plugin'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_OPTIONS: Array<{ label: string; value: AdminPluginType }> = [
  { label: '工具 (Tool)', value: 'tool' },
  { label: '连接器 (Connector)', value: 'connector' },
  { label: '知识库 (Knowledge Base)', value: 'knowledge_base' },
  { label: '工作流 (Workflow)', value: 'workflow' }
]

const TYPE_LABEL: Record<AdminPluginType, string> = {
  tool: '工具',
  connector: '连接器',
  knowledge_base: '知识库',
  workflow: '工作流'
}

const TYPE_COLOR: Record<AdminPluginType, string> = {
  tool: 'blue',
  connector: 'cyan',
  knowledge_base: 'purple',
  workflow: 'magenta'
}

const PRICING_MODE_OPTIONS: Array<{ label: string; value: PluginPricingMode }> = [
  { label: '按次计费', value: 'perCall' },
  { label: '按 Token 计费', value: 'perToken' }
]

const STATUS_TAG: Record<AdminPluginStatus, { color: string; text: string }> = {
  published: { color: 'green', text: '已发布' },
  unpublished: { color: 'default', text: '已下架' }
}

interface PluginFormValues {
  name: string
  description: string
  type: AdminPluginType
  version: string
  entryPoint?: string
  memoryLimit: number
  timeout: number
  cpuLimit: number
  pricingMode: PluginPricingMode
  pricePerCall: number
  pricePerTokenInput: number
  pricePerTokenOutput: number
}

export default function AdminPlugins() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminPluginItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<AdminPluginStatus>('published')
  const [typeFilter, setTypeFilter] = useState<AdminPluginType | ''>('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPluginItem | null>(null)
  const [form] = Form.useForm<PluginFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      if (typeFilter) query.type = typeFilter
      const result = await listAdminPlugins(query)
      const r = result as AdminPaginatedResult<AdminPluginItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminPlugins] load failed:', err)
      message.error('加载插件列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, typeFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as AdminPluginStatus)
    setPage(1)
  }

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      type: 'tool',
      version: '1.0.0',
      memoryLimit: 256,
      timeout: 5000,
      cpuLimit: 50,
      pricingMode: 'perCall',
      pricePerCall: 0,
      pricePerTokenInput: 0,
      pricePerTokenOutput: 0
    })
    setEditOpen(true)
  }

  const handleEdit = (item: AdminPluginItem) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      description: item.description,
      type: item.type,
      version: item.version,
      entryPoint: item.entryPoint,
      memoryLimit: item.sandboxConfig?.memoryLimit ?? 256,
      timeout: item.sandboxConfig?.timeout ?? 5000,
      cpuLimit: item.sandboxConfig?.cpuLimit ?? 50,
      pricingMode: item.pricingMode,
      pricePerCall: item.pricePerCall,
      pricePerTokenInput: item.pricePerTokenInput,
      pricePerTokenOutput: item.pricePerTokenOutput
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const sandboxConfig: SandboxConfig = {
        memoryLimit: values.memoryLimit,
        timeout: values.timeout,
        cpuLimit: values.cpuLimit
      }
      const baseDto = {
        name: values.name,
        description: values.description,
        type: values.type,
        version: values.version,
        entryPoint: values.entryPoint,
        sandboxConfig,
        pricingMode: values.pricingMode,
        pricePerCall: values.pricePerCall,
        pricePerTokenInput: values.pricePerTokenInput,
        pricePerTokenOutput: values.pricePerTokenOutput
      }
      if (editing) {
        const dto: UpdateAdminPluginDto = baseDto
        await updateAdminPlugin(editing.id, dto)
        message.success('插件已更新')
      } else {
        const dto: CreateAdminPluginDto = baseDto
        await createAdminPlugin(dto)
        message.success('插件已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminPlugins] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (item: AdminPluginItem) => {
    try {
      await publishAdminPlugin(item.id)
      message.success('已上架')
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'published' } : p))
      )
    } catch (err) {
      console.error('[AdminPlugins] publish failed:', err)
      message.error('上架失败')
    }
  }

  const handleUnpublish = async (item: AdminPluginItem) => {
    try {
      await unpublishAdminPlugin(item.id)
      message.success('已下架')
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'unpublished' } : p))
      )
    } catch (err) {
      console.error('[AdminPlugins] unpublish failed:', err)
      message.error('下架失败')
    }
  }

  const handleDelete = async (item: AdminPluginItem) => {
    try {
      await deleteAdminPlugin(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((p) => p.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminPlugins] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<AdminPluginItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (t: AdminPluginType) => <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</Tag>
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 90,
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: AdminPluginStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '定价',
      key: 'pricing',
      width: 180,
      render: (_: unknown, record: AdminPluginItem) =>
        record.pricingMode === 'perCall' ? (
          <span style={{ color: '#7dd3fc' }}>{record.pricePerCall} 积分/次</span>
        ) : (
          <span style={{ color: '#7dd3fc', fontSize: 12 }}>
            入 {record.pricePerTokenInput} / 出 {record.pricePerTokenOutput}
          </span>
        )
    },
    {
      title: '调用次数',
      dataIndex: 'callCount',
      key: 'callCount',
      width: 100,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v.toLocaleString()}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: AdminPluginItem) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          {record.status === 'published' ? (
            <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => handleUnpublish(record)}>
              下架
            </Button>
          ) : (
            <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => handlePublish(record)}>
              上架
            </Button>
          )}
          <Popconfirm
            title="确认删除该插件?"
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
          <ApiOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>官方插件管理</h1>
            <div className={styles.subtitle}>插件发布 / 编辑 / 上下架</div>
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
            新增插件
          </Button>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'published', label: '已发布' },
          { key: 'unpublished', label: '已下架' }
        ]}
      />

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="类型筛选"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as AdminPluginType | '')}
            className={styles.filterSelect}
            allowClear
            options={TYPE_OPTIONS}
          />
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无插件" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminPluginItem>
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

      {/* 新增/编辑 Modal */}
      <Modal
        title={editing ? `编辑插件 - ${editing.name}` : '新增插件'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={720}
      >
        <Form<PluginFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:web-search" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="version"
            label="版本"
            rules={[{ required: true, message: '请输入版本' }]}
          >
            <Input placeholder="如:1.0.0" maxLength={32} />
          </Form.Item>
          <Form.Item name="entryPoint" label="入口">
            <Input placeholder="如:src/index.js" />
          </Form.Item>
          <div className={styles.sandboxRow}>
            <Form.Item
              name="memoryLimit"
              label="内存上限(MB)"
              className={styles.sandboxItem}
              rules={[{ required: true, message: '请输入' }]}
            >
              <InputNumber min={16} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="timeout"
              label="超时(ms)"
              className={styles.sandboxItem}
              rules={[{ required: true, message: '请输入' }]}
            >
              <InputNumber min={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="cpuLimit"
              label="CPU 限制(%)"
              className={styles.sandboxItem}
              rules={[{ required: true, message: '请输入' }]}
            >
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item
            name="pricingMode"
            label="定价模式"
            rules={[{ required: true, message: '请选择定价模式' }]}
          >
            <Select options={PRICING_MODE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="pricePerCall"
            label="每次调用价格(积分)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="pricePerTokenInput"
            label="输入 Token 单价(decimal)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="pricePerTokenOutput"
            label="输出 Token 单价(decimal)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
