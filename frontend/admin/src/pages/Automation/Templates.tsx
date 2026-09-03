// A1 场景模板管理：CRUD + 上下架 + 步骤 JSON 编辑（后台填表单，不写代码）
import { useCallback, useEffect, useState } from 'react'
import {
  Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  adminListAutomationTemplates,
  adminCreateAutomationTemplate,
  adminUpdateAutomationTemplate,
  adminDeleteAutomationTemplate,
  type AdminAutomationTemplate,
} from '@/api/admin-automation-api'

function fmt(v: unknown): string {
  if (!v) return '-'
  return new Date(v as string).toLocaleString('zh-CN', { hour12: false })
}

export default function AutomationTemplates() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<AdminAutomationTemplate[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminAutomationTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList((await adminListAutomationTemplates()) || [])
    } catch (err) {
      message.error('加载模板失败: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ status: 'active', builtIn: false, steps: '[]', paramsSchema: '[]' })
    setOpen(true)
  }

  const openEdit = (t: AdminAutomationTemplate) => {
    setEditing(t)
    form.resetFields()
    form.setFieldsValue({
      name: t.name,
      description: t.description,
      keywords: t.keywords,
      status: t.status,
      builtIn: t.builtIn === 1,
      steps: JSON.stringify(t.stepsJson ?? [], null, 2),
      paramsSchema: JSON.stringify(t.paramsSchema ?? [], null, 2),
    })
    setOpen(true)
  }

  const save = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      let steps: unknown = []
      let paramsSchema: unknown = []
      try { steps = JSON.parse(v.steps || '[]') } catch { throw new Error('步骤 JSON 格式错误') }
      try { paramsSchema = JSON.parse(v.paramsSchema || '[]') } catch { throw new Error('参数 Schema JSON 格式错误') }
      const payload = {
        name: v.name,
        description: v.description,
        keywords: v.keywords,
        status: v.status,
        builtIn: v.builtIn ? 1 : 0,
        steps,
        paramsSchema,
      }
      if (editing) await adminUpdateAutomationTemplate(editing.id, payload)
      else await adminCreateAutomationTemplate(payload)
      message.success('保存成功')
      setOpen(false)
      void load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (t: AdminAutomationTemplate, status: 'active' | 'disabled') => {
    try {
      await adminUpdateAutomationTemplate(t.id, { status })
      message.success(status === 'active' ? '已上架' : '已下架')
      void load()
    } catch (err) {
      message.error('操作失败: ' + (err as Error).message)
    }
  }

  const remove = async (t: AdminAutomationTemplate) => {
    try {
      await adminDeleteAutomationTemplate(t.id)
      message.success('已删除')
      void load()
    } catch (err) {
      message.error('删除失败: ' + (err as Error).message)
    }
  }

  const columns: TableColumnsType<AdminAutomationTemplate> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '说明', dataIndex: 'description', ellipsis: true },
    { title: '触发词', dataIndex: 'keywords', width: 200, ellipsis: true },
    {
      title: '类型', dataIndex: 'builtIn', width: 90,
      render: (v) => (v === 1 ? <Tag color="blue">内置</Tag> : <Tag>自定义</Tag>),
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v) => (v === 'active' ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>),
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: fmt },
    {
      title: '操作', width: 220,
      render: (_, t) => (
        <Space>
          <Button size="small" onClick={() => openEdit(t)}>编辑</Button>
          <Button size="small" onClick={() => toggleStatus(t, t.status === 'active' ? 'disabled' : 'active')}>
            {t.status === 'active' ? '下架' : '上架'}
          </Button>
          <Popconfirm title="确定删除该模板？" onConfirm={() => remove(t)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="场景模板管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建模板</Button>
        </Space>
      }
    >
      <Table rowKey="id" loading={loading} columns={columns} dataSource={list} pagination={{ pageSize: 20 }} />
      <Modal title={editing ? '编辑模板' : '新建模板'} open={open} onOk={save} confirmLoading={saving} onCancel={() => setOpen(false)} okText="保存" cancelText="取消" width={720} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：查询设备状态" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={2} placeholder="模板说明（展示给用户）" />
          </Form.Item>
          <Form.Item label="触发关键词" name="keywords">
            <Input placeholder="逗号分隔，如：查询状态,设备状态" />
          </Form.Item>
          <Space size="large">
            <Form.Item label="状态" name="status">
              <Select style={{ width: 140 }} options={[
                { value: 'active', label: '上架' },
                { value: 'disabled', label: '下架' },
              ]} />
            </Form.Item>
            <Form.Item label="内置模板" name="builtIn" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="执行步骤 (JSON)" name="steps" rules={[{ required: true, message: '请输入步骤 JSON' }]}>
            <Input.TextArea rows={6} placeholder='[{"type":"query_status","name":"查询设备状态"}]' />
          </Form.Item>
          <Form.Item label="参数 Schema (JSON)" name="paramsSchema">
            <Input.TextArea rows={4} placeholder='[{"key":"path","label":"文件路径","required":true}]' />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}