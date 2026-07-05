// 工作流模板列表页 - SubTask 21.1 + 21.2
//
// 表格:ID/名称/engineType(n8n/coze)/分类/价格/状态/执行次数/创建时间/操作
// 新增/编辑模态框(含 inputSchema/outputSchema JSON 编辑器、定价配置)
// 操作:编辑/删除/启用/禁用
// API: GET/POST/PATCH/DELETE /admin/workflows

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
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  createAdminWorkflow,
  deleteAdminWorkflow,
  listAdminWorkflows,
  updateAdminWorkflow
} from '@/api/admin-workflow-api'
import type {
  AdminWorkflowCategory,
  AdminWorkflowItem,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
  WorkflowEngineType
} from '@/types/admin-workflow'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const ENGINE_OPTIONS: Array<{ label: string; value: WorkflowEngineType }> = [
  { label: 'n8n', value: 'n8n' },
  { label: 'Coze', value: 'coze' }
]

const CATEGORY_OPTIONS: Array<{ label: string; value: AdminWorkflowCategory }> = [
  { label: '自动化', value: 'automation' },
  { label: '集成', value: 'integration' },
  { label: '数据处理', value: 'data_processing' },
  { label: '其他', value: 'other' }
]

const ENGINE_LABEL: Record<WorkflowEngineType, string> = {
  n8n: 'n8n',
  coze: 'Coze'
}

const CATEGORY_LABEL: Record<AdminWorkflowCategory, string> = {
  automation: '自动化',
  integration: '集成',
  data_processing: '数据处理',
  other: '其他'
}

interface WorkflowFormValues {
  name: string
  description: string
  engineType: WorkflowEngineType
  n8nWorkflowId?: string
  cozeWorkflowId?: string
  category: AdminWorkflowCategory
  inputSchema?: string
  outputSchema?: string
  pricePerExecution: number
  isActive: boolean
}

export default function AdminWorkflows() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AdminWorkflowItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [engineFilter, setEngineFilter] = useState<WorkflowEngineType | ''>('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminWorkflowItem | null>(null)
  const [form] = Form.useForm<WorkflowFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (engineFilter) query.engineType = engineFilter
      const result = await listAdminWorkflows(query)
      const r = result as AdminPaginatedResult<AdminWorkflowItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminWorkflows] load failed:', err)
      message.error('加载工作流列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, engineFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      engineType: 'n8n',
      category: 'automation',
      pricePerExecution: 0,
      isActive: true
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
      isActive: item.isActive
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      // 校验 JSON Schema
      let inputSchemaParsed: Record<string, unknown> | undefined
      let outputSchemaParsed: Record<string, unknown> | undefined
      if (values.inputSchema && values.inputSchema.trim()) {
        try {
          inputSchemaParsed = JSON.parse(values.inputSchema) as Record<string, unknown>
        } catch {
          message.error('输入 Schema JSON 格式错误')
          return
        }
      }
      if (values.outputSchema && values.outputSchema.trim()) {
        try {
          outputSchemaParsed = JSON.parse(values.outputSchema) as Record<string, unknown>
        } catch {
          message.error('输出 Schema JSON 格式错误')
          return
        }
      }
      setSaving(true)
      const baseDto = {
        name: values.name,
        description: values.description,
        engineType: values.engineType,
        n8nWorkflowId: values.engineType === 'n8n' ? values.n8nWorkflowId : undefined,
        cozeWorkflowId: values.engineType === 'coze' ? values.cozeWorkflowId : undefined,
        category: values.category,
        inputSchema: inputSchemaParsed,
        outputSchema: outputSchemaParsed,
        pricePerExecution: values.pricePerExecution,
        isActive: values.isActive
      }
      if (editing) {
        const dto: UpdateAdminWorkflowDto = baseDto
        await updateAdminWorkflow(editing.id, dto)
        message.success('工作流已更新')
      } else {
        const dto: CreateAdminWorkflowDto = baseDto
        await createAdminWorkflow(dto)
        message.success('工作流已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminWorkflows] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (item: AdminWorkflowItem) => {
    try {
      await updateAdminWorkflow(item.id, { isActive: !item.isActive })
      message.success(item.isActive ? '已禁用' : '已启用')
      setItems((prev) =>
        prev.map((w) =>
          w.id === item.id ? { ...w, isActive: !w.isActive } : w
        )
      )
    } catch (err) {
      console.error('[AdminWorkflows] toggle failed:', err)
      message.error('操作失败')
    }
  }

  const handleDelete = async (item: AdminWorkflowItem) => {
    try {
      await deleteAdminWorkflow(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((w) => w.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[AdminWorkflows] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<AdminWorkflowItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '引擎',
      dataIndex: 'engineType',
      key: 'engineType',
      width: 90,
      render: (e: WorkflowEngineType) => (
        <Tag color={e === 'n8n' ? 'purple' : 'magenta'}>{ENGINE_LABEL[e]}</Tag>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      render: (c: AdminWorkflowCategory) => <Tag color="blue">{CATEGORY_LABEL[c]}</Tag>
    },
    {
      title: '价格(积分)',
      dataIndex: 'pricePerExecution',
      key: 'pricePerExecution',
      width: 110,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (active: boolean) =>
        active ? (
          <Tag className={styles.tagActive}>启用</Tag>
        ) : (
          <Tag className={styles.tagBanned}>禁用</Tag>
        )
    },
    {
      title: '执行次数',
      dataIndex: 'executionCount',
      key: 'executionCount',
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
      width: 220,
      fixed: 'right',
      render: (_: unknown, record: AdminWorkflowItem) => (
        <>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleActive(record)}>
            {record.isActive ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确认删除该工作流?"
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
            <h1 className={styles.title}>工作流模板管理</h1>
            <div className={styles.subtitle}>管理工作流模板与定价</div>
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
            新增工作流
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="引擎类型"
            value={engineFilter}
            onChange={(v) => setEngineFilter(v as WorkflowEngineType | '')}
            className={styles.filterSelect}
            allowClear
            options={ENGINE_OPTIONS}
          />
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无工作流" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminWorkflowItem>
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
        title={editing ? `编辑工作流 - ${editing.name}` : '新增工作流'}
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
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如:邮件自动回复" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item
            name="engineType"
            label="引擎类型"
            rules={[{ required: true, message: '请选择引擎' }]}
          >
            <Select
              options={ENGINE_OPTIONS}
              onChange={(v: WorkflowEngineType) => {
                if (v === 'n8n') {
                  form.setFieldValue('cozeWorkflowId', undefined)
                } else {
                  form.setFieldValue('n8nWorkflowId', undefined)
                }
              }}
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) =>
              getFieldValue('engineType') === 'n8n' ? (
                <Form.Item name="n8nWorkflowId" label="n8n 工作流 ID">
                  <Input placeholder="如:workflow-123" />
                </Form.Item>
              ) : (
                <Form.Item name="cozeWorkflowId" label="Coze 工作流 ID">
                  <Input placeholder="如:coze-flow-456" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="inputSchema" label="输入 Schema(JSON)">
            <Input.TextArea
              rows={4}
              placeholder='{"type":"object","properties":{}}'
              className={styles.schemaTextarea}
            />
          </Form.Item>
          <Form.Item name="outputSchema" label="输出 Schema(JSON)">
            <Input.TextArea
              rows={4}
              placeholder='{"type":"object","properties":{}}'
              className={styles.schemaTextarea}
            />
          </Form.Item>
          <Form.Item
            name="pricePerExecution"
            label="单次执行价格(积分)"
            rules={[{ required: true, message: '请输入' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
