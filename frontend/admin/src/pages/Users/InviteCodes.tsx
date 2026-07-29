// 邀请码管理页 - Tab 子组件
//
// 功能: 批量生成邀请码 / 列表查询 / 作废邀请码

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  GiftOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  generateInviteCodes,
  listInviteCodes,
  revokeInviteCode
} from '@/api/admin-user-api'
import type {
  GenerateInviteCodesDto,
  InviteCodeItem,
  InviteCodeStatus
} from '@/types/admin-user'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ label: string; value: InviteCodeStatus | '' }> = [
  { label: '全部状态', value: '' },
  { label: '可用', value: 'active' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' },
  { label: '已过期', value: 'expired' }
]

interface GenerateFormValues {
  count: number
  expireDays: number
}

function renderStatusTag(status: string): JSX.Element {
  if (status === 'active') {
    return <Tag className={styles.tagActive}>可用</Tag>
  }
  if (status === 'used') {
    return <Tag color="blue">已使用</Tag>
  }
  if (status === 'revoked') {
    return <Tag color="orange">已作废</Tag>
  }
  return <Tag color="default">已过期</Tag>
}

export default function InviteCodes() {
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<InviteCodeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<InviteCodeStatus | ''>('')

  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateForm] = Form.useForm<GenerateFormValues>()
  const [generateLoading, setGenerateLoading] = useState(false)

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (status) query.status = status
      const result = await listInviteCodes(query)
      const r = result as AdminPaginatedResult<InviteCodeItem>
      setCodes(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[InviteCodes] load failed:', err)
      message.error('加载邀请码列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => {
    void loadCodes()
  }, [loadCodes])

  const handleGenerate = async () => {
    try {
      const values = await generateForm.validateFields()
      setGenerateLoading(true)
      const dto: GenerateInviteCodesDto = {
        count: values.count,
        expireDays: values.expireDays
      }
      const result = await generateInviteCodes(dto)
      message.success(`成功生成 ${result.count} 个邀请码`)
      setGenerateOpen(false)
      generateForm.resetFields()
      setPage(1)
      void loadCodes()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return
      }
      console.error('[InviteCodes] generate failed:', err)
      message.error('生成邀请码失败')
    } finally {
      setGenerateLoading(false)
    }
  }

  const handleRevoke = async (item: InviteCodeItem) => {
    try {
      await revokeInviteCode(item.id)
      message.success('邀请码已作废')
      setCodes((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: 'revoked' } : c))
      )
    } catch (err) {
      console.error('[InviteCodes] revoke failed:', err)
      message.error('作废失败')
    }
  }

  const columns: TableColumnsType<InviteCodeItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '邀请码',
      dataIndex: 'code',
      key: 'code',
      render: (v: string) => (
        <span style={{ color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 500 }}>{v}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => renderStatusTag(s)
    },
    {
      title: '邀请人 ID',
      dataIndex: 'inviterId',
      key: 'inviterId',
      width: 100
    },
    {
      title: '被邀请人 ID',
      dataIndex: 'inviteeId',
      key: 'inviteeId',
      width: 110,
      render: (v: number | null) => (v ? v : '-')
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
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
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: InviteCodeItem) =>
        record.status === 'active' ? (
          <Popconfirm
            title="确认作废该邀请码？"
            description="作废后该邀请码将无法用于注册。"
            onConfirm={() => handleRevoke(record)}
            okText="确认作废"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              作废
            </Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#475569' }}>-</span>
        )
    }
  ]

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v as InviteCodeStatus | '')}
            className={styles.filterSelect}
            options={STATUS_OPTIONS}
            allowClear
          />
        </div>
        <Button
          type="primary"
          icon={<GiftOutlined />}
          onClick={() => {
            generateForm.resetFields()
            setGenerateOpen(true)
          }}
          className={styles.primaryBtn}
        >
          批量生成
        </Button>
        <Button icon={<ReloadOutlined />} onClick={loadCodes} className={styles.ghostBtn}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {codes.length === 0 && !loading ? (
          <Empty description="暂无邀请码" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<InviteCodeItem>
              rowKey="id"
              columns={columns}
              dataSource={codes}
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

      {/* 批量生成 Modal */}
      <Modal
        title="批量生成邀请码"
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={handleGenerate}
        confirmLoading={generateLoading}
        okText="生成"
        cancelText="取消"
        destroyOnClose
      >
        <Form<GenerateFormValues> form={generateForm} layout="vertical">
          <Form.Item
            name="count"
            label="生成数量"
            initialValue={10}
            rules={[
              { required: true, message: '请输入数量' },
              {
                validator: (_, value) =>
                  value >= 1 && value <= 100
                    ? Promise.resolve()
                    : Promise.reject(new Error('数量范围 1-100'))
              }
            ]}
          >
            <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="expireDays"
            label="有效期（天）"
            initialValue={30}
            rules={[
              { required: true, message: '请输入有效期' },
              {
                validator: (_, value) =>
                  value >= 1 && value <= 90
                    ? Promise.resolve()
                    : Promise.reject(new Error('有效期范围 1-90 天'))
              }
            ]}
          >
            <InputNumber min={1} max={90} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
