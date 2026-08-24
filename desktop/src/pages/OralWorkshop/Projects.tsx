/**
 * 口播工坊 · 项目列表（M6-2）
 * 任务列表：分页 + 状态筛选 + 一键创建入口
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Select, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Clapperboard, Plus, RefreshCw, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cancelOralWorkshopJob, listOralWorkshopJobs } from '@/api/oral-workshop-api'
import type { OralWorkshopJob, OralWorkshopJobStatus } from '@/types/oral-workshop'
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

  const handleCancel = async (id: number) => {
    try {
      await cancelOralWorkshopJob(id)
      message.success('任务已取消，预扣 Credits 已退还')
      void load()
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
