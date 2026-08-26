/**
 * 口播工坊 · 项目列表（M6-2）
 * 任务列表：分页 + 状态筛选 + 一键创建入口
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Popconfirm, Select, Statistic, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Clapperboard, PlayCircle, Plus, RefreshCw, Trash2, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  cancelOralWorkshopJob,
  deleteOralWorkshopJob,
  getJobStats,
  listOralWorkshopJobs,
  retryOralWorkshopJob,
} from '@/api/oral-workshop-api'
import type { JobStats, OralWorkshopJob, OralWorkshopJobStatus } from '@/types/oral-workshop'
import { useCreditsStore } from '@/store/credits'
import styles from './styles.module.css'

export const STATUS_META: Record<OralWorkshopJobStatus, { label: string; color: string }> = {
  pending: { label: '排队中', color: 'default' },
  processing: { label: '生成中', color: 'processing' },
  done: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
}

const STATUS_OPTIONS = (Object.keys(STATUS_META) as OralWorkshopJobStatus[]).map((s) => ({
  value: s,
  label: STATUS_META[s].label,
}))

export function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false })
}

export default function OralWorkshopProjects() {
  const navigate = useNavigate()
  const [list, setList] = useState<OralWorkshopJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<OralWorkshopJobStatus | undefined>()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<JobStats | null>(null)
  const [retryingId, setRetryingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listOralWorkshopJobs({
        page,
        pageSize,
        status,
      })
      setList(data.list)
      setTotal(data.total)
      const st = await getJobStats().catch(() => null)
      setStats(st)
    } catch (err) {
      const e = err as Error
      message.error('任务列表加载失败: ' + (e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status])

  useEffect(() => {
    void load()
  }, [load])

  const handleRetry = async (id: number) => {
    setRetryingId(id)
    try {
      await retryOralWorkshopJob(id)
      message.success('任务已重新入队执行')
      void load()
    } catch (err) {
      const e = err as Error
      message.error('重试失败: ' + (e?.message ?? e))
    } finally {
      setRetryingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteOralWorkshopJob(id)
      message.success('任务已删除')
      void load()
    } catch (err) {
      const e = err as Error
      message.error('删除失败: ' + (e?.message ?? e))
    }
  }

  const handleCancel = async (id: number) => {
    try {
      await cancelOralWorkshopJob(id)
      message.success('任务已取消，预扣 Credits 已退还')
      void load()
      void useCreditsStore.getState().fetchBalance()
    } catch (err) {
      const e = err as Error
      message.error('取消失败: ' + (e?.message ?? e))
    }
  }

  const columns: ColumnsType<OralWorkshopJob> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 72,
      render: (v: number) => '#' + v,
    },
    {
      title: '文案',
      dataIndex: 'scriptInput',
      ellipsis: true,
      render: (v: string | null) => v || '--',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: OralWorkshopJobStatus) => {
        const meta = STATUS_META[v] ?? { label: v, color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '当前步骤',
      dataIndex: 'currentStep',
      width: 120,
      render: (v: string | null) => v || '--',
    },
    {
      title: 'Credits',
      dataIndex: 'creditsCost',
      width: 90,
      render: (v: number) => (v > 0 ? v : '--'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => formatTime(v),
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <span className={styles.rowActions}>
          <Button type="link" size="small" icon={<Eye size={14} />} onClick={() => navigate('/oral-workshop/' + record.id)}>
            详情
          </Button>
          {(record.status === 'pending' || record.status === 'processing') && (
            <Button type="link" size="small" danger onClick={() => void handleCancel(record.id)}>
              取消
            </Button>
          )}
          {record.status === 'failed' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircle size={14} />}
              loading={retryingId === record.id}
              onClick={() => void handleRetry(record.id)}
            >
              重试
            </Button>
          )}
          <Popconfirm title="确定删除该任务？删除后不可恢复。" onConfirm={() => void handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<Trash2 size={14} />}>
              删除
            </Button>
          </Popconfirm>
        </span>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>
            <Clapperboard size={17} strokeWidth={2} />
          </span>
          <div>
            <h1 className={styles.title}>口播工坊</h1>
            <div className={styles.subtitle}>我的口播短视频生成任务</div>
          </div>
        </div>
        <div className={styles.headActions}>
          <Button icon={<RefreshCw size={14} />} onClick={() => void load()}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => navigate('/oral-workshop/workbench')}
            className={styles.primaryBtn}
          >
            新建任务
          </Button>
        </div>
      </header>

      {stats && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            padding: 16,
            marginBottom: 16,
            background: 'var(--color-bg-container)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
          }}
        >
          <Statistic title="全部任务" value={stats.total} />
          <Statistic title="排队中" value={stats.pending} />
          <Statistic title="生成中" value={stats.processing} />
          <Statistic title="已完成" value={stats.done} valueStyle={{ color: '#52c41a' }} />
          <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} />
          <Statistic title="已取消" value={stats.cancelled} />
        </div>
      )}

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>状态</span>
        <Select
          allowClear
          placeholder="全部状态"
          style={{ width: 160 }}
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setPage(1)
            setStatus(v)
          }}
        />
        <span className={styles.totalText}>共 {total} 条</span>
      </div>

      <Table<OralWorkshopJob>
        className={styles.darkTable}
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => '共 ' + t + ' 条',
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
      />
    </div>
  )
}
