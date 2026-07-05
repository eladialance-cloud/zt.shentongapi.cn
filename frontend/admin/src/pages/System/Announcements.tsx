// 公告管理页 - SubTask 28.3
//
// 表格:标题/类型(info/warning/critical)/发布范围(全部/指定等级)/状态(草稿/已发布)/发布时间/操作
// 新增/编辑模态框:title/content(textarea)/type/scope/isActive
// 操作:编辑/发布/撤回/删除
// API: GET /admin/announcements、POST /admin/announcements、PATCH /admin/announcements/:id、POST /admin/announcements/:id/publish、POST /admin/announcements/:id/unpublish、DELETE /admin/announcements/:id

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
  BellOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SendOutlined
} from '@ant-design/icons'
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement
} from '@/api/admin-system-api'
import type {
  Announcement,
  AnnouncementScope,
  AnnouncementStatus,
  AnnouncementType,
  CreateAnnouncementDto,
  UpdateAnnouncementDto
} from '@/types/admin-system'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_OPTIONS: Array<{ label: string; value: AnnouncementType }> = [
  { label: '普通(info)', value: 'info' },
  { label: '警告(warning)', value: 'warning' },
  { label: '紧急(critical)', value: 'critical' }
]

const TYPE_TAG: Record<AnnouncementType, { color: string; text: string }> = {
  info: { color: 'blue', text: '普通' },
  warning: { color: 'orange', text: '警告' },
  critical: { color: 'red', text: '紧急' }
}

const SCOPE_OPTIONS: Array<{ label: string; value: AnnouncementScope }> = [
  { label: '全部用户', value: 'all' },
  { label: '指定等级', value: 'level_specific' }
]

const SCOPE_LABEL: Record<AnnouncementScope, string> = {
  all: '全部用户',
  level_specific: '指定等级'
}

const STATUS_TAG: Record<AnnouncementStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  published: { color: 'green', text: '已发布' }
}

interface AnnFormValues {
  title: string
  content: string
  type: AnnouncementType
  scope: AnnouncementScope
  targetLevel?: number
  isActive: boolean
}

export default function SystemAnnouncements() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<AnnouncementStatus | ''>('')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form] = Form.useForm<AnnFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (status) query.status = status
      const result = await listAnnouncements(query)
      const r = result as AdminPaginatedResult<Announcement>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[SystemAnnouncements] load failed:', err)
      message.error('加载公告列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      type: 'info',
      scope: 'all',
      isActive: true
    })
    setEditOpen(true)
  }

  const handleEdit = (item: Announcement) => {
    setEditing(item)
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      type: item.type,
      scope: item.scope,
      targetLevel: item.targetLevel,
      isActive: item.isActive
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateAnnouncementDto = {
          title: values.title,
          content: values.content,
          type: values.type,
          scope: values.scope,
          targetLevel: values.scope === 'level_specific' ? values.targetLevel : undefined,
          isActive: values.isActive
        }
        await updateAnnouncement(editing.id, dto)
        message.success('公告已更新')
      } else {
        const dto: CreateAnnouncementDto = {
          title: values.title,
          content: values.content,
          type: values.type,
          scope: values.scope,
          targetLevel: values.scope === 'level_specific' ? values.targetLevel : undefined,
          isActive: values.isActive
        }
        await createAnnouncement(dto)
        message.success('公告已创建')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemAnnouncements] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (item: Announcement) => {
    try {
      await publishAnnouncement(item.id)
      message.success('已发布')
      setItems((prev) =>
        prev.map((k) =>
          k.id === item.id
            ? {
                ...k,
                status: 'published',
                publishedAt: new Date().toISOString()
              }
            : k
        )
      )
    } catch (err) {
      console.error('[SystemAnnouncements] publish failed:', err)
      message.error('发布失败')
    }
  }

  const handleUnpublish = async (item: Announcement) => {
    try {
      await unpublishAnnouncement(item.id)
      message.success('已撤回')
      setItems((prev) =>
        prev.map((k) =>
          k.id === item.id ? { ...k, status: 'draft', publishedAt: undefined } : k
        )
      )
    } catch (err) {
      console.error('[SystemAnnouncements] unpublish failed:', err)
      message.error('撤回失败')
    }
  }

  const handleDelete = async (item: Announcement) => {
    try {
      await deleteAnnouncement(item.id)
      message.success('已删除')
      setItems((prev) => prev.filter((k) => k.id !== item.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error('[SystemAnnouncements] delete failed:', err)
      message.error('删除失败')
    }
  }

  const columns: TableColumnsType<Announcement> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: AnnouncementType) => (
        <Tag color={TYPE_TAG[t].color}>{TYPE_TAG[t].text}</Tag>
      )
    },
    {
      title: '发布范围',
      key: 'scope',
      width: 150,
      render: (_: unknown, r: Announcement) => (
        <span style={{ color: '#c7d2fe' }}>
          {SCOPE_LABEL[r.scope]}
          {r.scope === 'level_specific' && r.targetLevel
            ? ` (Lv${r.targetLevel})`
            : ''}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: AnnouncementStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_: unknown, record: Announcement) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.status === 'draft' ? (
            <Popconfirm
              title="确认发布该公告?"
              onConfirm={() => handlePublish(record)}
              okText="发布"
              cancelText="取消"
            >
              <Button type="link" size="small" icon={<SendOutlined />}>
                发布
              </Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="确认撤回该公告?"
              onConfirm={() => handleUnpublish(record)}
              okText="撤回"
              cancelText="取消"
            >
              <Button type="link" size="small" icon={<RollbackOutlined />}>
                撤回
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确认删除该公告?"
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
          <BellOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>公告管理</h1>
            <div className={styles.subtitle}>管理系统公告与推送</div>
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
            新增公告
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v as AnnouncementStatus | '')}
            className={styles.filterSelect}
            options={[
              { label: '全部状态', value: '' },
              { label: '草稿', value: 'draft' },
              { label: '已发布', value: 'published' }
            ]}
            allowClear
          />
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无公告" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<Announcement>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1100 }}
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
        title={editing ? `编辑公告 - ${editing.title}` : '新增公告'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form<AnnFormValues> form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入公告标题" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <Input.TextArea rows={5} placeholder="请输入公告内容" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="scope"
            label="发布范围"
            rules={[{ required: true, message: '请选择发布范围' }]}
          >
            <Select options={SCOPE_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scope !== cur.scope}>
            {({ getFieldValue }) =>
              getFieldValue('scope') === 'level_specific' ? (
                <Form.Item
                  name="targetLevel"
                  label="目标用户等级(1-5)"
                  rules={[{ required: true, message: '请输入目标等级' }]}
                >
                  <InputNumber min={1} max={5} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
