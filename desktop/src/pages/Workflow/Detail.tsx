// 工作流详情页
// 展示：模板信息（名称/描述/预览图/输入输出 Schema）+ 执行历史 + 执行按钮
// 调用 GET /workflow/templates/:id、GET /workflow/executions?workflowId=、POST /workflow/:id/execute

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Input,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  ClockCircleOutlined,
  DollarOutlined
} from '@ant-design/icons'
import * as workflowApi from '@/api/workflow-api'
import type {
  WorkflowTemplate,
  WorkflowExecution,
  WorkflowExecutionStatus
} from '@/types/workflow'
import styles from './styles.module.css'

const { TextArea } = Input
const { Text } = Typography

/** 状态标签 className */
function statusTagClass(status: WorkflowExecutionStatus): string {
  switch (status) {
    case 'success':
      return styles.statusTagSuccess
    case 'failed':
      return styles.statusTagFailed
    case 'running':
      return styles.statusTagRunning
    case 'canceled':
    default:
      return styles.statusTagCanceled
  }
}

/** 状态中文显示 */
function statusLabel(status: WorkflowExecutionStatus): string {
  switch (status) {
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    case 'running':
      return '运行中'
    case 'canceled':
      return '已取消'
    default:
      return status
  }
}

/** 格式化 JSON 用于显示 */
function formatJson(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 格式化耗时 */
function formatDuration(ms?: number): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function WorkflowDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const workflowId = id ? Number(id) : NaN

  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [inputText, setInputText] = useState('{}')
  const [lastResult, setLastResult] = useState<WorkflowExecution | null>(null)

  /** 加载模板详情 + 执行历史 */
  const loadData = useCallback(async () => {
    if (!Number.isFinite(workflowId)) return
    setLoading(true)
    try {
      const [tpl, execResult] = await Promise.all([
        workflowApi.getTemplate(workflowId),
        workflowApi.listExecutions({ workflowId, pageSize: 50 })
      ])
      setTemplate(tpl)
      setExecutions(execResult.list || [])
    } catch (err) {
      console.error('[WorkflowDetail] load failed:', err)
      message.error('加载工作流详情失败')
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 执行工作流 */
  const handleExecute = async () => {
    if (!Number.isFinite(workflowId)) return
    let input: unknown
    try {
      input = JSON.parse(inputText || '{}')
    } catch (err) {
      message.error('输入不是合法的 JSON: ' + (err as Error).message)
      return
    }

    setExecuting(true)
    try {
      const result = await workflowApi.executeWorkflow(workflowId, input)
      setLastResult(result)
      message.success('工作流执行完成')
      // 刷新执行历史
      void loadData()
    } catch (err) {
      console.error('[WorkflowDetail] execute failed:', err)
      message.error('工作流执行失败: ' + (err as Error).message)
    } finally {
      setExecuting(false)
    }
  }

  /** 返回列表 */
  const handleBack = () => {
    navigate('/workflow')
  }

  /** 执行历史表格列定义 */
  const columns: TableColumnsType<WorkflowExecution> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: WorkflowExecutionStatus) => (
        <Tag className={statusTagClass(status)}>{statusLabel(status)}</Tag>
      )
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 100,
      render: (v: number) => formatDuration(v)
    },
    {
      title: '积分消耗',
      dataIndex: 'creditsCost',
      key: 'creditsCost',
      width: 100,
      render: (v: number) => (
        <span className={styles.creditsCost}>{v ?? 0}</span>
      )
    },
    {
      title: '输出',
      dataIndex: 'output',
      key: 'output',
      ellipsis: true,
      render: (v: unknown) => (
        <Text style={{ color: '#8b949e', fontSize: 12 }} ellipsis>
          {formatJson(v)}
        </Text>
      )
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => formatTime(v)
    }
  ]

  if (loading && !template) {
    return (
      <div className={styles.pageContainer}>
        <Spin
          fullscreen
          tip="加载中..."
          style={{ background: 'rgba(10, 14, 26, 0.85)' }}
        />
      </div>
    )
  }

  if (!template) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>
          <ThunderboltOutlined className={styles.emptyStateIcon} />
          <div className={styles.emptyStateText}>工作流不存在或加载失败</div>
          <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      {/* 顶部导航 */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <ThunderboltOutlined />
          <span>{template.name}</span>
        </div>
        <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回列表
        </Button>
      </div>

      <div className={styles.detailContainer}>
        {/* 模板基本信息 */}
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <h2 className={styles.detailTitle}>{template.name}</h2>
              <Tag className={styles.categoryTag}>{template.category}</Tag>
            </div>
          </div>
          <div className={styles.detailDescription}>{template.description}</div>

          {/* 预览图 */}
          <div className={styles.detailPreview}>
            {template.previewImage ? (
              <img src={template.previewImage} alt={template.name} />
            ) : (
              <PictureOutlined className={styles.detailPreviewPlaceholder} />
            )}
          </div>

          {/* 输入输出 Schema */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <div className={styles.sectionTitle}>
                <ArrowLeftOutlined style={{ transform: 'rotate(180deg)' }} />
                输入 Schema
              </div>
              <div className={styles.schemaBlock}>{formatJson(template.inputSchema)}</div>
            </div>
            <div>
              <div className={styles.sectionTitle}>
                <ArrowLeftOutlined />
                输出 Schema
              </div>
              <div className={styles.schemaBlock}>{formatJson(template.outputSchema)}</div>
            </div>
          </div>
        </div>

        {/* 执行区 */}
        <div className={styles.detailCard}>
          <div className={styles.sectionTitle}>
            <PlayCircleOutlined />
            执行工作流
            {template.pricePerExecution != null && template.pricePerExecution > 0 && (
              <span className={styles.creditsCost} style={{ marginLeft: 12, fontSize: 12 }}>
                每次执行消耗 {template.pricePerExecution} 积分
              </span>
            )}
          </div>
          <div className={styles.inputArea}>
            <TextArea
              className={styles.inputTextarea}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入 JSON 格式的工作流输入参数..."
              autoSize={{ minRows: 4, maxRows: 10 }}
            />
            <Button
              type="primary"
              className={styles.executeBtn}
              icon={<PlayCircleOutlined />}
              onClick={handleExecute}
              loading={executing}
            >
              执行工作流
            </Button>
          </div>

          {/* 最近一次执行结果 */}
          {lastResult && (
            <div style={{ marginTop: 16 }}>
              <div className={styles.sectionTitle}>
                <ThunderboltOutlined />
                最近执行结果
              </div>
              <div className={styles.resultBlock}>{formatJson(lastResult.output)}</div>
              <div className={styles.resultMeta}>
                <span className={styles.resultMetaItem}>
                  <Tag className={statusTagClass(lastResult.status)}>
                    {statusLabel(lastResult.status)}
                  </Tag>
                </span>
                <span className={styles.resultMetaItem}>
                  <ClockCircleOutlined />
                  耗时: {formatDuration(lastResult.durationMs)}
                </span>
                <span className={styles.resultMetaItem}>
                  <DollarOutlined />
                  积分消耗: <span className={styles.creditsCost}>{lastResult.creditsCost ?? 0}</span>
                </span>
                <span className={styles.resultMetaItem}>
                  时间: {formatTime(lastResult.createdAt)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 执行历史 */}
        <div className={styles.historyTableWrapper}>
          <div className={styles.sectionTitle}>
            <ClockCircleOutlined />
            执行历史
          </div>
          <Table<WorkflowExecution>
            columns={columns}
            dataSource={executions}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
            loading={loading}
            locale={{ emptyText: '暂无执行记录' }}
          />
        </div>
      </div>
    </div>
  )
}
