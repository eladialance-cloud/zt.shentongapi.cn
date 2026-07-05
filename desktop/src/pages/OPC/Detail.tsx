// OPC 团队详情
// SubTask 14.2: 团队信息 + 成员列表 + 任务分配列表 + 协作流程图（文字描述）+ 看板入口
// 调用 GET /opc/teams/:id、GET /opc/teams/:id/members、GET /opc/teams/:id/tasks

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Empty,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  TeamOutlined,
  UserOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  PartitionOutlined
} from '@ant-design/icons'
import * as opcApi from '@/api/opc-api'
import type {
  OPCTeam,
  TeamMember,
  OPCTask,
  WorkflowNode,
  MemberRole,
  MemberStatus,
  TaskStatus,
  TaskPriority
} from '@/types/opc'
import styles from './styles.module.css'

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 角色中文 */
function roleLabel(role: MemberRole): string {
  switch (role) {
    case 'leader':
      return '负责人'
    case 'member':
      return '成员'
    case 'reviewer':
      return '审核人'
    case 'observer':
      return '观察者'
    default:
      return role
  }
}

function roleClass(role: MemberRole): string {
  switch (role) {
    case 'leader':
      return styles.roleLeader
    case 'member':
      return styles.roleMember
    case 'reviewer':
      return styles.roleReviewer
    case 'observer':
      return styles.roleObserver
    default:
      return ''
  }
}

/** 成员状态中文 */
function memberStatusLabel(s: MemberStatus): string {
  switch (s) {
    case 'active':
      return '在线'
    case 'busy':
      return '忙碌'
    case 'idle':
      return '空闲'
    case 'offline':
      return '离线'
    default:
      return s
  }
}

function memberStatusClass(s: MemberStatus): string {
  switch (s) {
    case 'active':
      return styles.statusActive
    case 'busy':
      return styles.statusBusy
    case 'idle':
      return styles.statusIdle
    case 'offline':
      return styles.statusOffline
    default:
      return ''
  }
}

/** 任务状态中文 */
function taskStatusLabel(s: TaskStatus): string {
  switch (s) {
    case 'todo':
      return '待办'
    case 'in_progress':
      return '进行中'
    case 'done':
      return '已完成'
    default:
      return s
  }
}

/** 任务优先级中文 */
function taskPriorityLabel(p: TaskPriority): string {
  switch (p) {
    case 'low':
      return '低'
    case 'medium':
      return '中'
    case 'high':
      return '高'
    case 'urgent':
      return '紧急'
    default:
      return p
  }
}

function taskPriorityClass(p: TaskPriority): string {
  switch (p) {
    case 'low':
      return styles.priorityLow
    case 'medium':
      return styles.priorityMedium
    case 'high':
      return styles.priorityHigh
    case 'urgent':
      return styles.priorityUrgent
    default:
      return ''
  }
}

export default function OPCTeamDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const teamId = id ? Number(id) : NaN

  const [team, setTeam] = useState<OPCTeam | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowNode[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [tasks, setTasks] = useState<OPCTask[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!Number.isFinite(teamId)) return
    setLoading(true)
    try {
      const [detail, memberList, taskResult] = await Promise.all([
        opcApi.getTeamDetail(teamId),
        opcApi.listMembers(teamId),
        opcApi.listTasks(teamId, { pageSize: 100 })
      ])
      setTeam(detail.team)
      setWorkflow(detail.workflow || [])
      setMembers(memberList || [])
      setTasks(taskResult.list || [])
    } catch (err) {
      console.error('[OPCTeamDetail] load failed:', err)
      message.error('加载团队详情失败')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 任务列表表格列 */
  const taskColumns: TableColumnsType<OPCTask> = [
    {
      title: '任务名称',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, record) => (
        <span style={{ color: '#e6edf3', fontSize: 13 }}>
          {record.description ? (
            <span title={record.description}>{v}</span>
          ) : (
            v
          )}
        </span>
      )
    },
    {
      title: '负责成员',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 140,
      render: (v?: string) => (
        <span style={{ color: '#a5b4fc' }}>{v || '未分配'}</span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: TaskStatus) => <Tag>{taskStatusLabel(s)}</Tag>
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (p: TaskPriority) => (
        <Tag className={taskPriorityClass(p)}>{taskPriorityLabel(p)}</Tag>
      )
    },
    {
      title: '截止时间',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 170,
      render: (v?: string) => (v ? formatTime(v) : '-')
    }
  ]

  if (loading && !team) {
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

  if (!team) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>
          <TeamOutlined className={styles.emptyStateIcon} />
          <div className={styles.emptyStateText}>团队不存在或加载失败</div>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/opc')}
          >
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <TeamOutlined />
          <span>{team.name}</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/opc')}
          >
            返回列表
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PartitionOutlined />}
            onClick={() => navigate(`/opc/${teamId}/board`)}
          >
            看板视图
          </Button>
        </div>
      </div>

      <div className={styles.detailContainer}>
        {/* ===== 团队信息 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <ApartmentOutlined />
              团队信息
            </span>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>团队 ID</span>
              <span className={styles.infoValue}>#{team.id}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>名称</span>
              <span className={styles.infoValue}>{team.name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>成员数</span>
              <span className={styles.infoValue}>{team.memberCount}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>任务数</span>
              <span className={styles.infoValue}>{team.taskCount}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>创建时间</span>
              <span className={styles.infoValue}>{formatTime(team.createdAt)}</span>
            </div>
          </div>
          {team.description && (
            <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
              {team.description}
            </div>
          )}
        </div>

        {/* ===== 成员列表 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <UserOutlined />
              成员列表（{members.length}）
            </span>
          </div>
          {members.length === 0 ? (
            <Empty description="暂无成员" />
          ) : (
            <div className={styles.memberGrid}>
              {members.map((m) => (
                <div key={m.id} className={styles.memberCard}>
                  <div className={styles.memberAvatar}>
                    {m.agentAvatar ? (
                      <img
                        src={m.agentAvatar}
                        alt={m.agentName}
                        className={styles.memberAvatarImg}
                      />
                    ) : (
                      m.agentName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>
                      <span>{m.agentName}</span>
                      <Tag className={roleClass(m.role)}>{roleLabel(m.role)}</Tag>
                    </div>
                    <div className={styles.memberMeta}>
                      <Tag className={memberStatusClass(m.status)}>
                        {memberStatusLabel(m.status)}
                      </Tag>
                      <span style={{ marginLeft: 6 }}>
                        承担 {m.taskCount} 个任务
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== 任务分配列表 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <ApartmentOutlined />
              任务分配列表
            </span>
          </div>
          {tasks.length === 0 ? (
            <Empty description="暂无任务" />
          ) : (
            <Table<OPCTask>
              columns={taskColumns}
              dataSource={tasks}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>

        {/* ===== 协作流程图 ===== */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleText}>
              <DeploymentUnitOutlined />
              协作流程
            </span>
          </div>
          {workflow.length === 0 ? (
            <div style={{ color: '#6e7681', fontSize: 12, lineHeight: 1.6 }}>
              暂未配置协作流程。默认协作流程：任务创建 → 负责人接收 → 执行中 →
              提交审核 → 审核通过 → 完成。可在团队设置中自定义流程节点。
            </div>
          ) : (
            <div className={styles.workflowFlow}>
              {workflow
                .sort((a, b) => a.order - b.order)
                .map((node, idx) => (
                  <div
                    key={node.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div className={styles.workflowNode}>
                      <div style={{ fontWeight: 600 }}>{node.name}</div>
                      {node.description && (
                        <div
                          style={{
                            fontSize: 10,
                            color: '#6e7681',
                            marginTop: 2
                          }}
                        >
                          {node.description}
                        </div>
                      )}
                    </div>
                    {idx < workflow.length - 1 && (
                      <span className={styles.workflowArrow}>→</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
