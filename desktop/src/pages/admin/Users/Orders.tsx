// 充值订单管理页 - SubTask 18.4
//
// 筛选:status/paymentMethod/时间范围
// 表格:订单号/用户/金额/积分/支付方式/状态/创建时间/支付时间/操作
// 操作:查看详情/退款(modal 原因)

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
  DollarOutlined
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { listRechargeOrders, refundOrder } from '@/api/admin-user-api'
import type { RechargeOrder, RechargeOrderStatus } from '@/types/admin-user'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const { RangePicker } = DatePicker
const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ label: string; value: RechargeOrderStatus | '' }> = [
  { label: '全部状态', value: '' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '失败', value: 'failed' },
  { label: '已退款', value: 'refunded' }
]

const PAYMENT_OPTIONS = [
  { label: '全部方式', value: '' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: 'Stripe', value: 'stripe' }
]

const STATUS_TAG: Record<RechargeOrderStatus, { color: string; text: string; cls?: string }> = {
  pending: { color: 'default', text: '待支付' },
  paid: { color: 'green', text: '已支付' },
  failed: { color: 'red', text: '失败' },
  refunded: { color: 'orange', text: '已退款' }
}

interface RefundFormValues {
  reason: string
}

export default function AdminRechargeOrders() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<RechargeOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<RechargeOrderStatus | ''>('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<RechargeOrder | null>(null)
  const [refundTarget, setRefundTarget] = useState<RechargeOrder | null>(null)
  const [refundForm] = Form.useForm<RefundFormValues>()
  const [refundLoading, setRefundLoading] = useState(false)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (status) query.status = status
      if (paymentMethod) query.paymentMethod = paymentMethod
      if (range && range[0] && range[1]) {
        query.startTime = range[0].toISOString()
        query.endTime = range[1].toISOString()
      }
      const result = await listRechargeOrders(query)
      const r = result as AdminPaginatedResult<RechargeOrder>
      setOrders(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[RechargeOrders] load failed:', err)
      message.error('加载订单列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, status, paymentMethod, range])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const handleSearch = () => {
    setPage(1)
    void loadOrders()
  }

  const handleReset = () => {
    setStatus('')
    setPaymentMethod('')
    setRange(null)
    setPage(1)
  }

  const handleConfirmRefund = async () => {
    if (!refundTarget) return
    try {
      const values = await refundForm.validateFields()
      setRefundLoading(true)
      await refundOrder(refundTarget.id, { reason: values.reason })
      message.success('退款已发起')
      setRefundTarget(null)
      refundForm.resetFields()
      setOrders((prev) =>
        prev.map((o) =>
          o.id === refundTarget.id ? { ...o, status: 'refunded' } : o
        )
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[RechargeOrders] refund failed:', err)
      message.error('退款失败')
    } finally {
      setRefundLoading(false)
    }
  }

  const columns: TableColumnsType<RechargeOrder> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 200,
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_: unknown, r: RechargeOrder) => (
        <span style={{ color: '#94a3b8' }}>
          {r.username} #{r.userId}
        </span>
      )
    },
    {
      title: '金额(元)',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      render: (v: number) => (
        <span style={{ color: '#fbbf24' }}>¥{v.toFixed(2)}</span>
      )
    },
    {
      title: '积分',
      dataIndex: 'credits',
      key: 'credits',
      width: 110,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
    },
    {
      title: '支付方式',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: RechargeOrderStatus) => (
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
      title: '支付时间',
      dataIndex: 'paidAt',
      key: 'paidAt',
      width: 170,
      render: (t?: string) => <span style={{ color: '#8b949e' }}>{t || '-'}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: RechargeOrder) => (
        <>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setDetailOrder(record)
              setDetailOpen(true)
            }}
          >
            详情
          </Button>
          {record.status === 'paid' && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => {
                setRefundTarget(record)
                refundForm.resetFields()
              }}
            >
              退款
            </Button>
          )}
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <DollarOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>充值订单管理</h1>
            <div className={styles.subtitle}>查询充值订单并处理退款</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadOrders}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => setStatus(v as RechargeOrderStatus | '')}
            className={styles.filterSelect}
            options={STATUS_OPTIONS}
            allowClear
          />
          <Select
            placeholder="支付方式"
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v || '')}
            className={styles.filterSelect}
            options={PAYMENT_OPTIONS}
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
        {orders.length === 0 && !loading ? (
          <Empty description="暂无订单" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<RechargeOrder>
              rowKey="id"
              columns={columns}
              dataSource={orders}
              pagination={false}
              size="middle"
              scroll={{ x: 1280 }}
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

      {/* 详情 Modal */}
      <Modal
        title="订单详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={520}
      >
        {detailOrder && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><strong style={{ color: '#94a3b8' }}>订单号:</strong> {detailOrder.orderNo}</div>
            <div><strong style={{ color: '#94a3b8' }}>用户:</strong> {detailOrder.username} #{detailOrder.userId}</div>
            <div><strong style={{ color: '#94a3b8' }}>金额:</strong> ¥{detailOrder.amount.toFixed(2)}</div>
            <div><strong style={{ color: '#94a3b8' }}>积分:</strong> {detailOrder.credits.toLocaleString()}</div>
            <div><strong style={{ color: '#94a3b8' }}>支付方式:</strong> {detailOrder.paymentMethod}</div>
            <div><strong style={{ color: '#94a3b8' }}>状态:</strong> {STATUS_TAG[detailOrder.status].text}</div>
            <div><strong style={{ color: '#94a3b8' }}>创建时间:</strong> {detailOrder.createdAt}</div>
            <div><strong style={{ color: '#94a3b8' }}>支付时间:</strong> {detailOrder.paidAt || '-'}</div>
          </div>
        )}
      </Modal>

      {/* 退款 Modal */}
      <Modal
        title={`退款 - ${refundTarget?.orderNo || ''}`}
        open={!!refundTarget}
        onCancel={() => setRefundTarget(null)}
        onOk={handleConfirmRefund}
        confirmLoading={refundLoading}
        okText="确认退款"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form<RefundFormValues> form={refundForm} layout="vertical">
          <Form.Item
            name="reason"
            label="退款原因"
            rules={[{ required: true, message: '请输入退款原因' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入退款原因"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
