// 积分流水查询页 - SubTask 24.1
//
// 筛选:userId/type/source/时间范围
// 表格:流水 ID/用户/类型/来源/金额(正绿负红)/操作前余额/操作后余额/关联 ID/备注/时间
// 分页 + 导出 CSV 按钮(前端生成)
// API: GET /admin/credits/transactions

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Empty,
  Input,
  Pagination,
  Select,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  TransactionOutlined
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { listCreditTransactions } from '@/api/admin-finance-api'
import type {
  CreditTransaction,
  CreditTransactionSource,
  CreditTransactionType
} from '@/types/admin-finance'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import styles from './styles.module.css'

const { RangePicker } = DatePicker
const PAGE_SIZE = 20

const TYPE_OPTIONS: Array<{ label: string; value: CreditTransactionType | '' }> = [
  { label: '全部类型', value: '' },
  { label: '充值', value: 'recharge' },
  { label: '消费', value: 'consume' },
  { label: '冻结', value: 'freeze' },
  { label: '结算', value: 'settle' },
  { label: '退款', value: 'refund' },
  { label: '奖励', value: 'reward' },
  { label: '管理员调整', value: 'admin_adjust' }
]

const TYPE_LABEL: Record<CreditTransactionType, string> = {
  recharge: '充值',
  consume: '消费',
  freeze: '冻结',
  settle: '结算',
  refund: '退款',
  reward: '奖励',
  admin_adjust: '管理员调整'
}

const TYPE_COLOR: Record<CreditTransactionType, string> = {
  recharge: 'green',
  consume: 'orange',
  freeze: 'blue',
  settle: 'cyan',
  refund: 'gold',
  reward: 'purple',
  admin_adjust: 'magenta'
}

const SOURCE_OPTIONS: Array<{ label: string; value: CreditTransactionSource | '' }> = [
  { label: '全部来源', value: '' },
  { label: '模型调用', value: 'model_call' },
  { label: '插件调用', value: 'plugin_call' },
  { label: '工作流调用', value: 'workflow_call' },
  { label: '知识库检索', value: 'kb_search' },
  { label: '充值', value: 'recharge' },
  { label: '管理员调整', value: 'admin_adjust' },
  { label: '注册奖励', value: 'signup_reward' }
]

const SOURCE_LABEL: Record<CreditTransactionSource, string> = {
  model_call: '模型调用',
  plugin_call: '插件调用',
  workflow_call: '工作流调用',
  kb_search: '知识库检索',
  recharge: '充值',
  admin_adjust: '管理员调整',
  signup_reward: '注册奖励'
}

export default function FinanceTransactions() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CreditTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [userIdText, setUserIdText] = useState('')
  const [type, setType] = useState<CreditTransactionType | ''>('')
  const [source, setSource] = useState<CreditTransactionSource | ''>('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      const uid = parseInt(userIdText, 10)
      if (userIdText && !Number.isNaN(uid)) query.userId = uid
      if (type) query.type = type
      if (source) query.source = source
      if (range && range[0] && range[1]) {
        query.startTime = range[0].toISOString()
        query.endTime = range[1].toISOString()
      }
      const result = await listCreditTransactions(query)
      const r = result as AdminPaginatedResult<CreditTransaction>
      setItems(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[FinanceTransactions] load failed:', err)
      message.error('加载流水列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, userIdText, type, source, range])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleSearch = () => {
    setPage(1)
    void loadList()
  }

  const handleReset = () => {
    setUserIdText('')
    setType('')
    setSource('')
    setRange(null)
    setPage(1)
  }

  const handleExportCSV = () => {
    if (items.length === 0) {
      message.warning('暂无可导出的数据')
      return
    }
    const header = [
      '流水ID',
      '流水号',
      '用户ID',
      '用户名',
      '类型',
      '来源',
      '金额',
      '操作前余额',
      '操作后余额',
      '关联ID',
      '备注',
      '时间'
    ]
    const lines = [header.join(',')]
    items.forEach((it) => {
      const row = [
        String(it.id),
        it.txNo,
        String(it.userId),
        it.username,
        TYPE_LABEL[it.type],
        SOURCE_LABEL[it.source],
        String(it.amount),
        String(it.balanceBefore),
        String(it.balanceAfter),
        it.relatedId || '',
        (it.remark || '').replace(/[\r\n,]/g, ' '),
        it.createdAt
      ]
      lines.push(row.map((c) => `"${c}"`).join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credit-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 CSV')
  }

  const columns: TableColumnsType<CreditTransaction> = [
    {
      title: '流水 ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_: unknown, r: CreditTransaction) => (
        <span style={{ color: '#94a3b8' }}>
          {r.username} #{r.userId}
        </span>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (t: CreditTransactionType) => (
        <Tag color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</Tag>
      )
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (s: CreditTransactionSource) => (
        <span style={{ color: '#c7d2fe' }}>{SOURCE_LABEL[s]}</span>
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      render: (v: number) => (
        <span className={v >= 0 ? styles.amountPositive : styles.amountNegative}>
          {v >= 0 ? '+' : ''}
          {v.toLocaleString()}
        </span>
      )
    },
    {
      title: '操作前余额',
      dataIndex: 'balanceBefore',
      key: 'balanceBefore',
      width: 120,
      render: (v: number) => <span style={{ color: '#94a3b8' }}>{v.toLocaleString()}</span>
    },
    {
      title: '操作后余额',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 120,
      render: (v: number) => <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
    },
    {
      title: '关联 ID',
      dataIndex: 'relatedId',
      key: 'relatedId',
      width: 140,
      render: (v?: string) => <span style={{ color: '#8b949e' }}>{v || '-'}</span>
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v?: string) => <span style={{ color: '#8b949e' }}>{v || '-'}</span>
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TransactionOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>积分流水查询</h1>
            <div className={styles.subtitle}>查询用户积分账户的所有流水记录</div>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
            className={styles.ghostBtn}
          >
            导出 CSV
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadList}
            className={styles.ghostBtn}
          >
            刷新
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="用户 ID"
            value={userIdText}
            onChange={(e) => setUserIdText(e.target.value)}
            className={styles.searchBox}
            allowClear
          />
          <Select
            placeholder="类型"
            value={type}
            onChange={(v) => setType(v as CreditTransactionType | '')}
            className={styles.filterSelect}
            options={TYPE_OPTIONS}
            allowClear
          />
          <Select
            placeholder="来源"
            value={source}
            onChange={(v) => setSource(v as CreditTransactionSource | '')}
            className={styles.filterSelect}
            options={SOURCE_OPTIONS}
            allowClear
          />
          <RangePicker
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
          />
        </div>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          className={styles.primaryBtn}
        >
          查询
        </Button>
        <Button onClick={handleReset} className={styles.ghostBtn}>
          重置
        </Button>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 && !loading ? (
          <Empty description="暂无流水" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<CreditTransaction>
              rowKey="id"
              columns={columns}
              dataSource={items}
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
    </div>
  )
}
