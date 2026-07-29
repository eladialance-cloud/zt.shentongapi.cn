// 任务中心页 - 任务详情查询
//
// 功能：输入任务 ID 搜索 → 展示任务详情卡片 + 输出项列表
// 操作：删除任务
// API: GET /admin/tasks/:id, DELETE /admin/tasks/:id

import { useCallback, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Popconfirm,
  Spin,
  Tag,
  Typography,
  message
} from 'antd'
import {
  DeleteOutlined,
  SearchOutlined,
  TagsOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  StopOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { deleteAdminTask, getAdminTask } from '@/api/admin-task-api'
import type {
  AdminTaskDetail,
  TaskOutputItem,
  TaskOutputItemType,
  TaskStatus,
  TaskType
} from '@/types/admin-task'
import styles from './styles.module.css'

const { Text, Paragraph } = Typography

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  chat: '对话',
  codex: '代码',
  workflow: '工作流',
  tool: '工具'
}

const TASK_TYPE_COLOR: Record<TaskType, string> = {
  chat: 'blue',
  codex: 'green',
  workflow: 'purple',
  tool: 'orange'
}

const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { color: string; text: string; icon: React.ReactNode }
> = {
  pending: { color: 'default', text: '待处理', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', text: '运行中', icon: <LoadingOutlined /> },
  completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', text: '已失败', icon: <CloseCircleOutlined /> },
  cancelled: { color: 'warning', text: '已取消', icon: <StopOutlined /> }
}

const OUTPUT_ITEM_TYPE_CONFIG: Record<
  TaskOutputItemType,
  { color: string; label: string }
> = {
  text: { color: 'blue', label: '文本' },
  code: { color: 'green', label: '代码' },
  file: { color: 'gold', label: '文件' },
  image: { color: 'purple', label: '图片' },
  error: { color: 'red', label: '错误' }
}

/** 安全 JSON 序列化 */
function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

/** 格式化时间 */
function formatTime(time?: string): string {
  if (!time) return '-'
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

/** 计算耗时 */
function calcDuration(start?: string, end?: string): string {
  if (!start || !end) return '-'
  const startMs = dayjs(start).valueOf()
  const endMs = dayjs(end).valueOf()
  const diff = endMs - startMs
  if (diff < 0) return '-'
  if (diff < 1000) return `${diff}ms`
  if (diff < 60000) return `${(diff / 1000).toFixed(2)}s`
  return `${(diff / 60000).toFixed(2)}min`
}

export default function AdminTasks() {
  const [searchId, setSearchId] = useState('')
  const [loading, setLoading] = useState(false)
  const [task, setTask] = useState<AdminTaskDetail | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    const trimmed = searchId.trim()
    if (!trimmed) {
      message.warning('请输入任务 ID')
      return
    }
    const id = Number(trimmed)
    if (!Number.isFinite(id) || id <= 0) {
      message.error('任务 ID 必须为正整数')
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const result = await getAdminTask(id)
      setTask(result)
    } catch (err) {
      console.error('[AdminTasks] get task failed:', err)
      setTask(null)
      message.error('获取任务详情失败')
    } finally {
      setLoading(false)
    }
  }, [searchId])

  const handleDelete = async () => {
    if (!task) return
    try {
      await deleteAdminTask(task.id)
      message.success('任务已删除')
      setTask(null)
      setSearched(false)
      setSearchId('')
    } catch (err) {
      console.error('[AdminTasks] delete failed:', err)
      message.error('删除任务失败')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleSearch()
    }
  }

  const statusConfig = task ? TASK_STATUS_CONFIG[task.status] : null
  const outputItems = task?.outputItems || []

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TagsOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>任务中心</h1>
            <div className={styles.subtitle}>
              查询任务详情 / 查看输出项 / 删除任务
            </div>
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className={styles.searchBar}>
        <Input
          prefix={<SearchOutlined style={{ color: '#8b949e' }} />}
          placeholder="输入任务 ID 查看详情，如 42"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
          allowClear
          size="large"
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={loading}
          className={styles.primaryBtn}
          size="large"
        >
          搜索
        </Button>
      </div>

      {/* 任务详情 */}
      <Spin spinning={loading}>
        {!task && !loading && searched ? (
          <Empty description="未找到任务" style={{ marginTop: 80 }} />
        ) : !task && !searched ? (
          <Empty
            description="输入任务 ID 开始查询"
            style={{ marginTop: 80 }}
          />
        ) : task ? (
          <>
            {/* 任务信息卡片 */}
            <Card
              className={styles.card}
              title={
                <div className={styles.cardTitle}>
                  <span className={styles.taskIdTag}>#{task.id}</span>
                  <Tag color={TASK_TYPE_COLOR[task.type]}>
                    {TASK_TYPE_LABEL[task.type]}
                  </Tag>
                  {statusConfig && (
                    <Tag
                      color={statusConfig.color}
                      icon={statusConfig.icon}
                    >
                      {statusConfig.text}
                    </Tag>
                  )}
                </div>
              }
              extra={
                <Popconfirm
                  title="确认删除该任务？"
                  description="删除后不可恢复"
                  onConfirm={handleDelete}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    删除任务
                  </Button>
                </Popconfirm>
              }
            >
              <Descriptions
                column={3}
                size="small"
                labelStyle={{ color: '#8b949e', width: 100 }}
                contentStyle={{ color: '#e6edf3' }}
              >
                <Descriptions.Item label="任务 ID">
                  {task.id}
                </Descriptions.Item>
                <Descriptions.Item label="Agent ID">
                  {task.agentId}
                </Descriptions.Item>
                <Descriptions.Item label="用户 ID">
                  {task.userId}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {statusConfig && (
                    <Tag color={statusConfig.color} icon={statusConfig.icon}>
                      {statusConfig.text}
                    </Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={TASK_TYPE_COLOR[task.type]}>
                    {TASK_TYPE_LABEL[task.type]}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="耗时">
                  <span style={{ color: '#7dd3fc' }}>
                    {calcDuration(task.startedAt, task.completedAt)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {formatTime(task.createdAt)}
                </Descriptions.Item>
                <Descriptions.Item label="开始时间">
                  {formatTime(task.startedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="完成时间">
                  {formatTime(task.completedAt)}
                </Descriptions.Item>
              </Descriptions>

              {/* 错误信息 */}
              {task.errorMessage && (
                <div className={styles.errorBox}>
                  <Text type="danger" strong>
                    错误信息：
                  </Text>
                  <Paragraph
                    style={{
                      color: '#f87171',
                      margin: '4px 0 0',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {task.errorMessage}
                  </Paragraph>
                </div>
              )}

              {/* 输入参数 */}
              <div className={styles.jsonSection}>
                <div className={styles.jsonSectionTitle}>
                  <PlayCircleOutlined /> 输入参数
                </div>
                <pre className={styles.jsonBlock}>
                  {safeJsonStringify(task.input)}
                </pre>
              </div>

              {/* 输出结果 */}
              {task.output && (
                <div className={styles.jsonSection}>
                  <div className={styles.jsonSectionTitle}>
                    <CheckCircleOutlined /> 输出结果
                  </div>
                  <pre className={styles.jsonBlock}>
                    {safeJsonStringify(task.output)}
                  </pre>
                </div>
              )}
            </Card>

            {/* 输出项列表 */}
            {outputItems.length > 0 && (
              <div className={styles.outputSection}>
                <div className={styles.sectionTitle}>
                  输出项列表（{outputItems.length} 项）
                </div>
                <div className={styles.outputList}>
                  {outputItems
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => (
                      <OutputItemCard key={item.id} item={item} />
                    ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </Spin>
    </div>
  )
}

/** 输出项卡片子组件 */
function OutputItemCard({ item }: { item: TaskOutputItem }) {
  const config = OUTPUT_ITEM_TYPE_CONFIG[item.itemType]

  return (
    <Card
      className={styles.outputItemCard}
      size="small"
      title={
        <div className={styles.outputItemTitle}>
          <Tag color={config.color}>{config.label}</Tag>
          <span className={styles.outputItemOrder}>
            #{item.sortOrder}
          </span>
          <span className={styles.outputItemTime}>
            {formatTime(item.createdAt)}
          </span>
        </div>
      }
    >
      {item.itemType === 'code' ? (
        <pre className={styles.codeBlock}>{item.content}</pre>
      ) : item.itemType === 'image' ? (
        <div className={styles.imageContent}>
          {item.content && (
            <img
              src={item.content}
              alt="任务输出图片"
              className={styles.outputImage}
            />
          )}
          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <pre className={styles.jsonBlock}>
              {safeJsonStringify(item.metadata)}
            </pre>
          )}
        </div>
      ) : item.itemType === 'error' ? (
        <div className={styles.errorContent}>
          <Text type="danger" style={{ whiteSpace: 'pre-wrap' }}>
            {item.content}
          </Text>
        </div>
      ) : (
        <div className={styles.textContent}>
          <Paragraph
            style={{
              color: '#e6edf3',
              margin: 0,
              whiteSpace: 'pre-wrap'
            }}
          >
            {item.content}
          </Paragraph>
          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <pre className={styles.jsonBlock}>
              {safeJsonStringify(item.metadata)}
            </pre>
          )}
        </div>
      )}
    </Card>
  )
}
