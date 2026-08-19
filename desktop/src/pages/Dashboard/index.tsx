// 工作台 - Kimi 风格（v6.0 · 对齐四期原型）
// 定位: AI 办公入口首页（老板每天第一屏：30 秒看清公司状态并直接处理审核）
// 结构: 问候 Hero + 5 统计卡 + (待审核 + 今日发布) + (进行中任务 + AI 团队状态) + (快捷入口 + 最近任务)
// 数据: 会话/团队/发布计划/云端需求单/统一任务均接真实数据，失败降级为空数组

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Spin, Tag } from 'antd'
import {
  MessageSquare,
  Clapperboard,
  Workflow,
  BookOpen,
  UserPlus,
  Store,
  FileText,
  Inbox,
  Send,
  Zap,
  Users,
  BarChart3,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { listSessions } from '@/api/chat-api'
import { listTeams, listMembers, listTasks } from '@/api/team-api'
import { listPublishPlans } from '@/api/channel-api'
import { listBriefs } from '@/api/brief-api'
import { getUnifiedTasks } from '@/api/task-api'
import type { UnifiedTaskItem } from '@/api/task-api'
import type { ChatSession } from '@/types/chat'
import type { Team, TeamMember, TeamTask } from '@/types/team'
import type { PublishPlan } from '@/types/channel'
import type { BriefItem } from '@/api/brief-api'
import {
  aggregateTeamStatus,
  countWeekTasks,
  filterInProgress,
  filterPendingReview,
  platformLabel,
  todayPlans,
  type TeamStatusRow,
} from './cards'
import ReviewQueue from './ReviewQueue'
import TaskProgress from './TaskProgress'
import TeamStatus from './TeamStatus'
import styles from './styles.module.css'

/** 发布状态 Tag 映射（工作台自包含，避免与 Publish 页跨页耦合） */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending_review: { label: '待审核', color: 'orange' },
  approved: { label: '已批准', color: 'blue' },
  rejected: { label: '已拒绝', color: 'red' },
  published: { label: '已发布', color: 'green' },
  failed: { label: '失败', color: 'red' },
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function dayKey(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 最近任务时间显示：今天 HH:mm / 昨天 / M月d日 */
function formatRelativeTime(value: Date | string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startOfToday) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (t >= startOfToday - 86400000) return '昨天'
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

/** 按时段问候 */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function formatDate(): string {
  const d = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 · ' + weekdays[d.getDay()]
}

/** 今日发布卡时间显示：HH:mm */
function formatPublishTime(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

interface QuickEntry {
  key: string
  label: string
  icon: LucideIcon
  path: string
}

const QUICK_ENTRIES: QuickEntry[] = [
  { key: 'brief', label: '新建需求', icon: FileText, path: '/briefs/new' },
  { key: 'chat', label: '发起对话', icon: MessageSquare, path: '/chat' },
  { key: 'video', label: '生成视频', icon: Clapperboard, path: '/video-claw' },
  { key: 'workflow', label: '创建工作流', icon: Workflow, path: '/workflow' },
  { key: 'knowledge', label: '新建知识库', icon: BookOpen, path: '/knowledge' },
  { key: 'team', label: '邀请成员', icon: UserPlus, path: '/team' },
  { key: 'market', label: '逛市场', icon: Store, path: '/skill-market' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [publishPlans, setPublishPlans] = useState<PublishPlan[]>([])
  const [briefs, setBriefs] = useState<BriefItem[]>([])
  const [unifiedTasks, setUnifiedTasks] = useState<UnifiedTaskItem[]>([])
  const [membersByTeam, setMembersByTeam] = useState<Map<number, TeamMember[]>>(new Map())
  const [weekTaskCountByTeam, setWeekTaskCountByTeam] = useState<Map<number, number>>(new Map())

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionRes, teamRes, publishPlanRes, briefRes, taskRes] = await Promise.all([
        listSessions({ pageSize: 8 }).catch(() => ({ list: [], total: 0 }) as never),
        listTeams().catch(() => [] as Team[]),
        listPublishPlans().catch(() => [] as PublishPlan[]),
        listBriefs({ status: 'draft', pageSize: 100 }).catch(() => ({ list: [], total: 0 }) as never),
        getUnifiedTasks({ pageSize: 100 }).catch(() => ({ list: [], total: 0 }) as never),
      ])
      const teamList = teamRes || []
      setSessions((sessionRes as { list?: ChatSession[] }).list || [])
      setTeams(teamList)
      setPublishPlans(publishPlanRes)
      setBriefs((briefRes as { list?: BriefItem[] }).list || [])
      setUnifiedTasks((taskRes as { list?: UnifiedTaskItem[] }).list || [])

      // AI 团队状态：逐个团队拉成员 + 任务（任一失败只降级该团队）
      const members = new Map<number, TeamMember[]>()
      const weekCounts = new Map<number, number>()
      await Promise.all(
        teamList.map(async (team) => {
          try {
            const [memberRes, taskRes2] = await Promise.all([
              listMembers(team.id),
              listTasks(team.id, { pageSize: 50 }),
            ])
            members.set(team.id, memberRes)
            weekCounts.set(team.id, countWeekTasks((taskRes2 as { list?: TeamTask[] }).list || []))
          } catch (err) {
            console.warn('[Workbench] 加载团队 ' + team.id + ' 数据失败:', err)
          }
        }),
      )
      setMembersByTeam(members)
      setWeekTaskCountByTeam(weekCounts)
    } catch (err) {
      console.error('[Workbench] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  /** 进行中任务数（统一任务 status=running） */
  const inProgressCount = useMemo(
    () => filterInProgress(unifiedTasks, Number.MAX_SAFE_INTEGER).length,
    [unifiedTasks],
  )

  /** 待我处理：待审核发布计划 + 云端草稿需求单 */
  const pendingReview = useMemo(
    () => filterPendingReview(publishPlans, Number.MAX_SAFE_INTEGER).length,
    [publishPlans],
  )
  const draftBriefs = useMemo(
    () => (briefs ?? []).filter((b) => b.status === 'draft').length,
    [briefs],
  )
  const todoCount = pendingReview + draftBriefs

  /** 今日发布：scheduledAt 是今天的发布计划 */
  const todayList = useMemo(() => todayPlans(publishPlans, dayKey(new Date())), [publishPlans])
  const todayPublishes = todayList.length

  /** 团队成员总数 */
  const memberTotal = useMemo(
    () => teams.reduce((sum, t) => sum + (Number(t.memberCount) || 0), 0),
    [teams],
  )

  /** 团队状态聚合行 */
  const teamRows = useMemo<TeamStatusRow[]>(
    () => aggregateTeamStatus(teams, membersByTeam, weekTaskCountByTeam),
    [teams, membersByTeam, weekTaskCountByTeam],
  )

  /** 最近任务（取最近会话，按来源打标签） */
  const recentTasks = useMemo(
    () =>
      sessions.slice(0, 5).map((s) => {
        let tag = '对话'
        let color = 'var(--color-brand)'
        if (s.agentId) {
          tag = 'Agent'
          color = 'var(--color-purple)'
        } else if (s.knowledgeBaseId) {
          tag = '知识库'
          color = 'var(--color-success)'
        } else if (/video|claw|视频/i.test(s.modelId || '')) {
          tag = 'ST-Claw'
          color = 'var(--color-warning)'
        }
        return {
          id: s.id,
          title: s.title || '新对话',
          tag,
          color,
          time: formatRelativeTime(s.lastMessageAt || s.updatedAt),
        }
      }),
    [sessions],
  )

  const showSkeleton =
    loading && sessions.length === 0 && publishPlans.length === 0 && unifiedTasks.length === 0

  return (
    <div className={styles.workbench}>
      {/* 问候 Hero */}
      <header className={styles.hero}>
        <div className={styles.heroInfo}>
          <h2 className={styles.title}>
            {greeting()}，{user?.username || '用户'}
          </h2>
          <p className={styles.sub}>
            今天是 {formatDate()} · {inProgressCount} 个任务进行中 · {pendingReview} 条待审核 ·{' '}
            {todayPublishes} 个今日发布
          </p>
        </div>
        <Button
          type="primary"
          size="large"
          className={styles.heroBtn}
          icon={<Plus size={18} />}
          onClick={() => navigate('/chat')}
        >
          新建任务 · 先聊需求
        </Button>
      </header>

      {/* 统计卡 */}
      <div className={styles.stats}>
        <div
          className={styles.statCard}
          onClick={() => navigate('/publish')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <Inbox size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>待我处理</div>
            <div className={styles.statValue}>{todoCount}</div>
            <div className={styles.statSub}>
              {pendingReview} 条待审核发布 + {draftBriefs} 条草稿需求
            </div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/task-center')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <Zap size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>进行中</div>
            <div className={styles.statValue}>{inProgressCount}</div>
            <div className={styles.statSub}>查看任务中心</div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/publish')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <Send size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>今日发布</div>
            <div className={styles.statValue}>{todayPublishes}</div>
            <div className={styles.statSub}>查看发布计划</div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/team')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <Users size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>团队状态</div>
            <div className={styles.statValue}>{memberTotal}</div>
            <div className={styles.statSub}>{teams.length} 个团队</div>
          </div>
        </div>

        <div
          className={styles.statCard}
          onClick={() => navigate('/analytics')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <BarChart3 size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>数据分析</div>
            <div className={styles.statValue}>报表</div>
            <div className={styles.statSub}>打开数据分析报表</div>
          </div>
        </div>
      </div>

      {showSkeleton ? (
        <div className={styles.loadingWrap}>
          <Spin size="large" tip="正在加载工作台数据..." />
        </div>
      ) : (
        <>
          {/* 待审核 + 今日发布 */}
          <div className={styles.cardsRow}>
            <ReviewQueue plans={publishPlans} onChanged={() => void loadAll()} />

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                <span>今日发布</span>
                <span
                  className={styles.cardMore}
                  onClick={() => navigate('/publish')}
                  role="button"
                  tabIndex={0}
                >
                  查看全部
                </span>
              </h3>
              {todayList.length === 0 ? (
                <div className={styles.emptyHint}>今天暂无排期发布，去创建发布计划吧</div>
              ) : (
                <div className={styles.publishList}>
                  {todayList.map((plan) => {
                    const st = STATUS_MAP[plan.status] || { label: plan.status, color: 'default' }
                    return (
                      <div
                        key={plan.id}
                        className={styles.publishRow}
                        onClick={() => navigate('/publish')}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={styles.publishInfo}>
                          <div className={styles.publishTitle}>{plan.title}</div>
                          <div className={styles.publishMeta}>
                            <span className={styles.publishPlatform}>
                              {platformLabel(plan.targetPlatforms)}
                            </span>
                            <span className={styles.publishTime}>
                              {formatPublishTime(plan.scheduledAt)}
                            </span>
                          </div>
                        </div>
                        <Tag color={st.color}>{st.label}</Tag>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* 进行中任务 + AI 团队状态 */}
          <div className={styles.cardsRow}>
            <TaskProgress tasks={unifiedTasks} />
            <TeamStatus rows={teamRows} />
          </div>

          {/* 快捷入口 + 最近任务 */}
          <div className={styles.grid}>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>快捷入口</h3>
              <div className={styles.quickGrid}>
                {QUICK_ENTRIES.map((entry) => {
                  const Icon = entry.icon
                  return (
                    <div
                      key={entry.key}
                      className={styles.quickItem}
                      onClick={() => navigate(entry.path)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={styles.quickIcon}>
                        <Icon size={20} />
                      </span>
                      <span className={styles.quickLabel}>{entry.label}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                <span>最近任务</span>
                <span
                  className={styles.cardMore}
                  onClick={() => navigate('/chat')}
                  role="button"
                  tabIndex={0}
                >
                  查看全部
                </span>
              </h3>
              {recentTasks.length === 0 ? (
                <div className={styles.emptyHint}>暂无任务记录，去发起第一段对话吧</div>
              ) : (
                <div className={styles.taskList}>
                  {recentTasks.map((task) => (
                    <div
                      key={task.id}
                      className={styles.taskRow}
                      onClick={() => navigate('/chat')}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={styles.taskDot} style={{ background: task.color }} />
                      <span className={styles.taskTitle}>{task.title}</span>
                      <span className={styles.taskTag}>{task.tag}</span>
                      <span className={styles.taskTime}>{task.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
