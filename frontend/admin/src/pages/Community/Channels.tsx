// 频道管理页 - 社区管理
//
// Table 展示频道列表，支持新增/编辑/删除
// 新增和编辑均使用 Modal + Form

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  ColorPicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  InputNumber,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createChannel,
  deleteChannel,
  listChannels,
  updateChannel
} from '@/api/admin-community-api'
import styles from './styles.module.css'

interface Channel {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  color: string
  postCount: number
  sortOrder: number
  isEnabled: boolean
  createdAt: string
}

interface ChannelFormValues {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
}

interface EditFormValues {
  name: string
  description?: string
  icon?: string
  color?: string
  isEnabled: boolean
  sortOrder: number
}

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [createLoading, setCreateLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [createForm] = Form.useForm<ChannelFormValues>()
  const [editForm] = Form.useForm<EditFormValues>()

  const fetchChannels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listChannels()
      setChannels((res as Channel[]) || [])
    } catch {
      message.error('加载频道列表失败')
      setChannels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setCreateLoading(true)
      const rawColor = values.color as unknown
      const colorValue = typeof rawColor === 'string' ? rawColor : (rawColor as { toHexString?: () => string })?.toHexString?.() || undefined
      await createChannel({
        id: values.id,
        name: values.name,
        slug: values.slug,
        description: values.description,
        icon: values.icon,
        color: colorValue
      })
      message.success('频道创建成功')
      setCreateModalOpen(false)
      createForm.resetFields()
      fetchChannels()
    } catch {
      message.error('创建失败')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!editingChannel) return
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const rawEditColor = values.color as unknown
      const colorValue = typeof rawEditColor === 'string' ? rawEditColor : (rawEditColor as { toHexString?: () => string })?.toHexString?.() || undefined
      await updateChannel(editingChannel.id, {
        name: values.name,
        description: values.description,
        icon: values.icon,
        color: colorValue,
        isEnabled: values.isEnabled,
        sortOrder: values.sortOrder
      })
      message.success('频道更新成功')
      setEditModalOpen(false)
      setEditingChannel(null)
      editForm.resetFields()
      fetchChannels()
    } catch {
      message.error('更新失败')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteChannel(id)
      message.success('频道已删除')
      fetchChannels()
    } catch {
      message.error('删除失败')
    }
  }

  const openEditModal = (channel: Channel) => {
    setEditingChannel(channel)
    editForm.setFieldsValue({
      name: channel.name,
      description: channel.description,
      icon: channel.icon,
      color: channel.color,
      isEnabled: channel.isEnabled,
      sortOrder: channel.sortOrder
    })
    setEditModalOpen(true)
  }

  const columns: TableColumnsType<Channel> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name: string, record: Channel) => (
        <Space size={6}>
          {record.icon && <span>{record.icon}</span>}
          <span style={{ color: record.color || undefined }}>{name}</span>
        </Space>
      )
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      width: 140
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 200,
      render: (desc: string) => desc || '-'
    },
    {
      title: '帖子数',
      dataIndex: 'postCount',
      key: 'postCount',
      width: 80,
      render: (count: number) => count ?? 0
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80
    },
    {
      title: '启用',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (enabled: boolean) => (
        <Switch checked={enabled} disabled size="small" />
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_: unknown, record: Channel) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该频道吗？"
            description="删除后不可恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className={styles.toolbar}>
        <h3 style={{ margin: 0 }}>频道管理</h3>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchChannels} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields()
              setCreateModalOpen(true)
            }}
          >
            新增频道
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={channels}
          pagination={false}
          scroll={{ x: 900 }}
          size="middle"
          locale={{ emptyText: '暂无频道' }}
        />
      </Spin>

      {/* 新增频道 Modal */}
      <Modal
        title="新增频道"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false)
          createForm.resetFields()
        }}
        onOk={handleCreate}
        confirmLoading={createLoading}
        okText="创建"
        cancelText="取消"
        width={480}
      >
        <Form
          form={createForm}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="id"
            label="频道 ID"
            rules={[
              { required: true, message: '请输入频道 ID' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和连字符' }
            ]}
          >
            <Input placeholder="如: tech" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="name"
            label="频道名称"
            rules={[{ required: true, message: '请输入频道名称' }]}
          >
            <Input placeholder="如: 技术分享" maxLength={32} />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: '请输入 Slug' },
              { pattern: /^[a-z0-9-]+$/, message: '只能包含小写字母、数字和连字符' }
            ]}
          >
            <Input placeholder="如: tech-share" maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="频道描述（选填）" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="Emoji 或图标名称（选填）" maxLength={16} />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <ColorPicker showText format="hex" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑频道 Modal */}
      <Modal
        title="编辑频道"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false)
          setEditingChannel(null)
          editForm.resetFields()
        }}
        onOk={handleEdit}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <Form
          form={editForm}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label="频道名称"
            rules={[{ required: true, message: '请输入频道名称' }]}
          >
            <Input placeholder="频道名称" maxLength={32} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="频道描述" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="Emoji 或图标名称" maxLength={16} />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <ColorPicker showText format="hex" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isEnabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
