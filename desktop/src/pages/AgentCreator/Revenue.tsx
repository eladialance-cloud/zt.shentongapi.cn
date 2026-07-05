// 收益中心
// SubTask 12.3: 累计/本月收益 + 调用次数 + 30 天趋势 + 提现申请列表 + 申请提现
// 调用 GET /agents/creator/revenue/summary、GET /agents/creator/withdrawals、POST /agents/creator/withdrawal

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Empty,
  Form,
  Input,
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
  ArrowLeftOutlined,
  DollarOutlined,
  WalletOutlined,
  RiseOutlined,
  FallOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import * as creatorApi from '@/api/agent-creator-api'
import type {
  RevenueSummary,
  WithdrawalRecord,
  WithdrawalStatus
} from '@/types/agent-creator'
import styles from './styles.module.css'

const PAGE_SIZE = 10

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 提现状态标签 */
function withdrawalStatusLabel(status: WithdrawalStatus): string {
  switch (status) {
    case 'pending':
      return '审核中'
    case 'approved':
      return '已通过'
    case 'rejected':
      return '已驳回'
    case 'completed':
      return '已完成'
    default:
      return status
  }
}

function withdrawalStatusColor(status: WithdrawalStatus): string {
  switch (status) {
    case 'pending':
      return 'gold'
    case 'approved':
      return 'blue'
    case 'rejected':
      return 'red'
    case 'completed':
      return 'green'
    default:
      return 'default'
  }
}

/** 计算趋势图最大值 */
function maxRevenue(items: RevenueSummary['dailyRevenue']): number {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.revenue), 1)
}

export default function AgentCreatorRevenue() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawForm] = Form.useForm<{ amount: number }>()
  const [withdrawing, setWithdrawing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, withdrawalsRes] = await Promise.all([
        creatorApi.getRevenueSummary(),
        creatorApi.listWithdrawals(page, PAGE_SIZE)
      ])
      setSummary(summaryRes)
      setWithdrawals(withdrawalsRes.list || [])
      setTotal(withdrawalsRes.total || 0)
    } catch (err) {
      console.error('[AgentCreatorRevenue] load failed:', err)
      message.error('加载收益数据失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 申请提现 */
  const handleWithdraw = async () => {
    try {
      const values = await withdrawForm.validateFields()
      if (values.amount <= 0) {
        message.error('提现金额必须大于 0')
        return
      }
      if (summary && values.amount > summary.availableBalance) {
        message.error('提现金额超出可提现余额')
        return
      }
      setWithdrawing(true)
      const record = await creatorApi.requestWithdrawal({ amount: values.amount })
      message.success(`提现申请已提交（${record.amount} 积分）`)
      setWithdrawOpen(false)
      withdrawForm.resetFields()
      void loadData()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[AgentCreatorRevenue] withdraw failed:', err)
      message.error('提现申请失败: ' + (err as Error).message)
    } finally {
      setWithdrawing(false)
    }
  }

  /** 提现记录表格列 */
  const columns: TableColumnsType<WithdrawalRecord> = [
    {
      title: '提现单号',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (v: number) => <span style={{ color: '#a5b4fc' }}>#{v}</span>
    },
    {
      title: '金额（积分）',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      render: (v: number) => (
        <span style={{ color: '#22d3ee', fontWeight: 600 }}>
          {v.toLocaleString()}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: WithdrawalStatus) => (
        <Tag color={withdrawalStatusColor(s)}>
          {withdrawalStatusLabel(s)}
        </Tag>
      )
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (v?: string) => (
        <span style={{ color: '#94a3b8' }}>{v || '-'}</span>
      )
    },
    {
      title: '申请时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    },
    {
      title: '处理时间',
      dataIndex: 'processedAt',
      key: 'processedAt',
      width: 180,
      render: (v?: string) => (v ? formatTime(v) : '-')
    }
  ]

  const trendMax = summary ? maxRevenue(summary.dailyRevenue) : 1

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <DollarOutlined />
          <span>收益中心</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/creator')}
          >
            返回列表
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {/* ===== 统计卡片 ===== */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <RiseOutlined style={{ marginRight: 4 }} />
              累计收益
            </div>
            <div className={styles.statValue}>
              {(summary?.totalRevenue ?? 0).toLocaleString()}
              <span className={styles.statUnit}>积分</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              本月收益
            </div>
            <div className={styles.statValue}>
              {(summary?.monthRevenue ?? 0).toLocaleString()}
              <span className={styles.statUnit}>积分</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <FallOutlined style={{ marginRight: 4 }} />
              累计调用次数
            </div>
            <div className={styles.statValue}>
              {(summary?.totalCalls ?? 0).toLocaleString()}
              <span className={styles.statUnit}>次</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              <WalletOutlined style={{ marginRight: 4 }} />
              可提现余额
            </div>
            <div className={styles.statValue}>
              {(summary?.availableBalance ?? 0).toLocaleString()}
              <span className={styles.statUnit}>积分</span>
            </div>
          </div>
        </div>

        {/* ===== 30 天收益趋势 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <RiseOutlined />
              最近 30 天收益趋势
            </span>
          </div>
          {summary && summary.dailyRevenue.length > 0 ? (
            <div className={styles.trendChart}>
              {summary.dailyRevenue.map((item) => {
                const heightPct = (item.revenue / trendMax) * 100
                return (
                  <div
                    key={item.date}
                    className={styles.trendBar}
                    style={{ height: `${Math.max(heightPct, 1)}%` }}
                  >
                    <div className={styles.trendBarTooltip}>
                      {item.date.slice(5)} · {item.revenue} 积分 / {item.calls} 次
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={styles.trendEmpty}>暂无收益数据</div>
          )}
        </div>

        {/* ===== 提现记录 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <WalletOutlined />
              提现记录
            </span>
            <Popconfirm
              title="申请提现"
              description="将打开提现表单"
              onConfirm={() => setWithdrawOpen(true)}
              okText="去提现"
              cancelText="取消"
              disabled={!summary || summary.availableBalance <= 0}
            >
              <Button
                type="primary"
                className={styles.primaryBtn}
                icon={<DollarOutlined />}
                disabled={!summary || summary.availableBalance <= 0}
              >
                申请提现
              </Button>
            </Popconfirm>
          </div>

          {withdrawals.length === 0 && !loading ? (
            <Empty description="暂无提现记录" />
          ) : (
            <Table<WithdrawalRecord>
              columns={columns}
              dataSource={withdrawals}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          )}

          {total > PAGE_SIZE && (
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      </Spin>

      {/* 提现弹窗 */}
      <Modal
        title="申请提现"
        open={withdrawOpen}
        onOk={handleWithdraw}
        onCancel={() => {
          setWithdrawOpen(false)
          withdrawForm.resetFields()
        }}
        confirmLoading={withdrawing}
        okText="提交申请"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={withdrawForm} layout="vertical">
          <Form.Item
            label="提现金额（积分）"
            name="amount"
            rules={[
              { required: true, message: '请输入提现金额' },
              {
                validator: (_, value: number) => {
                  if (value == null) return Promise.resolve()
                  if (value <= 0) return Promise.reject(new Error('金额必须大于 0'))
                  if (summary && value > summary.availableBalance) {
                    return Promise.reject(
                      new Error(
                        `金额超出可提现余额（${summary.availableBalance} 积分）`
                      )
                    )
                  }
                  return Promise.resolve()
                }
              }
            ]}
            extra={
              summary
                ? `可提现余额：${summary.availableBalance.toLocaleString()} 积分`
                : undefined
            }
          >
            <Input type="number" min={1} placeholder="请输入提现金额" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
