// 我的 Agent 列表（创作者）
// SubTask 12.2: 按状态分组展示 + 编辑 / 提交审核 / 删除
// 调用 GET /agents/creator、POST /agents/creator/:id/submit、DELETE /agents/creator/:id

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Pagination,
  Popconfirm,
  Spin,
  Tabs,
  Tag,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  DollarOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  RobotOutlined,
  SendOutlined
} from '@ant-design/icons'
import * as creatorApi from '@/api/agent-creator-api'
import type {
  CreatorAgent,
  AgentStatus
} from '@/types/agent-creator'
import styles from './styles.module.css'

const PAGE_SIZE = 12

const STATUS_TABS: Array<{ key: AgentStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending_review', label: '待审核' },
  { key: 'published', label: '已上架' },
  { key: 'rejected', label: '已驳回' }
]

/** 状态中文标签 */
function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'pending_review':
      return '待审核'
    case 'published':
      return '已上架'
    case 'rejected':
      return '已驳回'
    default:
      return status
  }
}

/** 状态 className */
function statusClass(status: AgentStatus): string {
  switch (status) {
    case 'draft':
      return styles.statusDraft
    case 'pending_review':
      return styles.statusPending
    case 'published':
      return styles.statusPublished
    case 'rejected':
      return styles.statusRejected
    default:
      return ''
  }
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function AgentCreatorList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<CreatorAgent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<AgentStatus | 'all'>('all')
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const query: Parameters<typeof creatorApi.listMyAgents>[0] = {
        page,
        pageSize: PAGE_SIZE
      }
      if (tab !== 'all') query.status = tab
      const result = await creatorApi.listMyAgents(query)
      setAgents(result.list || [])
      setTotal(result.total || 0)
    } catch (err) {
      console.error('[AgentCreatorList] load failed:', err)
      message.error('加载 Agent 列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, tab])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleTabChange = (key: string) => {
    setTab(key as AgentStatus | 'all')
    setPage(1)
  }

  /** 标记某条记录操作中 */
  const setActionState = (id: number, loading: boolean) => {
    setActionLoading((prev) => ({ ...prev, [id]: loading }))
  }

  const handleSubmitReview = async (agent: CreatorAgent) => {
    setActionState(agent.id, true)
    try {
      await creatorApi.submitForReview(agent.id)
      message.success(`Agent "${agent.name}" 已提交审核`)
      void loadData()
    } catch (err) {
      console.error('[AgentCreatorList] submit failed:', err)
      message.error('提交审核失败: ' + (err as Error).message)
    } finally {
      setActionState(agent.id, false)
    }
  }

  const handleDelete = async (agent: CreatorAgent) => {
    setActionState(agent.id, true)
    try {
      await creatorApi.deleteAgent(agent.id)
      message.success(`Agent "${agent.name}" 已删除`)
      setAgents((prev) => prev.filter((a) => a.id !== agent.id))
    } catch (err) {
      console.error('[AgentCreatorList] delete failed:', err)
      message.error('删除失败: ' + (err as Error).message)
    } finally {
      setActionState(agent.id, false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <RobotOutlined />
          <span>我的 Agent（创作者）</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<DollarOutlined />}
            onClick={() => navigate('/creator/revenue')}
          >
            收益中心
          </Button>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/dashboard')}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={() => navigate('/creator/create')}
          >
            创建 Agent
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Tabs
          activeKey={tab}
          onChange={handleTabChange}
          items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 0 }}
        />
      </div>

      <Spin spinning={loading}>
        {agents.length === 0 && !loading ? (
          <Empty description="暂无 Agent，点击右上角创建" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.agentGrid}>
            {agents.map((agent) => (
              <Card key={agent.id} className={styles.agentCard} bordered={false}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardAvatar}>
                    {agent.avatar ? (
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className={styles.cardAvatarImg}
                      />
                    ) : (
                      agent.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.cardTitle}>
                      <span>{agent.name}</span>
                      <Tag className={statusClass(agent.status)}>
                        {statusLabel(agent.status)}
                      </Tag>
                    </div>
                    <div className={styles.cardDesc}>
                      {agent.description || '暂无描述'}
                    </div>
                  </div>
                </div>

                <div className={styles.cardMeta}>
                  <span>调用 {agent.callCount.toLocaleString()} 次</span>
                  <span>评分 {agent.rating.toFixed(1)} ({agent.ratingCount})</span>
                  <span>{formatTime(agent.createdAt)}</span>
                </div>

                {agent.status === 'rejected' && agent.rejectReason && (
                  <div className={styles.rejectReason}>
                    驳回原因：{agent.rejectReason}
                  </div>
                )}

                <div className={styles.cardActions}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => navigate(`/creator/${agent.id}/edit`)}
                    disabled={agent.status === 'pending_review'}
                  >
                    编辑
                  </Button>
                  {(agent.status === 'draft' || agent.status === 'rejected') && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      loading={!!actionLoading[agent.id]}
                      onClick={() => handleSubmitReview(agent)}
                    >
                      提交审核
                    </Button>
                  )}
                  {agent.status === 'draft' && (
                    <Popconfirm
                      title="确定删除该 Agent 吗？"
                      description="仅草稿状态可删除，删除后不可恢复"
                      onConfirm={() => handleDelete(agent)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={!!actionLoading[agent.id]}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(p) => setPage(p)}
            />
          </div>
        )}
      </Spin>
    </div>
  )
}
