// 积分中心 - 流水查询页
// SubTask 6.3
// 筛选：时间范围（RangePicker）+ 来源类型（Select）+ 分页表格

import { useCallback, useEffect, useState } from 'react'
import {
  Table,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Spin,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  RollbackOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getTransactions } from '@/api/credits-api'
import type {
  CreditTransaction,
  CreditTransactionType,
  TransactionQuery,
  PaginatedResult
} from '@/types/credits'
import dayjs, { type Dayjs } from 'dayjs'
import styles from './styles.module.css'

const { RangePicker } = DatePicker

/** 来源类型选项 */
const SOURCE_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '对话调用', value: 'model_call' },
  { label: '插件调用', value: 'plugin_call' },
  { label: '工作流调用', value: 'workflow_call' },
  { label: '管理员调整', value: 'admin_adjust' },
  { label: '奖励', value: 'reward' }
]

/** 类型 → 标签颜色 */
const TYPE_COLOR: Record<CreditTransactionType, string> = {
  recharge: 'green',
  consume: 'red',
  freeze: 'orange',
  settle: 'blue',
  refund: 'cyan',
  reward: 'gold',
  admin_adjust: 'purple'
}

const TYPE_LABEL: Record<CreditTransactionType, string> = {
  recharge: '充值',
  consume: '消费',
  freeze: '冻结',
  settle: '结算',
  refund: '退款',
  reward: '奖励',
  admin_adjust: '管理员调整'
}

const PAGE_SIZE = 10

export default function Transactions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PaginatedResult<CreditTransaction>>({
    list: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 0
  })
  const [page, setPage] = useState(1)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [source, setSource] = useState<string>('')

  const loadData = useCallback(
    async (targetPage = page) => {
      setLoading(true)
      const query: TransactionQuery = {
        page: targetPage,
        pageSize: PAGE_SIZE
      }
      if (dateRange && dateRange[0] && dateRange[1]) {
        query.startDate = dateRange[0].format('YYYY-MM-DD')
        query.endDate = dateRange[1].format('YYYY-MM-DD')
      }
      if (source) query.source = source
      try {
        const result = await getTransactions(query)
        setData(result)
      } catch (err) {
        console.error('[Transactions] load failed:', err)
        message.error('加载流水失败')
      } finally {
        setLoading(false)
      }
    },
    [page, dateRange, source]
  )

  useEffect(() => {
    void loadData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    setPage(1)
    void loadData(1)
  }

  const handleReset = () => {
    setDateRange(null)
    setSource('')
    setPage(1)
    void loadData(1)
  }

  const columns: ColumnsType<CreditTransaction> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string | Date) =>
        dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (t: CreditTransactionType) => (
        <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t] || t}</Tag>
      )
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (s: string) => <span className={styles.sourceTag}>{s || '-'}</span>
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      render: (amount: number) => (
        <span className={amount >= 0 ? styles.amountPositive : styles.amountNegative}>
          {amount >= 0 ? '+' : ''}
          {amount}
        </span>
      )
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v: string) => v || '-'
    },
    {
      title: '余额',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 110,
      align: 'right',
      render: (v: number) => v?.toLocaleString?.() ?? '-'
    }
  ]

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <UnorderedListOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>流水查询</h1>
            <div className={styles.subtitle}>查看所有积分变动记录</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/credits')}
          className={styles.backBtn}
        >
          返回余额
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>时间范围：</span>
          <RangePicker
            value={dateRange}
            onChange={(range) => setDateRange(range as [Dayjs, Dayjs] | null)}
            allowClear
          />
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>来源类型：</span>
          <Select
            value={source}
            onChange={setSource}
            options={SOURCE_OPTIONS}
            style={{ width: 160 }}
            allowClear
          />
        </div>
        <Space>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
        </Space>
      </div>

      {/* 表格 */}
      <Spin spinning={loading}>
        <div className={styles.darkTable}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data.list}
            pagination={{
              current: data.page || page,
              pageSize: data.pageSize || PAGE_SIZE,
              total: data.total,
              showSizeChanger: false,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p) => {
                setPage(p)
                void loadData(p)
              }
            }}
            size="middle"
            locale={{ emptyText: '暂无流水记录' }}
          />
        </div>
      </Spin>
    </div>
  )
}
