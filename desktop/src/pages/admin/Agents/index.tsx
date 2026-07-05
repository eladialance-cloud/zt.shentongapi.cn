// 官方 Agent 管理页 - SubTask 20.1 + 20.3
//
// Tab:已发布(published)/已下架(unpublished)
// 表格:ID/名称/分类/状态/价格/调用次数/创建时间/操作
// 新增/编辑模态框(含动态 usageExamples 数组、定价配置)
// 操作:编辑/上架/下架/删除
// GitHub 仓库异步导入(modal 输入 repoUrl,轮询任务状态)
// API: GET/POST/PATCH/DELETE /admin/agents, publish/unpublish, import-github

import { useCallback, useEffect, useRef, useState } from 'react'
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
  DeleteOutlined,
  EditOutlined,
  GithubOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined
} from '@ant-design/icons'
import {
  createAdminAgent,
  deleteAdminAgent,
  getImportGithubTask,
  importGithubAgent,
  listAdminAgents,
  publishAdminAgent,
  unpublishAdminAgent,
  updateAdminAgent
} from '@/api/admin-agent-api'
import type {
  AdminAgentItem,
  AgentCategory,
  AgentPricingMode,
  AgentStatus,
  CreateAdminAgentDto,
  ImportGithubTask,
  UpdateAdminAgentDto
} from '@/types/admin-agent'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const CATEGORY_OPTIONS: Array<{ label: string; value: AgentCategory }> = [
  { label: '办公', value: 'office' },
  { label: '编程', value: 'programming' },
  { label: '文案', value: 'copywriting' },
  { label: '数据分析', value: 'data_analysis' },
  { label: '其他', value: 'other' }
]

const CATEGORY_LABEL: Record<AgentCategory, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他'
}

const STATUS_TAG: Record<AgentStatus, { color: string; text: string }> = {
  published: { color: 'green', text: '已发布' },
  unpublished: { color: 'default', text: '已下架' },
  pending_review: { color: 'orange', text: '待审核' },
  rejected: { color: 'red', text: '已驳回' }
}

const PRICING_MODE_OPTIONS: Array<{ label: string; value: AgentPricingMode }> = [
  { label: '按次计费', value: 'perCall' },
  { label: '按 Token 计费', value: 'perToken' }
]

interface AgentFormValues {
  name: string
  displayName?: string
  description: string
  systemPrompt?: string
  category: AgentCategory
  usageExamples?: string[]
  modelId?: string
  modelConfig?: string
  apiKey?: string
  pricingMode: AgentPricingMode
  pricePerCall: number
  pricePerTokenInput: number
  pricePerTokenOutput: number
}

interface ImportFormValues {
  repoUrl: string
}

export default function AdminAgents() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminAgentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<AgentStatus>('published')

  // 新增/编辑
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminAgentItem | null>(null)
  const [form] = Form.useForm<AgentFormValues>()
  const [saving, setSaving] = useState(false)

  // GitHub 导入
  const [importOpen, setImportOpen] = useState(false)
  const [importForm] = Form.useForm<ImportFormValues>()
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importTask, setImportTask] = useState<ImportGithubTask | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      const result = await listAdminAgents(query)
      const r = result as AdminPaginatedResult<AdminAgentItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminAgents] load failed:', err)
      message.error('加载 Agent 列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab])

  useEffect(() => {
    void loadList()
  }, [loadList])

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [])

  const handleTabChange = (key: string) => {
    setActiveTab(key as AgentStatus)
    setPage(1)
  }

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      category: 'office',
      pricingMode: 'perCall',
      pricePerCall: 0,
      pricePerTokenInput: 0,
      pricePerTokenOutput: 0,
      usageExamples: []
    })
    setEditOpen(true)
  }

  const handleEdit = (item: AdminAgentItem) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      systemPrompt: item.systemPrompt,
      category: item.category,
      usageExamples: item.usageExamples || [],
      modelId: item.modelId,
      modelConfig: item.modelConfig ? JSON.stringify(item.modelConfig, null, 2) : '',
      apiKey: '',
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
      // 校验 modelConfig JSON
      let modelConfigParsed: Record<string, unknown> | undefined
      if (values.modelConfig && values.modelConfig.trim()) {
        try {
          modelConfigParsed = JSON.parse(values.modelConfig) as Record<string, unknown>
        } catch {
          message.error('模型配置 JSON 格式错误')
          return
        }
      }
      setSaving(true)
      const usageExamples = (values.usageExamples || []).filter((s) => s && s.trim())
      if (editing) {
        const dto: UpdateAdminAgentDto = {
          name: values.name,
          displayName: values.displayName,
          description: values.description,
          systemPrompt: values.systemPrompt,
          category: values.category,
          usageExamples,
          modelId: values.modelId,
          modelConfig: modelConfigParsed,
          pricingMode: values.pricingMode,
          pricePerCall: values.pricePerCall,
          pricePerTokenInput: values.pricePerTokenInput,
          pricePerTokenOutput: values.pricePerTokenOutput
        }
        if (values.apiKey && values.apiKey.trim()) {
          dto.apiKey = values.apiKey
        }
        await updateAdminAgent(editing.id, dto)
        message.success('Agent 已更新')
      } else {
        const dto: CreateAdminAgentDto = {
          name: values.name,
          displayName: values.displayName,
          description: values.description,
          systemPrompt: values.systemPrompt,
          category: values.category,
          usageExamples,
          modelId: values.modelId,
          modelConfig: modelConfigParsed,
          apiKey: values.apiKey,
          pricingMode: values.pricingMode,
          pricePerCall: values.pricePerCall,
          pricePerTokenInput: values.pricePerTokenInput,
          pricePerTokenOutput: values.pricePerTokenOutput
        }
        await createAdminAgent(dto)
        message.success('Agent 已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminAgents] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (item: AdminAgentItem) => {
    try {
      await publishAdminAgent(item.id)
      message.success('已上架')
      setItems((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'published' } : a))
      )
    } catch (err) {
      console.error('[AdminAgents] publish failed:', err)
      message.error('上架失败')
    }
  }

  const handleUnpublish = async (item: AdminAgentItem) => {
    try {
      await unpublishAdminAgent(item.id)
      message.success('已下架')
      setItems((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'unpublished' } : a))
      )
    } catch (err) {
      console.error('[AdminAgents] unpublish failed:', err)
      message.error('下架失败')
    }
  }

  const handleDelete = async (item: AdminAgentItem) => {
    try {
      await deleteAdminAgent(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((a) => a.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminAgents] delete failed:', err)
      message.error('删除失败')
    }
  }

  const stopPolling = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }

  const pollImportTask = (taskId: string) => {
    stopPolling()
    const poll = async () => {
      try {
        const task = await getImportGithubTask(taskId)
        setImportTask(task)
        if (task.status === 'success' || task.status === 'failed') {
          stopPolling()
          if (task.status === 'success') {
            message.success('GitHub Agent 导入成功')
            void loadList()
          } else {
            message.error(`导入失败: ${task.errorMessage || '未知错误'}`)
          }
          return
        }
        pollTimer.current = setTimeout(() => void poll(), 2000)
      } catch (err) {
        console.error('[AdminAgents] poll failed:', err)
        stopPolling()
        message.error('查询导入任务状态失败')
      }
    }
    void poll()
  }

  const handleImportSubmit = async () => {
    try {
      const values = await importForm.validateFields()
      setImportSubmitting(true)
      setImportTask(null)
      const res = await importGithubAgent({ repoUrl: values.repoUrl })
      message.success('已提交导入任务')
      pollImportTask(res.taskId)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminAgents] import failed:', err)
      message.error('提交导入任务失败')
    } finally {
      setImportSubmitting(false)
    }
  }

  const handleCloseImport = () => {
    stopPolling()
    setImportOpen(false)
    setImportTask(null)
    importForm.resetFields()
  }

  const columns: TableColumnsType<AdminAgentItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
          {v}
          {record.displayName ? (
            <span style={{ color: '#8b949e', marginLeft: 6, fontSize: 12 }}>
              ({record.displayName})
            </span>
          ) : null}
        </span>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: AgentCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: AgentStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '定价',
      key: 'pricing',
      width: 180,
      render: (_: unknown, record: AdminAgentItem) =>
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
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: AdminAgentItem) => (
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
            title="确认删除该 Agent?"
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
          <RobotOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 市场管理</h1>
            <div className={styles.subtitle}>官方 Agent 发布 / 编辑 / 上下架</div>
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
            icon={<GithubOutlined />}
            onClick={() => setImportOpen(true)}
            className={styles.ghostBtn}
          >
            GitHub 导入
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            className={styles.primaryBtn}
          >
            新增 Agent
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

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无 Agent" style={{ marginTop: 80 }} />
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

      {/* 新增/编辑 Modal */}
      <Modal
        title={editing ? `编辑 Agent - ${editing.name}` : '新增 Agent'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={720}
      >
        <Form<AgentFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:code-helper" maxLength={64} />
          </Form.Item>
          <Form.Item name="displayName" label="显示名">
            <Input placeholder="如:代码助手" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="systemPrompt" label="系统提示词">
            <Input.TextArea rows={4} placeholder="System Prompt" />
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#e6edf3' }}>使用示例</label>
            <Form.List name="usageExamples">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <div className={styles.usageExampleRow} key={field.key}>
                      <Form.Item {...field} noStyle>
                        <Input placeholder="示例:帮我写一个排序算法" style={{ flex: 1 }} />
                      </Form.Item>
                      <Button type="link" danger onClick={() => remove(field.name)}>
                        删除
                      </Button>
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add('')} icon={<PlusOutlined />} block>
                    添加示例
                  </Button>
                </>
              )}
            </Form.List>
          </div>
          <Form.Item name="modelId" label="绑定模型 ID">
            <Input placeholder="如:gpt-4o" />
          </Form.Item>
          <Form.Item name="modelConfig" label="模型配置(JSON)">
            <Input.TextArea
              rows={4}
              placeholder='{"temperature":0.7,"maxTokens":2048}'
              className={styles.modelConfigTextarea}
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key(AES 加密存储,可选)"
            extra={editing ? '留空表示不修改' : undefined}
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
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

      {/* GitHub 导入 Modal */}
      <Modal
        title="GitHub 仓库异步导入"
        open={importOpen}
        onCancel={handleCloseImport}
        onOk={handleImportSubmit}
        confirmLoading={importSubmitting}
        okText="提交导入"
        cancelText="关闭"
        destroyOnClose
      >
        <Form<ImportFormValues> form={importForm} layout="vertical">
          <Form.Item
            name="repoUrl"
            label="GitHub 仓库 URL"
            rules={[
              { required: true, message: '请输入仓库 URL' },
              {
                pattern: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/,
                message: '请输入合法的 GitHub 仓库 URL'
              }
            ]}
          >
            <Input placeholder="https://github.com/owner/repo" />
          </Form.Item>
        </Form>
        {importTask ? (
          <div className={styles.importProgress}>
            <div style={{ marginBottom: 8, color: '#c7d2fe' }}>
              任务 ID: <code>{importTask.taskId}</code>
            </div>
            <div style={{ color: '#94a3b8' }}>
              状态:
              <Tag
                color={
                  importTask.status === 'success'
                    ? 'green'
                    : importTask.status === 'failed'
                      ? 'red'
                      : 'processing'
                }
                style={{ marginLeft: 8 }}
              >
                {importTask.status}
              </Tag>
              {importTask.progress != null ? `${importTask.progress}%` : ''}
            </div>
            {importTask.errorMessage ? (
              <div style={{ color: '#f87171', marginTop: 8 }}>
                {importTask.errorMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
