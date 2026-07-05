// 多租户配置页 - SubTask 28.2
//
// 表格:租户名/配额(用户数/调用量/存储)/状态/创建时间/操作
// 新增/编辑模态框
// API: GET /admin/tenants、POST /admin/tenants、PATCH /admin/tenants/:id、POST /admin/tenants/:id/suspend

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
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons'
import {
  createTenant,
  listTenants,
  suspendTenant,
  updateTenant
} from '@/api/admin-system-api'
import type {
  CreateTenantDto,
  Tenant,
  TenantStatus,
  UpdateTenantDto
} from '@/types/admin-system'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const STATUS_TAG: Record<TenantStatus, { color: string; text: string }> = {
  active: { color: 'green', text: '正常' },
  suspended: { color: 'red', text: '已停用' }
}

interface TenantFormValues {
  name: string
  users: number
  calls: number
  storage: number
}

export default function SystemTenant() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [form] = Form.useForm<TenantFormValues>()
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listTenants({ page, pageSize: PAGE_SIZE })
      const r = result as AdminPaginatedResult<Tenant>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[SystemTenant] load failed:', err)
      message.error('加载租户列表失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleAdd = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ name: '', users: 100, calls: 10000, storage: 1024 })
    setEditOpen(true)
  }

  const handleEdit = (item: Tenant) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      users: item.quota.users,
      calls: item.quota.calls,
      storage: item.quota.storage
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const dto: UpdateTenantDto = {
          name: values.name,
          quota: {
            users: values.users,
            calls: values.calls,
            storage: values.storage
          }
        }
        await updateTenant(editing.id, dto)
        message.success('租户已更新')
      } else {
        const dto: CreateTenantDto = {
          name: values.name,
          quota: {
            users: values.users,
            calls: values.calls,
            storage: values.storage
          }
        }
        await createTenant(dto)
        message.success('租户已新增')
      }
      setEditOpen(false)
      void loadList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[SystemTenant] save failed:', err)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSuspend = async (item: Tenant) => {
    try {
      await suspendTenant(item.id)
      const newStatus: TenantStatus = item.status === 'active' ? 'suspended' : 'active'
      message.success(newStatus === 'suspended' ? '已停用' : '已恢复')
      setItems((prev) =>
        prev.map((k) => (k.id === item.id ? { ...k, status: newStatus } : k))
      )
    } catch (err) {
      console.error('[SystemTenant] suspend failed:', err)
      message.error('操作失败')
    }
  }

  const columns: TableColumnsType<Tenant> = [
    {
      title: '租户名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    {
      title: '用户数配额',
      key: 'quotaUsers',
      width: 130,
      render: (_: unknown, r: Tenant) => (
        <span style={{ color: '#7dd3fc' }}>{r.quota.users.toLocaleString()}</span>
      )
    },
    {
      title: '调用量配额',
      key: 'quotaCalls',
      width: 130,
      render: (_: unknown, r: Tenant) => (
        <span style={{ color: '#7dd3fc' }}>{r.quota.calls.toLocaleString()}</span>
      )
    },
    {
      title: '存储配额(MB)',
      key: 'quotaStorage',
      width: 130,
      render: (_: unknown, r: Tenant) => (
        <span style={{ color: '#7dd3fc' }}>{r.quota.storage.toLocaleString()}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: TenantStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
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
      width: 200,
      fixed: 'right',
      render: (_: unknown, record: Tenant) => (
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
            title={record.status === 'active' ? '确认停用该租户?' : '确认恢复该租户?'}
            onConfirm={() => handleSuspend(record)}
            okText="确认"
            cancelText="取消"
            okButtonProps={record.status === 'active' ? { danger: true } : {}}
          >
            <Button
              type="link"
              size="small"
              danger={record.status === 'active'}
            >
              {record.status === 'active' ? '停用' : '恢复'}
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
          <TeamOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>多租户配置</h1>
            <div className={styles.subtitle}>管理租户及配额</div>
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
            新增租户
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无租户" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<Tenant>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1000 }}
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
        title={editing ? `编辑租户 - ${editing.name}` : '新增租户'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form<TenantFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="租户名"
            rules={[{ required: true, message: '请输入租户名' }]}
          >
            <Input placeholder="请输入租户名" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="users"
            label="用户数配额"
            rules={[{ required: true, message: '请输入用户数配额' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="calls"
            label="调用量配额"
            rules={[{ required: true, message: '请输入调用量配额' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="storage"
            label="存储配额(MB)"
            rules={[{ required: true, message: '请输入存储配额' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
