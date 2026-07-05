// 管理端操作日志查询页 - SubTask 17.4
//
// 功能：
// - 筛选条件:操作人/操作类型/时间范围
// - 表格展示:时间/操作人/操作类型/目标资源/IP/详情
// - 分页
// - API: GET /admin/operation-logs?userId=&type=&startTime=&endTime=&page=&pageSize=

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Empty,
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
import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { listOperationLogs } from '@/api/admin-auth-api'
import type {
  AdminPaginatedResult,
  OperationLog,
  OperationType
} from '@/types/admin-auth'
import styles from './styles.module.css'

const { RangePicker } = DatePicker

const PAGE_SIZE = 20

const OPERATION_TYPE_OPTIONS: Array<{ label: string; value: OperationType }> = [
  { label: '全部', value: 'other' },
  { label: '创建', value: 'create' },
  { label: '更新', value: 'update' },
  { label: '删除', value: 'delete' },
  { label: '登录', value: 'login' },
  { label: '登出', value: 'logout' },
  { label: '封禁', value: 'ban' },
  { label: '解封', value: 'unban' },
  { label: '调整', value: 'adjust' },
  { label: '审批', value: 'approve' },
  { label: '驳回', value: 'reject' },
  { label: '退款', value: 'refund' },
  { label: '配置', value: 'config' }
]

const TYPE_TAG_COLOR: Record<OperationType, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'cyan',
  logout: 'default',
  ban: 'volcano',
  unban: 'lime',
  adjust: 'orange',
  approve: 'geekblue',
  reject: 'magenta',
  refund: 'gold',
  config: 'purple',
  other: 'default'
}

const TYPE_LABEL: Record<OperationType, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  login: '登录',
  logout: '登出',
  ban: '封禁',
  unban: '解封',
  adjust: '调整',
  approve: '审批',
  reject: '驳回',
  refund: '退款',
  config: '配置',
  other: '其他'
}

export default function AdminOperationLogs() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState<string>('')
  const [type, setType] = useState<OperationType | ''>('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailText, setDetailText] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const query: Record<string, unknown> = { page, pageSize: PAGE_SIZE }
      if (userId.trim()) {
        const n = Number(userId.trim())
        if (!Number.isNaN(n)) query.userId = n
      }
      if (type) query.type = type
      if (range && range[0] && range[1]) {
        query.startTime = range[0].toISOString()
        query.endTime = range[1].toISOString()
      }
      const result = await listOperationLogs(query)
      const r = result as AdminPaginatedResult<OperationLog>
      setLogs(r.list || [])
      setTotal(r.total || 0)
    } catch (err) {
      console.error('[OperationLogs] load failed:', err)
      message.error('加载操作日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, userId, type, range])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const handleSearch = () => {
    setPage(1)
    void loadLogs()
  }

  const handleReset = () => {
    setUserId('')
    setType('')
    setRange(null)
    setPage(1)
  }

  const columns: TableColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '操作人',
      key: 'user',
      width: 160,
      render: (_: unknown, r: OperationLog) => (
        <span style={{ color: '#c7d2fe' }}>
          {r.username}
          <span style={{ color: '#6e7681', marginLeft: 4 }}>#{r.userId}</span>
        </span>
      )
    },
    {
      title: '操作类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: OperationType) => (
        <Tag color={TYPE_TAG_COLOR[t]}>{TYPE_LABEL[t]}</Tag>
      )
    },
    {
      title: '目标资源',
      key: 'target',
      width: 200,
      render: (_: unknown, r: OperationLog) => (
        <span style={{ color: '#94a3b8' }}>
          {r.targetResource}
          {r.targetId ? ` #${r.targetId}` : ''}
        </span>
      )
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
      render: (ip: string) => <span style={{ color: '#94a3b8' }}>{ip}</span>
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (d: string) => (
        <span style={{ color: '#8b949e' }}>{d}</span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_: unknown, r: OperationLog) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          className={styles.ghostBtn}
          onClick={() => {
            setDetailText(r.detail || '(空)')
            setDetailOpen(true)
          }}
        >
          详情
        </Button>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <SearchOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>操作日志</h1>
            <div className={styles.subtitle}>查询管理员操作记录</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadLogs}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="操作人 ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onPressEnter={handleSearch}
            className={styles.searchBox}
            allowClear
          />
          <Select
            placeholder="操作类型"
            value={type}
            onChange={(v) => setType(v as OperationType | '')}
            className={styles.filterSelect}
            options={OPERATION_TYPE_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value
            }))}
            allowClear
          />
          <RangePicker
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
            showTime
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
        {logs.length === 0 && !loading ? (
          <Empty description="暂无日志" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<OperationLog>
              rowKey="id"
              columns={columns}
              dataSource={logs}
              pagination={false}
              size="middle"
              scroll={{ x: 960 }}
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

      <Modal
        title="日志详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={640}
      >
        <pre className={styles.detailPre}>{detailText}</pre>
      </Modal>
    </div>
  )
}
