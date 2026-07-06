// GitHub 仓库异步导入弹窗 - Task 7
//
// 表单: repoUrl / targetStatus / defaultModelId / dryRun / overwriteExisting
// 提交后调用 importGithubAgent(dto) 拿到 taskId，setInterval 每 2s 轮询 getImportGithubTask
// Progress 展示进度，Statistic 展示 stats，Table 展示 errors，Alert 展示任务级 errorMessage
// 任务进行中关闭弹窗需二次确认；任务 success 后调用 onSuccess 让父组件刷新列表
// 弹窗关闭/组件卸载时通过 useEffect cleanup 清理 setInterval

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Checkbox,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Statistic,
  Table,
  Tag,
  message
} from 'antd'
import type { ProgressProps } from 'antd'
import type { TableColumnsType } from 'antd'
import { getImportGithubTask, importGithubAgent } from '@/api/admin-agent-api'
import type {
  ImportGithubDto,
  ImportGithubTask,
  ImportStats,
  ImportTargetStatus
} from '@/types/admin-agent'
import styles from './styles.module.css'

interface ImportFormValues {
  repoUrl: string
  targetStatus: ImportTargetStatus
  defaultModelId: string
  dryRun: boolean
  overwriteExisting: boolean
}

interface ImportGithubModalProps {
  open: boolean
  onClose: () => void
  /** 任务成功后调用，父组件刷新列表 */
  onSuccess?: () => void
}

const TARGET_STATUS_OPTIONS: Array<{ label: string; value: ImportTargetStatus }> = [
  { label: '上架 (published)', value: 'published' },
  { label: '待审核 (pending_review)', value: 'pending_review' },
  { label: '草稿 (draft)', value: 'draft' }
]

const POLL_INTERVAL_MS = 2000
const MAX_DISPLAYED_ERRORS = 50

type ImportErrorRow = { filePath: string; error: string }

export default function ImportGithubModal({
  open,
  onClose,
  onSuccess
}: ImportGithubModalProps) {
  const [form] = Form.useForm<ImportFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<ImportGithubTask | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  // 用 ref 持有最新 onSuccess，避免轮询 effect 依赖 onSuccess 变化而重启
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  // 弹窗关闭时重置状态（state setter 安全，不操作已销毁的 Form DOM）
  useEffect(() => {
    if (!open) {
      setPolling(false)
      setTaskId(null)
      setTask(null)
      setSubmitting(false)
    }
  }, [open])

  // 轮询 effect：polling && taskId 时启动 setInterval，cleanup 清理
  useEffect(() => {
    if (!polling || !taskId) return

    let cancelled = false

    const fetchTask = async () => {
      try {
        const t = await getImportGithubTask(taskId)
        if (cancelled) return
        setTask(t)
        if (t.status === 'success' || t.status === 'failed') {
          setPolling(false)
          if (t.status === 'success') {
            message.success('GitHub Agent 导入成功')
            onSuccessRef.current?.()
          } else {
            message.error(`导入失败: ${t.errorMessage || '未知错误'}`)
          }
        }
      } catch (err) {
        if (cancelled) return
        console.error('[ImportGithubModal] poll failed:', err)
        setPolling(false)
        message.error('查询导入任务状态失败')
      }
    }

    void fetchTask()
    const intervalId = setInterval(() => void fetchTask(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [polling, taskId])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      setTask(null)
      const dto: ImportGithubDto = {
        repoUrl: values.repoUrl.trim(),
        targetStatus: values.targetStatus,
        defaultModelId: values.defaultModelId.trim() || undefined,
        dryRun: values.dryRun,
        overwriteExisting: values.overwriteExisting
      }
      const res = await importGithubAgent(dto)
      message.success('已提交导入任务')
      setTaskId(res.taskId)
      setPolling(true)
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[ImportGithubModal] import failed:', err)
      message.error('提交导入任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (polling) {
      Modal.confirm({
        title: '任务进行中',
        content: '导入任务正在进行中，关闭弹窗将停止轮询（后端任务不会取消）。确定要关闭吗？',
        okText: '关闭',
        cancelText: '继续等待',
        onOk: () => onClose()
      })
      return
    }
    onClose()
  }

  const isRunning = polling || submitting
  const stats: ImportStats | null = task?.stats ?? null
  const errors: ImportErrorRow[] = stats?.errors ?? []
  const errorsTruncated = errors.length >= MAX_DISPLAYED_ERRORS

  const errorColumns: TableColumnsType<ImportErrorRow> = [
    {
      title: '文件路径',
      dataIndex: 'filePath',
      key: 'filePath',
      width: '40%',
      render: (v: string) => <code className={styles.errorFilePath}>{v}</code>
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (v: string) => <span className={styles.errorText}>{v}</span>
    }
  ]

  const progressStatus: ProgressProps['status'] =
    task?.status === 'success'
      ? 'success'
      : task?.status === 'failed'
        ? 'exception'
        : task?.status === 'processing'
          ? 'active'
          : 'normal'

  const statusTagColor =
    task?.status === 'success'
      ? 'green'
      : task?.status === 'failed'
        ? 'red'
        : task?.status === 'processing'
          ? 'processing'
          : 'default'

  return (
    <Modal
      title="GitHub 仓库异步导入"
      open={open}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={isRunning ? '处理中...' : '提交导入'}
      cancelText="关闭"
      okButtonProps={{ disabled: isRunning }}
      destroyOnClose
      width={720}
      maskClosable={!isRunning}
      keyboard={!isRunning}
    >
      <Form<ImportFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          targetStatus: 'published',
          defaultModelId: 'gpt-4o-mini',
          dryRun: false,
          overwriteExisting: false
        }}
      >
        <Form.Item
          name="repoUrl"
          label="GitHub 仓库 URL"
          rules={[
            { required: true, message: '请输入仓库 URL' },
            {
              pattern: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/,
              message: '请输入合法的 GitHub 仓库 URL'
            }
          ]}
        >
          <Input
            placeholder="https://github.com/jnMetaCode/agency-agents-zh"
            disabled={isRunning}
          />
        </Form.Item>

        <Form.Item
          name="targetStatus"
          label="目标状态"
          rules={[{ required: true, message: '请选择目标状态' }]}
        >
          <Select options={TARGET_STATUS_OPTIONS} disabled={isRunning} />
        </Form.Item>

        <Form.Item
          name="defaultModelId"
          label="默认模型 ID"
          extra={<span className={styles.formHint}>仓库内未声明 modelId 时使用此默认值</span>}
        >
          <Input placeholder="gpt-4o-mini" disabled={isRunning} />
        </Form.Item>

        <Form.Item name="dryRun" valuePropName="checked">
          <Checkbox disabled={isRunning}>仅解析不入库 (dry-run)</Checkbox>
        </Form.Item>

        <Form.Item name="overwriteExisting" valuePropName="checked">
          <Checkbox disabled={isRunning}>覆盖已存在的导入记录</Checkbox>
        </Form.Item>
      </Form>

      {task ? (
        <div className={styles.taskPanel}>
          <div className={styles.taskMeta}>
            <span className={styles.metaLabel}>任务 ID:</span>
            <code className={styles.taskId}>{task.taskId}</code>
            <Tag color={statusTagColor} style={{ marginLeft: 8 }}>
              {task.status}
            </Tag>
          </div>

          {task.repoUrl ? (
            <div className={styles.taskMeta}>
              <span className={styles.metaLabel}>仓库:</span>
              <code className={styles.taskId}>{task.repoUrl}</code>
              {task.branch ? <Tag>{task.branch}</Tag> : null}
              {task.commitSha ? (
                <Tag>#{task.commitSha.slice(0, 7)}</Tag>
              ) : null}
            </div>
          ) : null}

          <div className={styles.progressWrap}>
            <Progress percent={task.progress} status={progressStatus} />
          </div>

          {stats ? (
            <div className={styles.statsRow}>
              <Statistic title="总数" value={stats.total} />
              <Statistic
                title="已导入"
                value={stats.inserted}
                valueStyle={{ color: '#34d399' }}
              />
              <Statistic
                title="跳过"
                value={stats.skipped}
                valueStyle={{ color: '#fbbf24' }}
              />
              <Statistic
                title="失败"
                value={stats.failed}
                valueStyle={{ color: '#f87171' }}
              />
              <Statistic
                title="耗时(秒)"
                value={Math.round(stats.durationMs / 1000)}
              />
            </div>
          ) : null}

          {task.errorMessage ? (
            <Alert
              type="error"
              showIcon
              message="任务级错误"
              description={task.errorMessage}
              style={{ marginTop: 12 }}
            />
          ) : null}

          {errors.length > 0 ? (
            <div className={styles.errorListWrap}>
              <div className={styles.errorListTitle}>
                错误列表（{errors.length} 条）
              </div>
              {errorsTruncated ? (
                <Alert
                  type="warning"
                  showIcon
                  message="错误较多，仅展示前 50 条，更多错误已省略"
                  style={{ marginBottom: 8 }}
                />
              ) : null}
              <Table<ImportErrorRow>
                rowKey={(r) => `${r.filePath}::${r.error}`}
                columns={errorColumns}
                dataSource={errors}
                pagination={false}
                size="small"
                scroll={{ y: 240 }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
