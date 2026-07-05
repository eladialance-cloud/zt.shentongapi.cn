// 对账中心页 - SubTask 24.4
//
// 4 个 Tab:流水vs余额 / Token用量 / 支付流水 / Key池扣减
// 每个 Tab 展示对应差异列表(表格):用户 ID/差异金额/详情/状态(pending/resolved/ignored)/时间/操作
// 操作:手动调整(modal 输入金额 + 备注)/标记忽略
// 顶部统计卡片:总差异数/待处理/已处理/总差异金额
// API: GET /admin/reconciliation/diffs、POST /admin/reconciliation/:id/adjust、POST /admin/reconciliation/:id/ignore

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
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
  AimOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import {
  adjustReconciliationDiff,
  getReconciliationStats,
  ignoreReconciliationDiff,
  listReconciliationDiffs
} from '@/api/admin-finance-api'
import type {
  ReconciliationDiff,
  ReconciliationStats,
  ReconciliationStatus,
  ReconciliationType
} from '@/types/admin-finance'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const PAGE_SIZE = 20

const TYPE_TABS: Array<{ key: ReconciliationType; label: string }> = [
  { key: 'credit_balance', label: '流水vs余额' },
  { key: 'token_usage', label: 'Token用量' },
  { key: 'payment', label: '支付流水' },
  { key: 'key_pool_deduction', label: 'Key池扣减' }
]

const STATUS_TAG: Record<ReconciliationStatus, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待处理' },
  resolved: { color: 'green', text: '已处理' },
  ignored: { color: 'default', text: '已忽略' }
}

interface AdjustFormValues {
  amount: number
  remark: string
}

export default function FinanceReconciliation() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ReconciliationDiff[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<ReconciliationType>('credit_balance')
  const [stats, setStats] = useState<ReconciliationStats | null>(null)

  const [adjustTarget, setAdjustTarget] = useState<ReconciliationDiff | null>(null)
  const [adjustForm] = Form.useForm<AdjustFormValues>()
  const [adjustLoading, setAdjustLoading] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const data = await getReconciliationStats()
      setStats(data)
    } catch (err) {
      console.error('[FinanceReconciliation] load stats failed:', err)
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listReconciliationDiffs({
        type: tab,
        page,
        pageSize: PAGE_SIZE
      })
      const r = result as AdminPaginatedResult<ReconciliationDiff>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[FinanceReconciliation] load failed:', err)
      message.error('加载差异列表失败')
    } finally {
      setLoading(false)
    }
  }, [tab, page])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleTabChange = (key: string) => {
    setTab(key as ReconciliationType)
    setPage(1)
  }

  const handleConfirmAdjust = async () => {
    if (!adjustTarget) return
    try {
      const values = await adjustForm.validateFields()
      setAdjustLoading(true)
      await adjustReconciliationDiff(adjustTarget.id, {
        amount: values.amount,
        remark: values.remark
      })
      message.success('调整成功')
      setItems((prev) =>
        prev.map((it) =>
          it.id === adjustTarget.id
            ? {
                ...it,
                status: 'resolved',
                resolvedAt: new Date().toISOString(),
                resolveRemark: values.remark
              }
            : it
        )
      )
      setAdjustTarget(null)
      adjustForm.resetFields()
      void loadStats()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[FinanceReconciliation] adjust failed:', err)
      message.error('调整失败')
    } finally {
      setAdjustLoading(false)
    }
  }

  const handleIgnore = async (item: ReconciliationDiff) => {
    try {
      await ignoreReconciliationDiff(item.id)
      message.success('已标记忽略')
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'ignored' } : it
        )
      )
      void loadStats()
    } catch (err) {
      console.error('[FinanceReconciliation] ignore failed:', err)
      message.error('操作失败')
    }
  }

  const statCards = [
    {
      label: '总差异数',
      value: stats?.total ?? 0,
      icon: <AuditOutlined />,
      iconClass: styles.statIconBlue
    },
    {
      label: '待处理',
      value: stats?.pending ?? 0,
      icon: <ClockCircleOutlined />,
      iconClass: styles.statIconOrange
    },
    {
      label: '已处理',
      value: stats?.resolved ?? 0,
      icon: <AimOutlined />,
      iconClass: styles.statIconGreen
    },
    {
      label: '总差异金额',
      value: stats?.totalDiffAmount ?? 0,
      icon: <AuditOutlined />,
      iconClass: styles.statIconRed
    }
  ]

  const columns: TableColumnsType<ReconciliationDiff> = [
    {
      title: '用户 ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 110,
      render: (v: number, r: ReconciliationDiff) => (
        <span style={{ color: '#94a3b8' }}>
          #{v}
          {r.username ? ` ${r.username}` : ''}
        </span>
      )
    },
    {
      title: '差异金额',
      dataIndex: 'diffAmount',
      key: 'diffAmount',
      width: 130,
      render: (v: number) => (
        <span className={v >= 0 ? styles.amountPositive : styles.amountNegative}>
          {v >= 0 ? '+' : ''}
          {v.toLocaleString()}
        </span>
      )
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (v: string) => <span style={{ color: '#c7d2fe' }}>{v}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: ReconciliationStatus) => (
        <Tag color={STATUS_TAG[s].color}>{STATUS_TAG[s].text}</Tag>
      )
    },
    {
      title: '时间',
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
      render: (_: unknown, record: ReconciliationDiff) => (
        <>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setAdjustTarget(record)
                  adjustForm.resetFields()
                  adjustForm.setFieldsValue({ amount: record.diffAmount, remark: '' })
                }}
              >
                手动调整
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => void handleIgnore(record)}
              >
                标记忽略
              </Button>
            </>
          )}
          {record.status !== 'pending' && (
            <span style={{ color: '#8b949e' }}>
              {record.resolveRemark || '-'}
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
          <AuditOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>对账中心</h1>
            <div className={styles.subtitle}>核对各类业务数据一致性</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            void loadList()
            void loadStats()
          }}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      {/* 顶部统计卡片 */}
      <div className={styles.statsGrid}>
        {statCards.map((c) => (
          <Card key={c.label} className={styles.statCard} bordered={false}>
            <div className={styles.statCardBody}>
              <div className={`${styles.statIcon} ${c.iconClass}`}>{c.icon}</div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>{c.label}</span>
                <span className={styles.statValue}>
                  {c.value.toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={TYPE_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无差异" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<ReconciliationDiff>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              size="middle"
              scroll={{ x: 1080 }}
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

      {/* 手动调整 Modal */}
      <Modal
        title={`手动调整 - #${adjustTarget?.id ?? ''}`}
        open={!!adjustTarget}
        onCancel={() => setAdjustTarget(null)}
        onOk={handleConfirmAdjust}
        confirmLoading={adjustLoading}
        okText="确认调整"
        cancelText="取消"
        destroyOnClose
      >
        <Form<AdjustFormValues> form={adjustForm} layout="vertical">
          <Form.Item
            name="amount"
            label="调整金额(正为补入,负为扣减)"
            rules={[{ required: true, message: '请输入调整金额' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="remark"
            label="备注"
            rules={[{ required: true, message: '请输入备注' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入调整原因/备注"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
