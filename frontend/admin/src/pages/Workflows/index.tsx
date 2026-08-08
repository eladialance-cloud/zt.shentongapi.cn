// 工作流模板管理页（合并版）
//
// Tab: 草稿 / 待审核 / 已通过 / 已发布 / 已驳回
// 操作: 审核(通过/驳回) / 编辑 / 删除 / 发布/下架 / 定价
// 功能: GitHub 批量导入 + 关键词搜索 + 分类/引擎筛选

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
  Switch,
  Upload,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  GithubOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  approveWorkflow,
  batchDeleteAdminWorkflows,
  importLocalWorkflows,
  createAdminWorkflow,
  deleteAdminWorkflow,
  importGithubWorkflow,
  listAdminWorkflows,
  rejectWorkflow,
  updateAdminWorkflow,
} from '@/api/admin-workflow-api'
import type {
  AdminWorkflowItem,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
  WorkflowEngineType,
  WorkflowPublishStatus,
} from '@/types/admin-workflow'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const ENGINE_OPTIONS: Array<{ label: string; value: WorkflowEngineType }> = [
  { label: 'n8n', value: 'n8n' },
  { label: 'Coze', value: 'coze' },
]

const CATEGORY_OPTIONS = [
  { label: '自动化', value: 'automation' },
  { label: '集成', value: 'integration' },
  { label: '数据处理', value: 'data_processing' },
  { label: 'AI 协作', value: 'ai_collaboration' },
  { label: '独立', value: 'independent' },
  { label: '其他', value: 'other' },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

const TABS: Array<{ key: WorkflowPublishStatus; label: string }> = [
  { key: 'draft', label: '草稿' },
  { key: 'pending_review', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'published', label: '已发布' },
  { key: 'rejected', label: '已驳回' },
]

const STATUS_TAG: Record<WorkflowPublishStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  pending_review: { color: 'orange', text: '待审核' },
  approved: { color: 'blue', text: '已通过' },
  published: { color: 'green', text: '已发布' },
  rejected: { color: 'red', text: '已驳回' },
}

interface WorkflowFormValues {
  name: string
  description: string
  engineType: WorkflowEngineType
  n8nWorkflowId?: string
  cozeWorkflowId?: string
  category: string
  inputSchema?: string
  outputSchema?: string
  pricePerExecution: number
  isActive: boolean
  triggerType?: string
  nodeCount?: number
  tags?: string[]
}

export default function AdminWorkflows() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminWorkflowItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState<WorkflowPublishStatus>('draft')

  // 筛选
  const [keyword, setKeyword] = useState('')
  const [engineFilter, setEngineFilter] = useState<WorkflowEngineType | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<string | ''>('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // 新增/编辑
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminWorkflowItem | null>(null)
  const [form] = Form.useForm<WorkflowFormValues>()
  const [saving, setSaving] = useState(false)

  // 驳回
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<AdminWorkflowItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // 本地上传 / 批量删除
  const [uploading, setUploading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // GitHub 导入
  const [importOpen, setImportOpen] = useState(false)
  const [importRepoUrl, setImportRepoUrl] = useState('')
  const [importCategory, setImportCategory] = useState('')
  const [importing, setImporting] = useState(false)

  // 详情
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<AdminWorkflowItem | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = {
        page,
        pageSize: PAGE_SIZE,
        publishStatus: activeTab,
      }
      if (keyword.trim()) query.keyword = keyword.trim()
      if (engineFilter) query.engineType = engineFilter
      if (categoryFilter) query.category = categoryFilter
      const result = await listAdminWorkflows(query)
      const r = result as AdminPaginatedResult<AdminWorkflowItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[Workflows] load failed:', err)
      message.error('加载工作流列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, keyword, engineFilter, categoryFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setActiveTab(key as WorkflowPublishStatus)
    setPage(1)
  }

  const handleSearchChange = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setPage(1), 400)
  }

  // ── 新增/编辑 ──────────────────────────────────────────

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      engineType: 'n8n',
      category: 'automation',
      pricePerExecution: 0,
      isActive: false,
      nodeCount: 0,
    })
    setEditOpen(true)
  }

  const handleEdit = (item: AdminWorkflowItem) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      description: item.description,
      engineType: item.engineType,
      n8nWorkflowId: item.n8nWorkflowId,
      cozeWorkflowId: item.cozeWorkflowId,
      category: item.category,
      inputSchema: item.inputSchema ? JSON.stringify(item.inputSchema, null, 2) : '',
      outputSchema: item.outputSchema ? JSON.stringify(item.outputSchema, null, 2) : '',
      pricePerExecution: item.pricePerExecution,
      isActive: item.isActive,
      triggerType: item.triggerType,
      nodeCount: item.nodeCount,
      tags: item.tags,
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      let inputSchemaParsed: Record<string, unknown> | undefined
      let outputSchemaParsed: Record<string, unknown> | undefined
      if (values.inputSchema?.trim()) {
        try { inputSchemaParsed = JSON.parse(values.inputSchema) } catch {
          message.error('输入 Schema JSON 格式错误'); return
        }
      }
      if (values.outputSchema?.trim()) {
        try { outputSchemaParsed = JSON.parse(values.outputSchema) } catch {
          message.error('输出 Schema JSON 格式错误'); return
        }
      }
      setSaving(true)
      if (editing) {
        const dto: UpdateAdminWorkflowDto = {
          name: values.name,
          description: values.description,
          engineType: values.engineType,
          n8nWorkflowId: values.engineType === 'n8n' ? values.n8nWorkflowId : undefined,
          cozeWorkflowId: values.engineType === 'coze' ? values.cozeWorkflowId : undefined,
          category: values.category,
          inputSchema: inputSchemaParsed,
          outputSchema: outputSchemaParsed,
          pricePerExecution: values.pricePerExecution,
          isActive: values.isActive,
          triggerType: values.triggerType,
          nodeCount: values.nodeCount,
          tags: values.tags,
        }
        await updateAdminWorkflow(editing.id, dto)
        message.success('已更新')
      } else {
        const dto: CreateAdminWorkflowDto = {
          ...values,
          inputSchema: inputSchemaParsed,
          outputSchema: outputSchemaParsed,
        }
        await createAdminWorkflow(dto)
        message.success('已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err: any) {
      if (err?.errorFields) return
      console.error('[Workflows] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleLocalUpload = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    try {
      const res = await importLocalWorkflows(files)
      message.success(res.message || `导入完成：成功 ${res.imported}，失败 ${res.failed}`)
      void loadList()
    } catch (err) {
      console.error('[AdminWorkflows] local upload failed:', err)
      message.error((err as { message?: string })?.message || '导入失败')
    } finally {
      setUploading(false)
    }
  }

  const handleBatchDelete = async () => {
    const ids = selectedRowKeys as number[]
    if (ids.length === 0) return
    try {
      const res = await batchDeleteAdminWorkflows(ids)
      if (res.failed > 0) {
        message.warning(`删除完成：成功 ${res.deleted}，失败 ${res.failed}`)
      } else {
        message.success(`已删除 ${res.deleted} 个工作流`)
      }
      setSelectedRowKeys([])
      void loadList()
    } catch (err) {
      console.error('[AdminWorkflows] batch delete failed:', err)
      message.error('批量删除失败')
    }
  }

  const handleDelete = async (item: AdminWorkflowItem) => {
    try {
      await deleteAdminWorkflow(item.id)
      message.success('已删除')
      void loadList()
    } catch (err) {
      console.error('[Workflows] delete failed:', err)
      message.error('删除失败')
    }
  }

  // ── 审核 ──────────────────────────────────────────────

  const handleApprove = async (item: AdminWorkflowItem) => {
    try {
      await approveWorkflow(item.id)
      message.success('已通过审核')
      void loadList()
    } catch (err) {
      console.error('[Workflows] approve failed:', err)
      message.error('操作失败')
    }
  }

  const handleRejectClick = (item: AdminWorkflowItem) => {
    setRejectTarget(item)
    setRejectReason('')
    setRejectOpen(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) { message.warning('请填写驳回原因'); return }
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await rejectWorkflow(rejectTarget.id, { reason: rejectReason.trim() })
      message.success('已驳回')
      setRejectOpen(false)
      void loadList()
    } catch (err) {
      console.error('[Workflows] reject failed:', err)
      message.error('操作失败')
    } finally {
      setRejecting(false)
    }
  }

  // ── 发布/下架 ─────────────────────────────────────────

  const handlePublish = async (item: AdminWorkflowItem) => {
    try {
      await updateAdminWorkflow(item.id, {
        isActive: true,
        isPublished: true,
        publishStatus: 'published',
      })
      message.success('已发布')
      void loadList()
    } catch (err) {
      console.error('[Workflows] publish failed:', err)
      message.error('操作失败')
    }
  }

  const handleUnpublish = async (item: AdminWorkflowItem) => {
    try {
      await updateAdminWorkflow(item.id, {
        isActive: false,
        isPublished: false,
        publishStatus: 'draft',
      })
      message.success('已下架')
      void loadList()
    } catch (err) {
      console.error('[Workflows] unpublish failed:', err)
      message.error('操作失败')
    }
  }

  // ── GitHub 导入 ──────────────────────────────────────

  const handleImport = async () => {
    if (!importRepoUrl.trim()) { message.warning('请输入 GitHub 仓库 URL'); return }
    setImporting(true)
    try {
      const result = await importGithubWorkflow({
        repoUrl: importRepoUrl.trim(),
        category: importCategory || undefined,
      })
      message.success(`成功导入 ${result.imported} 个工作流`)
      setImportOpen(false)
      setImportRepoUrl('')
      void loadList()
    } catch (err: any) {
      console.error('[Workflows] import failed:', err)
      message.error(err?.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // ── 详情 ──────────────────────────────────────────────

  const handleDetail = (item: AdminWorkflowItem) => {
    setDetailItem(item)
    setDetailOpen(true)
  }

  // ── 表格列 ────────────────────────────────────────────

  const commonColumns: TableColumnsType<AdminWorkflowItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      ),
    },
    {
      title: '引擎',
      dataIndex: 'engineType',
      key: 'engineType',
      width: 80,
      render: (e: WorkflowEngineType) => (
        <Tag color={e === 'n8n' ? 'purple' : 'magenta'}>{e === 'n8n' ? 'n8n' : 'Coze'}</Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (c: string) => <Tag color="blue">{CATEGORY_LABEL[c] || c}</Tag>,
    },
    {
      title: '触发',
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 90,
      render: (t: string | undefined) =>
        t ? <Tag color="cyan">{t}</Tag> : <span style={{ color: '#8b949e' }}>-</span>,
    },
    {
      title: '节点',
      dataIndex: 'nodeCount',
      key: 'nodeCount',
      width: 65,
      render: (v: number | undefined) =>
        v ? <span style={{ color: '#c7d2fe' }}>{v}</span> : <span style={{ color: '#8b949e' }}>-</span>,
    },
    {
      title: '积分/次',
      dataIndex: 'pricePerExecution',
      key: 'pricePerExecution',
      width: 85,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>,
    },
    {
      title: '状态',
      dataIndex: 'publishStatus',
      key: 'publishStatus',
      width: 80,
      render: (s: WorkflowPublishStatus | undefined) => {
        const t = s ? STATUS_TAG[s] : STATUS_TAG.draft
        return <Tag color={t.color}>{t.text}</Tag>
      },
    },
    {
      title: '执行',
      dataIndex: 'executionCount',
      key: 'executionCount',
      width: 75,
      render: (v: number) => <span style={{ color: '#c7d2fe' }}>{v.toLocaleString()}</span>,
    },
    {
      title: '来源',
      dataIndex: 'sourceRepo',
      key: 'sourceRepo',
      width: 100,
      render: (v: string | undefined) =>
        v ? (
          <Tag color="geekblue" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            GitHub
          </Tag>
        ) : (
          <span style={{ color: '#8b949e', fontSize: 12 }}>手动</span>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (t: string) => <span style={{ color: '#8b949e', fontSize: 12 }}>{t}</span>,
    },
  ]

  const actionColumn: TableColumnsType<AdminWorkflowItem>[0] = {
    title: '操作',
    key: 'action',
    width: 260,
    fixed: 'right',
    render: (_: unknown, record: AdminWorkflowItem) => {
      const isPending = record.publishStatus === 'pending_review'
      const isRejected = record.publishStatus === 'rejected'
      const isDraft = record.publishStatus === 'draft' || !record.publishStatus
      const isApproved = record.publishStatus === 'approved'

      // 待审核 → 通过 / 驳回 / 编辑 / 删除
      if (isPending) {
        return (
          <>
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
              通过
            </Button>
            <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => handleRejectClick(record)}>
              驳回
            </Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okButtonProps={{ danger: true }}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </>
        )
      }

      // 已驳回 → 编辑 / 删除
      if (isRejected) {
        return (
          <>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okButtonProps={{ danger: true }}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </>
        )
      }

      // 草稿 → 编辑 / 提交审核 / 删除
      if (isDraft) {
        return (
          <>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<ApartmentOutlined />}
              onClick={async () => {
                await updateAdminWorkflow(record.id, { publishStatus: 'pending_review' })
                message.success('已提交审核'); void loadList()
              }}
            >
              提交
            </Button>
            <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okButtonProps={{ danger: true }}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </>
        )
      }

      // 已通过 → 发布 / 下架 / 编辑
      if (isApproved) {
        return (
          <>
            <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => handlePublish(record)}>
              发布
            </Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
            <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record)} okButtonProps={{ danger: true }}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </>
        )
      }

      // 已发布 → 下架 / 编辑
      return (
        <>
          <Button type="link" size="small" icon={<StopOutlined />} onClick={() => handleUnpublish(record)}>
            下架
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
        </>
      )
    },
  }

  const columns: TableColumnsType<AdminWorkflowItem> = (() => {
    const cols = [...commonColumns]
    // 待审核/已驳回 Tab 加驳回原因列
    if (activeTab === 'pending_review' || activeTab === 'rejected') {
      cols.splice(-2, 0, {
        title: activeTab === 'rejected' ? '驳回原因' : '更新说明',
        dataIndex: 'rejectReason',
        key: 'rejectReason',
        width: 180,
        render: (v: string | undefined) =>
          v ? (
            <span style={{ color: '#f87171', fontSize: 12 }}>{v}</span>
          ) : null,
      })
    }
    cols.push(actionColumn)
    return cols
  })()

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>工作流模板管理</h1>
            <div className={styles.subtitle}>
              GitHub 导入 · 审核 · 定价 · 发布管理
            </div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Input.Search
            placeholder="搜索名称/描述"
            allowClear
            value={keyword}
            onChange={(e) => handleSearchChange(e.target.value)}
            onSearch={() => { setPage(1); void loadList() }}
            style={{ width: 220, marginRight: 8 }}
            prefix={<SearchOutlined />}
          />
          <Button icon={<ReloadOutlined />} onClick={loadList} className={styles.ghostBtn}>
            刷新
          </Button>
          <Button icon={<GithubOutlined />} onClick={() => setImportOpen(true)} className={styles.ghostBtn}>
            GitHub 导入
          </Button>
          <Upload
            accept=".json,.zip"
            multiple
            showUploadList={false}
            beforeUpload={(_file, fileList) => { void handleLocalUpload(fileList as unknown as File[]); return false }}
          >
            <Button icon={<UploadOutlined />} loading={uploading} className={styles.ghostBtn}>
              本地上传
            </Button>
          </Upload>
          <Popconfirm
            title={`确认删除选中的 ${selectedRowKeys.length} 个工作流?`}
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
            新增
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="引擎类型"
            value={engineFilter}
            onChange={(v) => { setEngineFilter(v as WorkflowEngineType | ''); setPage(1) }}
            className={styles.filterSelect}
            allowClear
            options={ENGINE_OPTIONS}
            style={{ width: 120 }}
          />
          <Select
            placeholder="分类"
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v as string | ''); setPage(1) }}
            className={styles.filterSelect}
            allowClear
            options={CATEGORY_OPTIONS}
            style={{ width: 130, marginLeft: 8 }}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={TABS.map((t) => ({ key: t.key, label: t.label }))}
        style={{ marginTop: 0 }}
      />

      {/* Table */}
      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无工作流" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminWorkflowItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              pagination={false}
              size="middle"
              scroll={{ x: 1400 }}
              onRow={(record) => ({
                onDoubleClick: () => handleDetail(record),
                style: { cursor: 'pointer' },
              })}
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
        title={editing ? `编辑 - ${editing.name}` : '新增工作流'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={720}
      >
        <Form<WorkflowFormValues> form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如:邮件自动回复" maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true }]}>
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="engineType" label="引擎类型" rules={[{ required: true }]}>
            <Select
              options={ENGINE_OPTIONS}
              onChange={(v: WorkflowEngineType) => {
                v === 'n8n' ? form.setFieldValue('cozeWorkflowId', undefined) : form.setFieldValue('n8nWorkflowId', undefined)
              }}
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) =>
              getFieldValue('engineType') === 'n8n' ? (
                <Form.Item name="n8nWorkflowId" label="n8n 工作流 ID">
                  <Input placeholder="如:workflow-abc" />
                </Form.Item>
              ) : (
                <Form.Item name="cozeWorkflowId" label="Coze 工作流 ID">
                  <Input placeholder="如:coze-flow-456" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="triggerType" label="触发类型">
            <Input placeholder="如:webhook / schedule / manual" />
          </Form.Item>
          <Form.Item name="nodeCount" label="节点数">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="inputSchema" label="输入 Schema(JSON)">
            <Input.TextArea rows={3} placeholder='{"type":"object","properties":{}}' className={styles.schemaTextarea} />
          </Form.Item>
          <Form.Item name="outputSchema" label="输出 Schema(JSON)">
            <Input.TextArea rows={3} placeholder='{"type":"object","properties":{}}' className={styles.schemaTextarea} />
          </Form.Item>
          <Form.Item name="pricePerExecution" label="积分/次" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回 Modal */}
      <Modal
        title="驳回审核"
        open={rejectOpen}
        onOk={handleRejectConfirm}
        onCancel={() => setRejectOpen(false)}
        confirmLoading={rejecting}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 8, color: '#e6edf3' }}>
          {rejectTarget ? `工作流: ${rejectTarget.name}` : ''}
        </div>
        <Input.TextArea
          rows={3}
          placeholder="请填写驳回原因..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      {/* GitHub 导入 Modal */}
      <Modal
        title="GitHub 导入工作流"
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); setImportRepoUrl('') }}
        confirmLoading={importing}
        okText="开始导入"
        cancelText="取消"
        width={520}
      >
        <Form layout="vertical">
          <Form.Item label="GitHub 仓库 URL" required extra={
            <span style={{ color: '#8b949e', fontSize: 12 }}>
              支持 n8n-workflows 结构（如 Zie619/n8n-workflows）及其他含 .json 工作流的仓库
            </span>
          }>
            <Input
              placeholder="https://github.com/Zie619/n8n-workflows"
              value={importRepoUrl}
              onChange={(e) => setImportRepoUrl(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="指定文件路径（可选）" extra="留空则自动扫描 workflows/ 下全部 .json">
            <Input
              placeholder="如:workflows/OpenAI/openai_chat.json"
              onChange={() => setImportRepoUrl((prev) => prev)}
            />
          </Form.Item>
          <Form.Item label="导入分类（可选）" extra="n8n-workflows 仓库会自动用目录名作为分类">
            <Select
              placeholder="自动识别"
              allowClear
              value={importCategory}
              onChange={(v) => setImportCategory(v || '')}
              options={CATEGORY_OPTIONS}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情 Modal */}
      <Modal
        title={detailItem ? `详情 - ${detailItem.name}` : '工作流详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={640}
      >
        {detailItem && (
          <div style={{ color: '#c9d1d9', fontSize: 13, lineHeight: 1.8 }}>
            <p><b>名称:</b> {detailItem.name}</p>
            <p><b>描述:</b> {detailItem.description || '-'}</p>
            <p><b>引擎:</b> {detailItem.engineType}</p>
            <p><b>分类:</b> {CATEGORY_LABEL[detailItem.category] || detailItem.category}</p>
            <p><b>触发类型:</b> {detailItem.triggerType || '-'}</p>
            <p><b>节点数:</b> {detailItem.nodeCount || '-'}</p>
            <p><b>积分/次:</b> {detailItem.pricePerExecution}</p>
            <p><b>执行次数:</b> {detailItem.executionCount.toLocaleString()}</p>
            <p><b>来源:</b> {detailItem.sourceRepo ? (
              <span>{detailItem.sourceRepo} → {detailItem.sourcePath}</span>
            ) : '手动创建'}</p>
            <p><b>状态:</b> {detailItem.publishStatus ? STATUS_TAG[detailItem.publishStatus]?.text : '未知'}</p>
            {detailItem.tags && detailItem.tags.length > 0 && (
              <p><b>Tags:</b> {detailItem.tags.map((t) => <Tag key={t} color="default">{t}</Tag>)}</p>
            )}
            {detailItem.workflowJson && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', color: '#58a6ff' }}>n8n JSON (点击展开)</summary>
                <pre style={{
                  background: '#0d1117',
                  color: '#c9d1d9',
                  padding: 12,
                  borderRadius: 4,
                  maxHeight: 300,
                  overflow: 'auto',
                  fontSize: 11,
                  marginTop: 8,
                }}>
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(detailItem.workflowJson!), null, 2)
                    } catch {
                      return detailItem.workflowJson
                    }
                  })()}
                </pre>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
