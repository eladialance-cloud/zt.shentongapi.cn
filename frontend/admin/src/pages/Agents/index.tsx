// 官方 Agent 管理页 - 合并审核流
//
// Tab:已发布/已下架/待审核/已驳回（合并原独立审核页）
// 表格:ID/名称/分类/状态/价格/调用次数/创建时间/操作
// 待审核 Tab 内联审核操作（通过/驳回）
// 操作:编辑/上架/下架/删除/通过审核/驳回审核/强制下架
// 搜索:关键词搜索（名称/显示名/描述）

import { useCallback, useEffect, useState, useRef } from 'react'
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
  Tooltip,
  Upload,
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
  SearchOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckOutlined,
  CloseOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  createAdminAgent,
  batchDeleteAdminAgents,
  importAdminAgentLocal,
  deleteAdminAgent,
  listAdminAgents,
  publishAdminAgent,
  unpublishAdminAgent,
  updateAdminAgent,
  approveAgent,
  rejectAgent,
  forceUnpublishAgent
} from '@/api/admin-agent-api'
import type {
  AdminAgentItem,
  AgentCategory,
  AgentPricingMode,
  AgentStatus,
  CreateAdminAgentDto,
  UpdateAdminAgentDto
} from '@/types/admin-agent'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import ImportGithubModal from './ImportGithubModal'
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

const TABS: Array<{ key: AgentStatus; label: string }> = [
  { key: 'published', label: '已发布' },
  { key: 'pending_review', label: '待审核' },
  { key: 'rejected', label: '已驳回' },
  { key: 'unpublished', label: '已下架' },
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

export default function AdminAgents() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminAgentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<AgentStatus>('published')
  const [keyword, setKeyword] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // 新增/编辑
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminAgentItem | null>(null)
  const [form] = Form.useForm<AgentFormValues>()
  const [saving, setSaving] = useState(false)

  // 审核驳回
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<AdminAgentItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectKind, setRejectKind] = useState<'reject' | 'forceUnpublish'>('reject')
  const [rejecting, setRejecting] = useState(false)

  // 本地上传 / 批量删除
  const [uploading, setUploading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // GitHub 导入
  const [importOpen, setImportOpen] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE, status: activeTab }
      if (keyword.trim()) query.keyword = keyword.trim()
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
  }, [page, activeTab, keyword])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    // 切换 Tab 时清除搜索
    setKeyword('')
    setPage(1)
  }, [activeTab])

  const handleSearchChange = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
    }, 400)
  }

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
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] publish failed:', err)
      message.error('上架失败')
    }
  }

  const handleUnpublish = async (item: AdminAgentItem) => {
    try {
      await unpublishAdminAgent(item.id)
      message.success('已下架')
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] unpublish failed:', err)
      message.error('下架失败')
    }
  }

  const handleDelete = async (item: AdminAgentItem) => {
    try {
      await deleteAdminAgent(item.id)
      message.success('已删除')
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleLocalUpload = async (file: File) => {
    setUploading(true)
    try {
      const res = await importAdminAgentLocal(file)
      message.success(res.message || `导入完成：新增 ${res.inserted}，失败 ${res.failed}`)
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] local upload failed:', err)
      message.error((err as { message?: string })?.message || '导入失败')
    } finally {
      setUploading(false)
    }
  }

  const handleBatchDelete = async () => {
    const ids = selectedRowKeys as number[]
    if (ids.length === 0) return
    try {
      const res = await batchDeleteAdminAgents(ids)
      if (res.failed > 0) {
        message.warning(`删除完成：成功 ${res.deleted}，失败 ${res.failed}`)
      } else {
        message.success(`已删除 ${res.deleted} 个 Agent`)
      }
      setSelectedRowKeys([])
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] batch delete failed:', err)
      message.error('批量删除失败')
    }
  }

  const handleApprove = async (item: AdminAgentItem) => {
    try {
      await approveAgent(item.id)
      message.success('已通过审核')
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] approve failed:', err)
      message.error('审核通过失败')
    }
  }

  const handleRejectClick = (item: AdminAgentItem, kind: 'reject' | 'forceUnpublish') => {
    setRejectTarget(item)
    setRejectKind(kind)
    setRejectReason('')
    setRejectOpen(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      message.warning('请填写驳回原因')
      return
    }
    if (!rejectTarget) return
    setRejecting(true)
    try {
      if (rejectKind === 'forceUnpublish') {
        await forceUnpublishAgent(rejectTarget.id, { reason: rejectReason.trim() })
        message.success('已强制下架')
      } else {
        await rejectAgent(rejectTarget.id, { reason: rejectReason.trim() })
        message.success('已驳回')
      }
      setRejectOpen(false)
      void loadList()
    } catch (err) {
      console.error('[AdminAgents] reject failed:', err)
      message.error('操作失败')
    } finally {
      setRejecting(false)
    }
  }

  const commonColumns: TableColumnsType<AdminAgentItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
          {record.displayName || v}
          {record.displayName && record.displayName !== v ? (
            <span style={{ color: '#8b949e', marginLeft: 6, fontSize: 12 }}>
              ({v})
            </span>
          ) : null}
        </span>
      )
    },
    {
      title: '介绍',
      dataIndex: 'description',
      key: 'description',
      width: 280,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v || '-'} overlayStyle={{ maxWidth: 420 }}>
          <span style={{ color: '#cbd5e1' }}>{v || '-'}</span>
        </Tooltip>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (c: AgentCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: AgentStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '定价',
      key: 'pricing',
      width: 170,
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
      width: 90,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v.toLocaleString()}</span>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
  ]

  const actionColumn: TableColumnsType<AdminAgentItem>[0] = {
    title: '操作',
    key: 'action',
    width: 260,
    fixed: 'right',
    render: (_: unknown, record: AdminAgentItem) => {
      // 待审核 Tab：通过 / 驳回
      if (activeTab === 'pending_review') {
        return (
          <>
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
              通过
            </Button>
            <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => handleRejectClick(record, 'reject')}>
              驳回
            </Button>
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
      // 已驳回 Tab：重新提交（通过） / 删除
      if (activeTab === 'rejected') {
        return (
          <>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
              通过
            </Button>
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
      // 已下架 Tab：编辑 / 上架 / 删除
      if (activeTab === 'unpublished') {
        return (
          <>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => handlePublish(record)}>
              上架
            </Button>
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
      // 已发布 Tab：编辑 / 下架 / 强制下架
      return (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => handleUnpublish(record)}>
            下架
          </Button>
          <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleRejectClick(record, 'forceUnpublish')}>
            强制下架
          </Button>
        </>
      )
    }
  }

  const columns = activeTab === 'pending_review' || activeTab === 'rejected'
    ? [
        // 审核 Tab 加驳回原因列
        ...commonColumns,
        {
          title: activeTab === 'rejected' ? '驳回原因' : '提交说明',
          dataIndex: 'rejectReason',
          key: 'rejectReason',
          width: 200,
          render: (v: string | undefined) =>
            v ? <span style={{ color: '#f87171', fontSize: 12 }}>{v}</span> : <span style={{ color: '#8b949e' }}>-</span>
        },
        actionColumn,
      ]
    : [...commonColumns, actionColumn]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <RobotOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 市场管理</h1>
            <div className={styles.subtitle}>官方 Agent 发布 / 编辑 / 审核</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Input.Search
            placeholder="搜索名称/显示名/描述"
            allowClear
            value={keyword}
            onChange={(e) => handleSearchChange(e.target.value)}
            onSearch={() => { setPage(1); void loadList() }}
            style={{ width: 260, marginRight: 8 }}
            prefix={<SearchOutlined />}
          />
          <Button icon={<ReloadOutlined />} onClick={loadList} className={styles.ghostBtn}>
            刷新
          </Button>
          <Button icon={<GithubOutlined />} onClick={() => setImportOpen(true)} className={styles.ghostBtn}>
            GitHub 导入
          </Button>
          <Upload
            accept=".zip"
            showUploadList={false}
            beforeUpload={(file) => { void handleLocalUpload(file); return false }}
          >
            <Button icon={<UploadOutlined />} loading={uploading} className={styles.ghostBtn}>
              本地上传
            </Button>
          </Upload>
          <Popconfirm
            title={`确认删除选中的 ${selectedRowKeys.length} 个 Agent?`}
            onConfirm={() => void handleBatchDelete()}
            okText="删除"
            okButtonProps={{ danger: true }}
            disabled={selectedRowKeys.length === 0}
          >
            <Button danger icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} className={styles.ghostBtn}>
              批量删除
            </Button>
          </Popconfirm>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} className={styles.primaryBtn}>
            新增 Agent
          </Button>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={TABS.map((t) => ({ key: t.key, label: t.label }))}
        style={{ marginTop: 0 }}
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
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
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

      {/* 驳回 / 强制下架 理由 Modal */}
      <Modal
        title={rejectKind === 'forceUnpublish' ? '强制下架' : '驳回审核'}
        open={rejectOpen}
        onOk={handleRejectConfirm}
        onCancel={() => setRejectOpen(false)}
        confirmLoading={rejecting}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 8, color: '#e6edf3' }}>
          {rejectTarget ? `Agent: ${rejectTarget.name}` : ''}
        </div>
        <Input.TextArea
          rows={3}
          placeholder="请输入原因..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      {/* GitHub 导入 Modal */}
      <ImportGithubModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={loadList}
      />
    </div>
  )
}
