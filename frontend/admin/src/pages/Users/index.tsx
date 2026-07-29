// 用户列表页 - SubTask 18.1
//
// 筛选:keyword/status/level/注册时间范围
// 表格:ID/用户名/邮箱/手机号/等级/状态/积分余额/注册时间/操作
// 操作:查看详情/封禁(modal 原因)/解封/调整等级/调整积分/删除

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CrownOutlined,
  DollarOutlined,
  UserAddOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  adjustUserCredits,
  banUser,
  createUser,
  deleteUser,
  listAdminUsers,
  unbanUser,
  updateUserLevel
} from '@/api/admin-user-api'
import type { AdminUserItem, CreateAdminUserDto, UserStatus } from '@/types/admin-user'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const { RangePicker } = DatePicker
const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ label: string; value: UserStatus | '' }> = [
  { label: '全部状态', value: '' },
  { label: '正常', value: 'active' },
  { label: '已封禁', value: 'banned' }
]

const LEVEL_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  label: `Lv${n}`,
  value: n
}))

interface BanFormValues {
  reason: string
}

interface CreateUserFormValues {
  username: string
  password: string
  email: string
  phone?: string
  level?: number
}

interface CreditsAdjustFormValues {
  amount: number
  remark: string
}

export default function AdminUsers() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [level, setLevel] = useState<number | ''>('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const [banTarget, setBanTarget] = useState<AdminUserItem | null>(null)
  const [banForm] = Form.useForm<BanFormValues>()
  const [banLoading, setBanLoading] = useState(false)

  const [levelTarget, setLevelTarget] = useState<AdminUserItem | null>(null)
  const [levelLoading, setLevelLoading] = useState(false)

  // 调整积分
  const [creditsTarget, setCreditsTarget] = useState<AdminUserItem | null>(null)
  const [creditsForm] = Form.useForm<CreditsAdjustFormValues>()
  const [creditsLoading, setCreditsLoading] = useState(false)

  // 添加用户
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUserForm] = Form.useForm<CreateUserFormValues>()
  const [createUserLoading, setCreateUserLoading] = useState(false)

  // 删除用户
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (keyword.trim()) query.keyword = keyword.trim()
      if (status) query.status = status
      if (level !== '') query.level = level
      if (range && range[0] && range[1]) {
        query.startTime = range[0].toISOString()
        query.endTime = range[1].toISOString()
      }
      const result = await listAdminUsers(query)
      const r = result as AdminPaginatedResult<AdminUserItem>
      setUsers(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[AdminUsers] load failed:', err)
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword, status, level, range])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleSearch = () => {
    setPage(1)
    void loadUsers()
  }

  const handleReset = () => {
    setKeyword('')
    setStatus('')
    setLevel('')
    setRange(null)
    setPage(1)
  }

  const handleConfirmBan = async () => {
    if (!banTarget) return
    try {
      const values = await banForm.validateFields()
      setBanLoading(true)
      await banUser(banTarget.id, { reason: values.reason })
      message.success('已封禁用户')
      setBanTarget(null)
      banForm.resetFields()
      // 本地更新状态
      setUsers((prev) =>
        prev.map((u) =>
          u.id === banTarget.id ? { ...u, status: 'banned' } : u
        )
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // 表单校验错误,不提示
        return
      }
      console.error('[AdminUsers] ban failed:', err)
      message.error('封禁失败')
    } finally {
      setBanLoading(false)
    }
  }

  const handleUnban = async (user: AdminUserItem) => {
    try {
      await unbanUser(user.id)
      message.success('已解封用户')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, status: 'active' } : u
        )
      )
    } catch (err) {
      console.error('[AdminUsers] unban failed:', err)
      message.error('解封失败')
    }
  }

  const handleConfirmLevel = async (newLevel: number) => {
    if (!levelTarget) return
    setLevelLoading(true)
    try {
      await updateUserLevel(levelTarget.id, newLevel)
      message.success('等级调整成功')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === levelTarget.id ? { ...u, level: newLevel } : u
        )
      )
      setLevelTarget(null)
    } catch (err) {
      console.error('[AdminUsers] update level failed:', err)
      message.error('等级调整失败')
    } finally {
      setLevelLoading(false)
    }
  }

  // 调整积分
  const handleConfirmCredits = async () => {
    if (!creditsTarget) return
    try {
      const values = await creditsForm.validateFields()
      setCreditsLoading(true)
      await adjustUserCredits(creditsTarget.id, {
        amount: values.amount,
        remark: values.remark || ''
      })
      message.success('积分调整成功')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === creditsTarget.id
            ? { ...u, creditsBalance: u.creditsBalance + values.amount }
            : u
        )
      )
      setCreditsTarget(null)
      creditsForm.resetFields()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminUsers] credits adjust failed:', err)
      message.error('积分调整失败')
    } finally {
      setCreditsLoading(false)
    }
  }

  // 添加用户
  const handleCreateUser = async () => {
    try {
      const values = await createUserForm.validateFields()
      setCreateUserLoading(true)
      await createUser(values as CreateAdminUserDto)
      message.success('用户添加成功')
      setCreateUserOpen(false)
      createUserForm.resetFields()
      // 刷新列表
      await loadUsers()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AdminUsers] create user failed:', err)
      message.error('添加用户失败')
    } finally {
      setCreateUserLoading(false)
    }
  }

  // 删除用户
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await deleteUser(deleteTarget.id)
      message.success('用户已删除')
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setTotal((prev) => prev - 1)
      setDeleteTarget(null)
    } catch (err) {
      console.error('[AdminUsers] delete failed:', err)
      message.error('删除用户失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns: TableColumnsType<AdminUserItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (v: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
    },
    { title: '邮箱', dataIndex: 'email', key: 'email', ellipsis: true },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (v?: string) => v || '-'
    },
    {
      title: '等级',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (lv: number) => <Tag color="purple">Lv{lv}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: UserStatus) =>
        s === 'active' ? (
          <Tag className={styles.tagActive}>正常</Tag>
        ) : (
          <Tag className={styles.tagBanned}>已封禁</Tag>
        )
    },
    {
      title: '积分余额',
      dataIndex: 'creditsBalance',
      key: 'creditsBalance',
      width: 120,
      render: (v: number) => (
        <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
      )
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 360,
      fixed: 'right',
      render: (_: unknown, record: AdminUserItem) => (
        <>
          <Button type="link" size="small" icon={<EyeOutlined />}>
            详情
          </Button>
          {record.status === 'active' ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => {
                setBanTarget(record)
                banForm.resetFields()
              }}
            >
              封禁
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleUnban(record)}
            >
              解封
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<CrownOutlined />}
            onClick={() => setLevelTarget(record)}
          >
            调整等级
          </Button>
          <Button
            type="link"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => {
              setCreditsTarget(record)
              creditsForm.resetFields()
            }}
          >
            调整积分
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setDeleteTarget(record)}
          >
            删除
          </Button>
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <SearchOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>用户管理</h1>
            <div className={styles.subtitle}>查询与管理平台用户</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadUsers}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => {
            setCreateUserOpen(true)
            createUserForm.resetFields()
          }}
        >
          添加用户
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="用户名 / 邮箱 / 手机号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            className={styles.searchBox}
            allowClear
          />
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v as UserStatus | '')}
            className={styles.filterSelect}
            options={STATUS_OPTIONS}
            allowClear
          />
          <Select
            placeholder="等级"
            value={level}
            onChange={(v) => setLevel(v ?? '')}
            className={styles.filterSelect}
            options={LEVEL_OPTIONS}
            allowClear
          />
          <RangePicker
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
          />
        </div>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className={styles.primaryBtn}>
          查询
        </Button>
        <Button onClick={handleReset} className={styles.ghostBtn}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {users.length === 0 && !loading ? (
          <Empty description="暂无用户" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminUserItem>
              rowKey="id"
              columns={columns}
              dataSource={users}
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

      {/* 封禁 Modal */}
      <Modal
        title={`封禁用户 - ${banTarget?.username || ''}`}
        open={!!banTarget}
        onCancel={() => setBanTarget(null)}
        onOk={handleConfirmBan}
        confirmLoading={banLoading}
        okText="确认封禁"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form<BanFormValues> form={banForm} layout="vertical">
          <Form.Item
            name="reason"
            label="封禁原因"
            rules={[{ required: true, message: '请输入封禁原因' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入封禁原因(将记录到操作日志)"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 调整等级 Modal */}
      <Modal
        title={`调整等级 - ${levelTarget?.username || ''}`}
        open={!!levelTarget}
        onCancel={() => setLevelTarget(null)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: '#94a3b8', marginBottom: 12 }}>
          当前等级:Lv{levelTarget?.level}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((lv) => (
            <Button
              key={lv}
              type={levelTarget?.level === lv ? 'primary' : 'default'}
              onClick={() => handleConfirmLevel(lv)}
              loading={levelLoading}
              disabled={levelTarget?.level === lv}
            >
              Lv{lv}
            </Button>
          ))}
        </div>
      </Modal>

      {/* 调整积分 Modal */}
      <Modal
        title={`调整积分 - ${creditsTarget?.username || ''}`}
        open={!!creditsTarget}
        onCancel={() => {
          setCreditsTarget(null)
          creditsForm.resetFields()
        }}
        onOk={handleConfirmCredits}
        confirmLoading={creditsLoading}
        okText="确认调整"
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ color: '#94a3b8', marginBottom: 12 }}>
          当前积分余额: {creditsTarget?.creditsBalance?.toLocaleString()}
        </p>
        <Form<CreditsAdjustFormValues> form={creditsForm} layout="vertical">
          <Form.Item
            name="amount"
            label="调整数量（正数增加，负数扣减）"
            rules={[
              { required: true, message: '请输入调整数量' },
              {
                validator: (_, v) =>
                  v && v !== 0
                    ? Promise.resolve()
                    : Promise.reject(new Error('数量不能为 0'))
              }
            ]}
          >
            <Input type="number" placeholder="如 1000 或 -500" />
          </Form.Item>
          <Form.Item
            name="remark"
            label="备注原因"
            rules={[{ required: true, message: '请输入调整原因' }]}
          >
            <Input.TextArea
              rows={2}
              placeholder="调整原因(将记录到操作日志)"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加用户 Modal */}
      <Modal
        title="添加用户"
        open={createUserOpen}
        onCancel={() => {
          setCreateUserOpen(false)
          createUserForm.resetFields()
        }}
        onOk={handleCreateUser}
        confirmLoading={createUserLoading}
        okText="添加"
        cancelText="取消"
        destroyOnClose
      >
        <Form<CreateUserFormValues> form={createUserForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, message: '用户名至少 2 个字符' },
              { max: 64, message: '用户名不超过 64 个字符' },
              {
                pattern: /^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/,
                message: '用户名仅支持字母、数字、下划线、连字符和中文'
              }
            ]}
          >
            <Input placeholder="登录用户名" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 个字符' },
              { max: 128, message: '密码不超过 128 个字符' }
            ]}
          >
            <Input.Password placeholder="用户登录密码" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' }
            ]}
          >
            <Input placeholder="user@example.com" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { pattern: /^\d{0,20}$/, message: '手机号格式不正确' }
            ]}
          >
            <Input placeholder="选填" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="level"
            label="初始等级"
            initialValue={0}
          >
            <Select
              options={[0, 1, 2, 3, 4, 5].map((n) => ({
                label: `Lv${n}`,
                value: n
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 删除用户确认 Modal */}
      <Modal
        title={`删除用户 - ${deleteTarget?.username || ''}`}
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onOk={handleConfirmDelete}
        confirmLoading={deleteLoading}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <p style={{ color: '#f87171', marginBottom: 8 }}>
          此操作将永久删除该用户及其关联数据（积分账户、积分流水、设备绑定），不可恢复！
        </p>
        <p style={{ color: '#94a3b8' }}>
          用户名: {deleteTarget?.username}
          <br />
          邮箱: {deleteTarget?.email}
          <br />
          当前积分余额: {deleteTarget?.creditsBalance?.toLocaleString()}
        </p>
      </Modal>
    </div>
  )
}
