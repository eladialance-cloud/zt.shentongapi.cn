// 发票管理页 - SubTask 24.3
//
// Tab:待开具/已开具/已驳回
// 表格:申请 ID/用户/订单号/发票类型(个人/企业)/抬头/税号/金额/状态/申请时间/操作
// 操作:开具(modal 上传 PDF 或填写发票号)/驳回(modal 输入原因)
// API: GET /admin/invoices、POST /admin/invoices/:id/issue、POST /admin/invoices/:id/reject

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Spin,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  issueInvoice,
  listInvoices,
  rejectInvoice
} from '@/api/admin-finance-api'
import type {
  InvoiceItem,
  InvoiceStatus,
  InvoiceType
} from '@/types/admin-finance'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_LABEL: Record<InvoiceType, string> = {
  personal: '个人',
  enterprise: '企业'
}

const STATUS_TAG: Record<InvoiceStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待开具' },
  issued: { color: 'green', text: '已开具' },
  rejected: { color: 'red', text: '已驳回' }
}

interface IssueFormValues {
  invoiceNumber: string
  invoiceUrl: string
}

interface RejectFormValues {
  reason: string
}

export default function FinanceInvoices() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<InvoiceStatus>('pending')

  const [issueTarget, setIssueTarget] = useState<InvoiceItem | null>(null)
  const [issueForm] = Form.useForm<IssueFormValues>()
  const [issueLoading, setIssueLoading] = useState(false)

  const [rejectTarget, setRejectTarget] = useState<InvoiceItem | null>(null)
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [rejectLoading, setRejectLoading] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listInvoices({ status: tab, page, pageSize: PAGE_SIZE })
      const r = result as AdminPaginatedResult<InvoiceItem>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[FinanceInvoices] load failed:', err)
      message.error('加载发票列表失败')
    } finally {
      setLoading(false)
    }
  }, [tab, page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setTab(key as InvoiceStatus)
    setPage(1)
  }

  const handleConfirmIssue = async () => {
    if (!issueTarget) return
    try {
      const values = await issueForm.validateFields()
      setIssueLoading(true)
      await issueInvoice(issueTarget.id, {
        invoiceNumber: values.invoiceNumber,
        invoiceUrl: values.invoiceUrl || undefined
      })
      message.success('发票已开具')
      setItems((prev) =>
        prev.map((it) =>
          it.id === issueTarget.id
            ? {
                ...it,
                status: 'issued',
                invoiceNumber: values.invoiceNumber,
                invoiceUrl: values.invoiceUrl || undefined,
                issuedAt: new Date().toISOString()
              }
            : it
        )
      )
      setIssueTarget(null)
      issueForm.resetFields()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[FinanceInvoices] issue failed:', err)
      message.error('开具失败')
    } finally {
      setIssueLoading(false)
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectTarget) return
    try {
      const values = await rejectForm.validateFields()
      setRejectLoading(true)
      await rejectInvoice(rejectTarget.id, { reason: values.reason })
      message.success('已驳回')
      setItems((prev) =>
        prev.map((it) =>
          it.id === rejectTarget.id
            ? { ...it, status: 'rejected', rejectReason: values.reason }
            : it
        )
      )
      setRejectTarget(null)
      rejectForm.resetFields()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[FinanceInvoices] reject failed:', err)
      message.error('驳回失败')
    } finally {
      setRejectLoading(false)
    }
  }

  const columns: TableColumnsType<InvoiceItem> = [
    {
      title: '申请 ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_: unknown, r: InvoiceItem) => (
        <span style={{ color: '#94a3b8' }}>
          {r.username} #{r.userId}
        </span>
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 180,
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '发票类型',
      dataIndex: 'invoiceType',
      key: 'invoiceType',
      width: 100,
      render: (t: InvoiceType) => <Tag color="blue">{TYPE_LABEL[t]}</Tag>
    },
    {
      title: '抬头',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (v: string) => <span style={{ color: '#f1f5f9' }}>{v}</span>
    },
    {
      title: '税号',
      dataIndex: 'taxNo',
      key: 'taxNo',
      width: 160,
      render: (v?: string) => <span style={{ color: '#8b949e' }}>{v || '-'}</span>
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: InvoiceStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '申请时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: InvoiceItem) => (
        <>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => {
                  setIssueTarget(record)
                  issueForm.resetFields()
                }}
              >
                开具
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  setRejectTarget(record)
                  rejectForm.resetFields()
                }}
              >
                驳回
              </Button>
            </>
          )}
          {record.status === 'issued' && record.invoiceUrl && (
            <Button
              type="link"
              size="small"
              onClick={() => window.open(record.invoiceUrl, '_blank')}
            >
              查看发票
            </Button>
          )}
          {record.status === 'rejected' && (
            <span style={{ color: '#f87171' }}>
              {record.rejectReason || '已驳回'}
            </span>
          )}
        </>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <FileTextOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>发票管理</h1>
            <div className={styles.subtitle}>处理用户发票申请</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadList}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={[
          { key: 'pending', label: '待开具' },
          { key: 'issued', label: '已开具' },
          { key: 'rejected', label: '已驳回' }
        ]}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无发票" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<InvoiceItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1320 }}
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

      {/* 开具 Modal */}
      <Modal
        title={`开具发票 - ${issueTarget?.applyNo || ''}`}
        open={!!issueTarget}
        onCancel={() => setIssueTarget(null)}
        onOk={handleConfirmIssue}
        confirmLoading={issueLoading}
        okText="确认开具"
        cancelText="取消"
        destroyOnClose
      >
        <Form<IssueFormValues> form={issueForm} layout="vertical">
          <Form.Item
            name="invoiceNumber"
            label="发票号"
            rules={[{ required: true, message: '请输入发票号' }]}
          >
            <Input placeholder="请输入发票号" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="invoiceUrl"
            label="发票 PDF URL(可选)"
            extra="可填写 PDF 文件地址,留空表示仅登记发票号"
          >
            <Input placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回 Modal */}
      <Modal
        title={`驳回发票 - ${rejectTarget?.applyNo || ''}`}
        open={!!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onOk={handleConfirmReject}
        confirmLoading={rejectLoading}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form<RejectFormValues> form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label="驳回原因"
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入驳回原因"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
