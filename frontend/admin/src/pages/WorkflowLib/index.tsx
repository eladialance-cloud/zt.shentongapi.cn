// 工作流模板库管理页
//
// 展示工作流模板列表，支持 GitHub 导入，查看执行日志和 MCP 绑定
// API: /admin/workflow-lib/*
// 列表端点: /admin/workflow-lib (n8n_workflow_lib 表)

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Spin,
  Switch,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  GithubOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { listWorkflowLib } from '@/api/admin-workflow-lib-api'
import {
  deleteWorkflowLib,
  getWorkflowExecLogs,
  getWorkflowLibDetail,
  getWorkflowMcpBinds,
  importGithubWorkflow,
  updateWorkflowLib
} from '@/api/admin-workflow-lib-api'
import type {
  N8nWorkflowLib,
  UpdateWorkflowLibDto,
  ImportGithubWorkflowDto,
  WorkflowExecLog,
  WorkflowExecStatus,
  WorkflowMcpBind,
  CreateMcpBindDto
} from '@/types/admin-workflow-lib'
import {
  createWorkflowMcpBind,
  deleteWorkflowMcpBind
} from '@/api/admin-workflow-lib-api'
import dayjs from 'dayjs'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const EXEC_STATUS_LABEL: Record<WorkflowExecStatus, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中'
}

const EXEC_STATUS_CLASS: Record<WorkflowExecStatus, string> = {
  success: styles.statusSuccess,
  failed: styles.statusFailed,
  running: styles.statusRunning
}

// ===== GitHub 导入 Modal =====

interface ImportFormValues {
  repoUrl: string
  filePath?: string
  category?: string
}

function ImportGithubModal({
  open,
  onClose,
  onSuccess
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [form] = Form.useForm<ImportFormValues>()
  const [saving, setSaving] = useState(false)

  const handleImport = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: ImportGithubWorkflowDto = {
        repoUrl: values.repoUrl,
        filePath: values.filePath || undefined,
        category: values.category || undefined
      }
      const result = await importGithubWorkflow(dto)
      message.success(`导入成功：${result.imported} 条工作流`)
      form.resetFields()
      onClose()
      onSuccess()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[WorkflowLib] import failed:', err)
      message.error('导入失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="从 GitHub 导入工作流"
      open={open}
      onCancel={onClose}
      onOk={handleImport}
      confirmLoading={saving}
      okText="导入"
      cancelText="取消"
      destroyOnClose
    >
      <Form<ImportFormValues> form={form} layout="vertical">
        <Form.Item
          name="repoUrl"
          label="仓库地址"
          rules={[{ required: true, message: '请输入 GitHub 仓库地址' }]}
        >
          <Input placeholder="https://github.com/user/repo" />
        </Form.Item>
        <Form.Item name="filePath" label="文件路径(可选)">
          <Input placeholder="如:workflows/email-reply.json，留空则扫描所有" />
        </Form.Item>
        <Form.Item name="category" label="分类(可选)">
          <Input placeholder="如:automation / integration / data_processing" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ===== 执行日志 Modal =====

function ExecLogsModal({
  workflowId,
  open,
  onClose
}: {
  workflowId: number | null
  open: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<WorkflowExecLog[]>([])

  const loadLogs = useCallback(async () => {
    if (!workflowId) return
    setLoading(true)
    try {
      const data = await getWorkflowExecLogs(workflowId)
      setLogs(data)
    } catch (err) {
      console.error('[WorkflowLib] exec logs failed:', err)
      message.error('加载执行日志失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (open && workflowId) {
      void loadLogs()
    }
  }, [open, workflowId, loadLogs])

  const logColumns: TableColumnsType<WorkflowExecLog> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '触发类型',
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: WorkflowExecStatus) => (
        <Tag className={EXEC_STATUS_CLASS[s]}>
          {EXEC_STATUS_LABEL[s]}
        </Tag>
      )
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 90,
      render: (d?: number) => (d != null ? `${d}ms` : '-')
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (v?: string) => (
        <span style={{ color: '#f87171', fontSize: 12 }}>{v || '-'}</span>
      )
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 160,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>
          {dayjs(t).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      )
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      width: 160,
      render: (t?: string) => (
        <span style={{ color: '#8b949e' }}>
          {t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'}
        </span>
      )
    }
  ]

  return (
    <Modal
      title="执行日志"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {logs.length === 0 && !loading ? (
          <Empty description="暂无执行日志" />
        ) : (
          <Table<WorkflowExecLog>
            rowKey="id"
            columns={logColumns}
            dataSource={logs}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="small"
            scroll={{ x: 800 }}
          />
        )}
      </Spin>
    </Modal>
  )
}

// ===== MCP 绑定 Modal =====

interface McpBindFormValues {
  mcpServerId: number
  toolName?: string
  config?: string
}

function McpBindsModal({
  workflowId,
  open,
  onClose
}: {
  workflowId: number | null
  open: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [binds, setBinds] = useState<WorkflowMcpBind[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [form] = Form.useForm<McpBindFormValues>()
  const [saving, setSaving] = useState(false)

  const loadBinds = useCallback(async () => {
    if (!workflowId) return
    setLoading(true)
    try {
      const data = await getWorkflowMcpBinds(workflowId)
      setBinds(data)
    } catch (err) {
      console.error('[WorkflowLib] mcp binds failed:', err)
      message.error('加载 MCP 绑定失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (open && workflowId) {
      void loadBinds()
    }
  }, [open, workflowId, loadBinds])

  const handleAddBind = async () => {
    try {
      const values = await form.validateFields()
      let configParsed: Record<string, unknown> | undefined
      if (values.config && values.config.trim()) {
        try {
          configParsed = JSON.parse(values.config) as Record<string, unknown>
        } catch {
          message.error('配置 JSON 格式错误')
          return
        }
      }
      setSaving(true)
      const dto: CreateMcpBindDto = {
        mcpServerId: values.mcpServerId,
        toolName: values.toolName || undefined,
        config: configParsed
      }
      await createWorkflowMcpBind(workflowId!, dto)
      message.success('MCP 绑定已创建')
      form.resetFields()
      setAddOpen(false)
      void loadBinds()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[WorkflowLib] add bind failed:', err)
      message.error('创建绑定失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBind = async (bindId: number) => {
    try {
      await deleteWorkflowMcpBind(bindId)
      message.success('已删除绑定')
      setBinds((prev) => prev.filter((b) => b.id !== bindId))
    } catch (err) {
      console.error('[WorkflowLib] delete bind failed:', err)
      message.error('删除绑定失败')
    }
  }

  const bindColumns: TableColumnsType<WorkflowMcpBind> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: 'MCP Server ID',
      dataIndex: 'mcpServerId',
      key: 'mcpServerId',
      width: 130,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '工具名',
      dataIndex: 'toolName',
      key: 'toolName',
      width: 150,
      render: (v?: string) => v || <span style={{ color: '#64748b' }}>-</span>
    },
    {
      title: '启用',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (v: boolean) =>
        v ? (
          <Tag className={styles.tagActive}>是</Tag>
        ) : (
          <Tag className={styles.tagBanned}>否</Tag>
        )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>
          {dayjs(t).format('YYYY-MM-DD HH:mm')}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: WorkflowMcpBind) => (
        <Popconfirm
          title="确认删除该绑定?"
          onConfirm={() => handleDeleteBind(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <Modal
      title="MCP 绑定"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <div style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields()
            setAddOpen(true)
          }}
          className={styles.primaryBtn}
        >
          新增绑定
        </Button>
      </div>
      <Spin spinning={loading}>
        {binds.length === 0 && !loading ? (
          <Empty description="暂无 MCP 绑定" />
        ) : (
          <Table<WorkflowMcpBind>
            rowKey="id"
            columns={bindColumns}
            dataSource={binds}
            pagination={false}
            size="small"
            scroll={{ x: 700 }}
          />
        )}
      </Spin>

      <Modal
        title="新增 MCP 绑定"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAddBind}
        confirmLoading={saving}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form<McpBindFormValues> form={form} layout="vertical">
          <Form.Item
            name="mcpServerId"
            label="MCP Server ID"
            rules={[{ required: true, message: '请输入 MCP Server ID' }]}
          >
            <Input type="number" placeholder="如:1" />
          </Form.Item>
          <Form.Item name="toolName" label="工具名(可选)">
            <Input placeholder="如:send-email" />
          </Form.Item>
          <Form.Item name="config" label="配置 JSON(可选)">
            <Input.TextArea
              rows={4}
              placeholder='{"key":"value"}'
              style={{ fontFamily: 'Fira Code, Consolas, monospace', fontSize: 12 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  )
}

// ===== 编辑 Modal =====

interface EditFormValues {
  name: string
  description: string
  category: string
  publishStatus: string
  isPublished: boolean
}

function EditModal({
  item,
  open,
  onClose,
  onSuccess
}: {
  item: N8nWorkflowLib | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [form] = Form.useForm<EditFormValues>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (item && open) {
      form.setFieldsValue({
        name: item.name,
        description: item.description,
        category: item.category,
        publishStatus: item.publishStatus || 'draft',
        isPublished: item.isPublished || false
      })
    }
  }, [item, open, form])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: UpdateWorkflowLibDto = {
        name: values.name,
        description: values.description,
        category: values.category,
        publishStatus: values.publishStatus,
        isPublished: values.isPublished
      }
      await updateWorkflowLib(item!.id, dto)
      message.success('模板已更新')
      onClose()
      onSuccess()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[WorkflowLib] edit failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={item ? `编辑模板 - ${item.name}` : '编辑模板'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={640}
    >
      <Form<EditFormValues> form={form} layout="vertical">
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: '请输入名称' }]}
        >
          <Input maxLength={128} />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>
        <Form.Item name="category" label="分类">
          <Input placeholder="如:automation" maxLength={64} />
        </Form.Item>
        <Form.Item name="publishStatus" label="发布状态">
          <Input placeholder="draft / published / pending_review" maxLength={32} />
        </Form.Item>
        <Form.Item name="isPublished" label="是否发布" valuePropName="checked">
          <Switch checkedChildren="已发布" unCheckedChildren="草稿" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ===== 主页面 =====

export default function AdminWorkflowLib() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<N8nWorkflowLib[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [importOpen, setImportOpen] = useState(false)
  const [editItem, setEditItem] = useState<N8nWorkflowLib | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [logsWorkflowId, setLogsWorkflowId] = useState<number | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [bindsWorkflowId, setBindsWorkflowId] = useState<number | null>(null)
  const [bindsOpen, setBindsOpen] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      const result = await listWorkflowLib(query)
      setItems(result.list || [])
      setTotal(result.total || 0)
    } catch (err) {
      console.error('[WorkflowLib] load failed:', err)
      message.error('加载工作流列表失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleEdit = async (item: N8nWorkflowLib) => {
    try {
      const detail = await getWorkflowLibDetail(item.id)
      setEditItem(detail)
      setEditOpen(true)
    } catch (err) {
      console.error('[WorkflowLib] get detail failed:', err)
      message.error('获取模板详情失败')
    }
  }

  const handleDelete = async (item: N8nWorkflowLib) => {
    try {
      await deleteWorkflowLib(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((w) => w.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[WorkflowLib] delete failed:', err)
      message.error('删除失败')
    }
  }

  const handleViewLogs = (item: N8nWorkflowLib) => {
    setLogsWorkflowId(item.id)
    setLogsOpen(true)
  }

  const handleViewBinds = (item: N8nWorkflowLib) => {
    setBindsWorkflowId(item.id)
    setBindsOpen(true)
  }

  const columns: TableColumnsType<N8nWorkflowLib> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ color: '#8b949e' }}>{v || '-'}</span>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: string) => <Tag color="blue">{c}</Tag>
    },
    {
      title: '发布状态',
      dataIndex: 'publishStatus',
      key: 'publishStatus',
      width: 100,
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          draft: { color: 'default', text: '草稿' },
          pending_review: { color: 'orange', text: '待审核' },
          approved: { color: 'green', text: '已审核' },
          published: { color: 'blue', text: '已发布' },
          rejected: { color: 'red', text: '已驳回' },
        }
        const info = map[s] || { color: 'default', text: s }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>
          {dayjs(t).format('YYYY-MM-DD HH:mm')}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      fixed: 'right',
      render: (_: unknown, record: N8nWorkflowLib) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => handleViewLogs(record)}
          >
            日志
          </Button>
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => handleViewBinds(record)}
          >
            MCP绑定
          </Button>
          <Popconfirm
            title="确认删除该模板?"
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
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>工作流模板库</h1>
            <div className={styles.subtitle}>管理工作流模板、GitHub 导入、执行日志与 MCP 绑定</div>
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
            icon={<GithubOutlined />}
            onClick={() => setImportOpen(true)}
            className={styles.primaryBtn}
          >
            GitHub 导入
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无工作流模板" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<N8nWorkflowLib>
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
            onChange={(p: number) => setPage(p)}
            showSizeChanger={false}
            showTotal={(t: number) => `共 ${t} 条`}
          />
        </div>
      </Spin>

      {/* GitHub 导入 Modal */}
      <ImportGithubModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={loadList}
      />

      {/* 编辑 Modal */}
      <EditModal
        item={editItem}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={loadList}
      />

      {/* 执行日志 Modal */}
      <ExecLogsModal
        workflowId={logsWorkflowId}
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
      />

      {/* MCP 绑定 Modal */}
      <McpBindsModal
        workflowId={bindsWorkflowId}
        open={bindsOpen}
        onClose={() => setBindsOpen(false)}
      />
    </div>
  )
}
