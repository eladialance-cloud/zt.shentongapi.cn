// 管理端 GitHub 资产导入页
//
// 端点契约：
//   POST   /admin/imports            提交导入任务
//   GET    /admin/imports            任务列表
//   GET    /admin/imports/:id        任务详情（轮询进度）
//   POST   /admin/imports/:id/retry  重试失败任务
//   DELETE /admin/imports/:id?withDrafts=true  删除任务（可连带删除草稿资产，已发布自动跳过）

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import { CloudDownloadOutlined, DeleteOutlined, RedoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  IMPORT_TYPE_LABEL,
  createImport,
  deleteImport,
  getImport,
  listImports,
  retryImport
} from '@/api/admin-imports-api'
import type { ImportJob, ImportStep } from '@/types/admin-imports'
import styles from './styles.module.css'

const PAGE_SIZE = 10

const TYPE_OPTIONS = (Object.keys(IMPORT_TYPE_LABEL) as Array<keyof typeof IMPORT_TYPE_LABEL>).map((value) => ({
  value,
  label: IMPORT_TYPE_LABEL[value]
}))

const JOB_STATUS_TAG: Record<ImportJob['status'], { color: string; text: string }> = {
  pending: { color: 'default', text: '待处理' },
  processing: { color: 'processing', text: '处理中' },
  succeeded: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' }
}

function toAntdStepStatus(status: ImportStep['status']): 'wait' | 'process' | 'finish' | 'error' {
  if (status === 'running') return 'process'
  if (status === 'done') return 'finish'
  if (status === 'error') return 'error'
  return 'wait'
}

export default function AdminImports() {
  const [form] = Form.useForm<{ type: string; repoUrl: string; branch?: string }>()
  const [submitting, setSubmitting] = useState(false)
  const [list, setList] = useState<ImportJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  // 进度 Modal + 轮询
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressJob, setProgressJob] = useState<ImportJob | null>(null)
  const pollRef = useRef<number | null>(null)
  // 详情 Modal
  const [detailJob, setDetailJob] = useState<ImportJob | null>(null)
  // 删除确认 Modal
  const [deleteJob, setDeleteJob] = useState<ImportJob | null>(null)
  const [deleteWithDrafts, setDeleteWithDrafts] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listImports({ page, pageSize: PAGE_SIZE })
      setList(res.list)
      setTotal(res.total)
    } catch (e) {
      message.error((e as Error).message || '加载导入任务失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const startPolling = useCallback(
    (job: ImportJob) => {
      setProgressJob(job)
      setProgressOpen(true)
      stopPolling()
      pollRef.current = window.setInterval(async () => {
        try {
          const updated = await getImport(job.id)
          setProgressJob(updated)
          if (updated.status === 'succeeded' || updated.status === 'failed') {
            stopPolling()
            void loadList()
          }
        } catch {
          stopPolling()
        }
      }, 3000)
    },
    [loadList, stopPolling]
  )

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const job = await createImport({
        type: values.type as ImportJob['type'],
        repoUrl: values.repoUrl.trim(),
        branch: values.branch?.trim() || undefined
      })
      form.resetFields(['repoUrl', 'branch'])
      startPolling(job)
    } catch (e) {
      message.error((e as Error).message || '提交导入任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = async (job: ImportJob) => {
    try {
      const updated = await retryImport(job.id)
      startPolling(updated)
    } catch (e) {
      message.error((e as Error).message || '重试失败')
    }
  }


  const handleDelete = async () => {
    if (!deleteJob) return
    setDeleting(true)
    try {
      const res = await deleteImport(deleteJob.id, deleteWithDrafts)
      const parts = [`已删除导入任务 #${deleteJob.id}`]
      if (res.removedDrafts > 0) parts.push(`删除 ${res.removedDrafts} 个草稿资产`)
      if (res.skipped > 0) parts.push(`跳过 ${res.skipped} 个已发布/已上架资产`)
      message.success(parts.join('，'))
      setDeleteJob(null)
      setDeleteWithDrafts(true)
      void loadList()
    } catch (e) {
      message.error((e as Error).message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }
  const closeProgress = () => {
    stopPolling()
    setProgressOpen(false)
    setProgressJob(null)
  }

  const columns: TableColumnsType<ImportJob> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (v: ImportJob['type']) => <Tag color="blue">{IMPORT_TYPE_LABEL[v] ?? v}</Tag>
    },
    { title: '仓库', dataIndex: 'repoUrl', key: 'repoUrl', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: ImportJob['status']) => {
        const meta = JOB_STATUS_TAG[v] ?? { color: 'default', text: v }
        return <Tag color={meta.color}>{meta.text}</Tag>
      }
    },
    {
      title: '进度',
      key: 'steps',
      width: 100,
      render: (_: unknown, record: ImportJob) => {
        const steps = record.steps ?? []
        const doneCount = steps.filter((s) => s.status === 'done').length
        return `${doneCount}/${steps.length || 4}`
      }
    },
    {
      title: '错误',
      key: 'error',
      width: 110,
      render: (_: unknown, record: ImportJob) =>
        record.errorMessage ? (
          <Tooltip title={record.errorMessage}>
            <Tag color="red">失败原因</Tag>
          </Tooltip>
        ) : (
          <span style={{ color: '#64748b' }}>-</span>
        )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: ImportJob) => (
        <Space size={0}>
          {record.status === 'failed' && (
            <Button type="link" size="small" icon={<RedoOutlined />} onClick={() => void handleRetry(record)}>
              重试
            </Button>
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteJob(record)}>
            删除
          </Button>
          <Button type="link" size="small" onClick={() => setDetailJob(record)}>
            详情
          </Button>
        </Space>
      )
    }
  ]

  const stepItems = (progressJob?.steps ?? []).map((s) => ({
    title: s.label,
    status: toAntdStepStatus(s.status)
  }))

  return (
    <div>
      <Card className={styles.card} title="GitHub 资产导入" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" initialValues={{ type: 'agent' }}>
          <Form.Item name="type" label="资产类型" rules={[{ required: true, message: '请选择资产类型' }]}>
            <Select style={{ width: 140 }} options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="repoUrl"
            label="GitHub 仓库"
            rules={[
              { required: true, message: '请输入仓库地址' },
              { pattern: /^https:\/\/github\.com\//, message: '必须是 GitHub 仓库地址' }
            ]}
          >
            <Input placeholder="https://github.com/owner/repo" style={{ width: 340 }} />
          </Form.Item>
          <Form.Item name="branch" label="分支">
            <Input placeholder="默认分支" style={{ width: 130 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<CloudDownloadOutlined />} loading={submitting} onClick={() => void handleSubmit()}>
              提交导入
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className={styles.card}>
        <div className={styles.tableWrap}>
          <Table<ImportJob>
            rowKey="id"
            columns={columns}
            dataSource={list}
            loading={loading}
            pagination={false}
            scroll={{ x: 1000 }}
            size="middle"
          />
        </div>
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            total={total}
            pageSize={PAGE_SIZE}
            showSizeChanger={false}
            onChange={(p) => setPage(p)}
          />
        </div>
      </Card>

      {/* 导入进度 Modal */}
      <Modal
        title={progressJob ? `导入进度 #${progressJob.id}` : '导入进度'}
        open={progressOpen}
        onCancel={closeProgress}
        footer={null}
      >
        <div className={styles.progressModal}>
          <div className={styles.progressStep}>
            <Steps items={stepItems} />
          </div>
          {progressJob?.status === 'failed' && (
            <div className={styles.progressError}>
              <Alert type="error" showIcon message="导入失败" description={progressJob.errorMessage || '未知错误'} />
              <div className={styles.progressFooter}>
                <Button type="primary" icon={<RedoOutlined />} onClick={() => progressJob && handleRetry(progressJob)}>
                  重试
                </Button>
              </div>
            </div>
          )}
          {progressJob?.status === 'succeeded' && (
            <div className={styles.progressResult}>
              {(progressJob.result?.created?.length ?? 0) > 0 ? (
                <>
                  <Alert type="success" showIcon message={'导入成功，共 ' + progressJob.result!.created.length + ' 个资产'} />
                  <div className={styles.progressResultList}>
                    {progressJob.result!.created.map((item) => (
                      <div key={item.id} className={styles.progressResultItem}>
                        <Tag color="blue">{IMPORT_TYPE_LABEL[item.type] ?? item.type}</Tag>
                        <span>{item.name}</span>
                        <span className={styles.progressResultId}>#{item.id}</span>
                      </div>
                    ))}
                    {progressJob.result!.skipped > 0 && (
                      <div className={styles.progressResultItem}>已跳过 {progressJob.result!.skipped} 个重名资产</div>
                    )}
                  </div>
                </>
              ) : (
                <Alert type="warning" showIcon message="导入完成，但未解析到任何资产（任务已标记失败，见详情中的错误信息）" />
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 导入详情 Modal */}
      <Modal
        title={detailJob ? `导入详情 #${detailJob.id}` : '导入详情'}
        open={!!detailJob}
        onCancel={() => setDetailJob(null)}
        footer={null}
      >
        {detailJob && (
          <div className={styles.detailBody}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>类型</span>
              <Tag color="blue">{IMPORT_TYPE_LABEL[detailJob.type] ?? detailJob.type}</Tag>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>仓库</span>
              <span>{detailJob.repoUrl}</span>
            </div>
            {detailJob.branch && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>分支</span>
                <span>{detailJob.branch}</span>
              </div>
            )}
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>状态</span>
              <Tag color={JOB_STATUS_TAG[detailJob.status].color}>{JOB_STATUS_TAG[detailJob.status].text}</Tag>
            </div>
            <div className={styles.progressStep}>
              <Steps
                size="small"
                items={(detailJob.steps ?? []).map((s) => ({ title: s.label, status: toAntdStepStatus(s.status) }))}
              />
            </div>
            {detailJob.result && detailJob.result.created.length > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>产物</span>
                <div>
                  {detailJob.result.created.map((item) => (
                    <div key={item.id}>
                      {IMPORT_TYPE_LABEL[item.type] ?? item.type}：{item.name}（#{item.id}）
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailJob.result && detailJob.result.skipped > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>跳过</span>
                <span>{detailJob.result.skipped} 个重名资产</span>
              </div>
            )}
            {detailJob.errorMessage && <Alert type="error" showIcon message={detailJob.errorMessage} />}
          </div>
        )}
      </Modal>

      {/* 删除确认 Modal */}
      <Modal
        title={deleteJob ? `删除导入任务 #${deleteJob.id}` : "删除导入任务"}
        open={!!deleteJob}
        onCancel={() => { if (!deleting) setDeleteJob(null) }}
        okText="删除"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelButtonProps={{ disabled: deleting }}
        onOk={() => void handleDelete()}
      >
        {deleteJob && (
          <div>
            <Alert
              type="warning"
              showIcon
              message="删除后无法恢复"
              description={
                deleteJob.result?.created?.length
                  ? `该任务已导入 ${deleteJob.result.created.length} 个资产`
                  : "该任务暂无成功导入的资产"
              }
            />
            <div style={{ marginTop: 12 }}>
              <Checkbox
                checked={deleteWithDrafts}
                onChange={(e) => setDeleteWithDrafts(e.target.checked)}
                disabled={deleting}
              >
                连带删除导入的草稿资产（已发布/已上架的将自动跳过）
              </Checkbox>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
