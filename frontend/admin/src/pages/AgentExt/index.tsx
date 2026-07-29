// Agent 扩展管理页
//
// Tabs 切换"部门管理"和"标签管理"两个 Tab
// 部门 Tab: Table + Modal Form（列：名称/描述/排序/操作）
// 标签 Tab: Table + Modal Form（列：名称/颜色(Tag预览)/操作）
// API: /admin/agent-ext/*

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Spin,
  Table,
  Tabs,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons'
import {
  createAgentDepartment,
  createAgentTag,
  deleteAgentDepartment,
  deleteAgentTag,
  listAgentDepartments,
  listAgentTags,
  updateAgentDepartment,
  updateAgentTag
} from '@/api/admin-agent-ext-api'
import type {
  AgentDepartment,
  AgentTag,
  CreateAgentDepartmentDto,
  CreateAgentTagDto,
  UpdateAgentDepartmentDto,
  UpdateAgentTagDto
} from '@/types/admin-agent-ext'
import dayjs from 'dayjs'
import styles from './styles.module.css'

// ===== 部门管理 Tab =====

interface DeptFormValues {
  name: string
  description?: string
  sortOrder?: number
}

function DepartmentTab() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AgentDepartment[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AgentDepartment | null>(null)
  const [form] = Form.useForm<DeptFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAgentDepartments()
      setItems(data)
    } catch (err) {
      console.error('[AgentExt/Departments] load failed:', err)
      message.error('加载部门列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ sortOrder: 0 })
    setEditOpen(true)
  }

  const handleEdit = (item: AgentDepartment) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      description: item.description,
      sortOrder: item.sortOrder
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateAgentDepartmentDto = {
          name: values.name,
          description: values.description,
          sortOrder: values.sortOrder
        }
        await updateAgentDepartment(editing.id, dto)
        message.success('部门已更新')
      } else {
        const dto: CreateAgentDepartmentDto = {
          name: values.name,
          description: values.description,
          sortOrder: values.sortOrder
        }
        await createAgentDepartment(dto)
        message.success('部门已创建')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentExt/Departments] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AgentDepartment) => {
    try {
      await deleteAgentDepartment(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((d) => d.id !== item.id))
    } catch (err) {
      console.error('[AgentExt/Departments] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<AgentDepartment> = [
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
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v}</span>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>
          {dayjs(t).format('YYYY-MM-DD HH:mm')}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: AgentDepartment) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该部门?"
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
    <div>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft} />
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
            新增部门
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无部门" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AgentDepartment>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 800 }}
            />
          </div>
        )}
      </Spin>

      <Modal
        title={editing ? `编辑部门 - ${editing.name}` : '新增部门'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<DeptFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入部门名称' }]}
          >
            <Input placeholder="如:研发部" maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ===== 标签管理 Tab =====

interface TagFormValues {
  name: string
  color: string
}

/** 预设颜色 */
const PRESET_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#fb923c'
]

function TagTab() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AgentTag[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AgentTag | null>(null)
  const [form] = Form.useForm<TagFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAgentTags()
      setItems(data)
    } catch (err) {
      console.error('[AgentExt/Tags] load failed:', err)
      message.error('加载标签列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ color: PRESET_COLORS[0] })
    setEditOpen(true)
  }

  const handleEdit = (item: AgentTag) => {
    setEditing(item)
    form.setFieldsValue({ name: item.name, color: item.color })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateAgentTagDto = {
          name: values.name,
          color: values.color
        }
        await updateAgentTag(editing.id, dto)
        message.success('标签已更新')
      } else {
        const dto: CreateAgentTagDto = {
          name: values.name,
          color: values.color
        }
        await createAgentTag(dto)
        message.success('标签已创建')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentExt/Tags] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: AgentTag) => {
    try {
      await deleteAgentTag(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((t) => t.id !== item.id))
    } catch (err) {
      console.error('[AgentExt/Tags] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<AgentTag> = [
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
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 200,
      render: (color: string, record: AgentTag) => (
        <span className={styles.tagPreview} style={{ backgroundColor: `${color}22`, color }}>
          <span className={styles.colorDot} style={{ backgroundColor: color }} />
          {record.name}
        </span>
      )
    },
    {
      title: '颜色值',
      dataIndex: 'color',
      key: 'colorValue',
      width: 120,
      render: (v: string) => (
        <span style={{ color: '#8b949e', fontFamily: 'Fira Code, monospace', fontSize: 12 }}>
          {v}
        </span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>
          {dayjs(t).format('YYYY-MM-DD HH:mm')}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: AgentTag) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该标签?"
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
    <div>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft} />
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
            新增标签
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无标签" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AgentTag>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 800 }}
            />
          </div>
        )}
      </Spin>

      <Modal
        title={editing ? `编辑标签 - ${editing.name}` : '新增标签'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<TagFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入标签名称' }]}
          >
            <Input placeholder="如:高优先级" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="color"
            label="颜色"
            rules={[{ required: true, message: '请选择颜色' }]}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => form.setFieldValue('color', c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: form.getFieldValue('color') === c ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: form.getFieldValue('color') === c ? `0 0 8px ${c}` : 'none',
                    transition: 'all 0.2s'
                  }}
                />
              ))}
            </div>
          </Form.Item>
          <Form.Item name="color" label="颜色值(十六进制)">
            <Input placeholder="#38bdf8" maxLength={7} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const color = getFieldValue('color') as string
              const name = getFieldValue('name') as string
              if (!color && !name) return null
              return (
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#8b949e', fontSize: 12, marginRight: 8 }}>预览:</span>
                  <span className={styles.tagPreview} style={{ backgroundColor: `${color}22`, color }}>
                    <span className={styles.colorDot} style={{ backgroundColor: color }} />
                    {name || '标签预览'}
                  </span>
                </div>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ===== 主页面 =====

export default function AdminAgentExt() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TeamOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 扩展管理</h1>
            <div className={styles.subtitle}>管理部门与标签</div>
          </div>
        </div>
      </div>

      <div className={styles.tabsContainer}>
        <Tabs
          defaultActiveKey="departments"
          items={[
            {
              key: 'departments',
              label: '部门管理',
              children: <DepartmentTab />
            },
            {
              key: 'tags',
              label: '标签管理',
              children: <TagTab />
            }
          ]}
        />
      </div>
    </div>
  )
}
