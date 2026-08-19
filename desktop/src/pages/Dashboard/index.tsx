// 工作台 - Kimi 风格（v5.0）
// 定位: AI 办公入口首页（主导航已移除「仪表盘」，Logo/根路由进入本页）
// 结构: 问候区 + 5 统计卡 + (快捷入口 + 最近任务)
// 数据: 积分/会话/团队/服务/发布计划/云端需求单均接真实数据，失败降级为占位

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
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
  Server,
  Zap,
  Users,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useSystemStore } from '@/store/system'
import { getTransactions } from '@/api/credits-api'
import { listSessions } from '@/api/chat-api'
import { listTeams } from '@/api/team-api'
import { listServices } from '@/api/service-manager-api'
import { listPublishPlans } from '@/api/channel-api'
import { listBriefs } from '@/api/brief-api'
import type { CreditTransaction } from '@/types/credits'
import type { ChatSession } from '@/types/chat'
import type { Team } from '@/types/team'
import type { ServiceInfo } from '@/types/service-manager'
import type { PublishPlan } from '@/types/channel'
import type { BriefItem } from '@/api/brief-api'
import styles from './styles.module.css'
import { openAdminUrl } from '@/utils/admin-url'

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function dayKey(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function dateStr(d: Date): string {
  return dayKey(d)
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
  const backendAvailable = useSystemStore((s) => s.backendAvailable)

  const [loading, setLoading] = useState(true)
  const [settles, setSettles] = useState<CreditTransaction[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [services, setServices] = useState<ServiceInfo[] | null>(null)
  const [publishPlans, setPublishPlans] = useState<PublishPlan[]>([])
  const [briefs, setBriefs] = useState<BriefItem[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - 6)
      const end = new Date()
      const [txnRes, sessionRes, teamRes, svcRes, [publishPlanRes, briefRes]] = await Promise.all([
        getTransactions({
          type: 'settle',
          startDate: dateStr(weekStart),
          endDate: dateStr(end),
          pageSize: 100,
        }).catch(() => ({ list: [], total: 0 }) as never),
        listSessions({ pageSize: 8 }).catch(() => ({ list: [], total: 0 }) as never),
        listTeams().catch(() => [] as Team[]),
        listServices().catch(() => null as ServiceInfo[] | null),
        Promise.all([
          listPublishPlans().catch(() => [] as PublishPlan[]),
          listBriefs({ status: 'draft', pageSize: 100 }).catch(() => ({ list: [], total: 0 }) as never),
        ]),
      ])
      const txnList = (txnRes as { list?: CreditTransaction[] }).list || []
      const sessionList = (sessionRes as { list?: ChatSession[] }).list || []
      setSettles(txnList)
      setSessions(sessionList)
      setTeams(teamRes || [])
      setServices(svcRes)
      setPublishPlans(publishPlanRes)
      setBriefs((briefRes as { list?: BriefItem[] }).list || [])
    } catch (err) {
      console.error('[Workbench] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])


  /** 今日 AI 任务数（今日结算笔数） */
  const todayTasks = useMemo(() => {
    const today = dayKey(new Date())
    return settles.filter((s) => dayKey(new Date(s.createdAt)) === today).length
  }, [settles])

  /** 运行中服务 */
  const runningServices = useMemo(() => {
    if (!services) return null
    return services.filter((s) => s.status === 'running').length
  }, [services])

  /** 团队成员总数 / 团队数 */
  const memberTotal = useMemo(
    () => teams.reduce((sum, t) => sum + (Number(t.memberCount) || 0), 0),
    [teams],
  )

  /** 待我处理：待审核发布计划 + 云端草稿需求单 */
  const pendingReview = useMemo(
    () =>
      (publishPlans ?? []).filter(
        (p) => p.status === 'pending_review' || p.reviewStatus === 'pending',
      ).length,
    [publishPlans],
  )

  const draftBriefs = useMemo(
    () => (briefs ?? []).filter((b) => b.status === 'draft').length,
    [briefs],
  )

  const todoCount = pendingReview + draftBriefs

  /** 今日发布：scheduledAt 是今天的发布计划 */
  const todayPublishes = useMemo(
    () =>
      (publishPlans ?? []).filter((p) => {
        const d = new Date(p.scheduledAt ?? '')
        return !Number.isNaN(d.getTime()) && dayKey(d) === dayKey(new Date())
      }).length,
    [publishPlans],
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

  const showSkeleton = loading && settles.length === 0 && sessions.length === 0

  return (
    <div className={styles.workbench}>
      {/* 问候区 */}
      <header className={styles.head}>
        <h2 className={styles.title}>
          {greeting()}，{user?.username || '用户'}
        </h2>
        <p className={styles.sub}>今天是 {formatDate()}，团队一切正常运转</p>
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
            <div className={styles.statValue}>{todayTasks}</div>
            <div className={styles.statSub}>按今日结算估算</div>
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
          onClick={() => navigate('/services')}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <Server size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>服务健康</div>
            <div className={styles.statValue}>
              {runningServices != null ? (
                <>
                  {runningServices}
                  <span className={styles.statValueSuffix}>/ {services?.length ?? 0}</span>
                </>
              ) : backendAvailable ? (
                '在线'
              ) : (
                '—'
              )}
            </div>
            <div className={styles.statSub}>查看服务</div>
          </div>
        </div>
        <div
          className={styles.statCard}
          onClick={() => openAdminUrl("/admin/stats")}
          role="button"
          tabIndex={0}
        >
          <span className={styles.statIcon}>
            <BarChart3 size={20} />
          </span>
          <div className={styles.statInfo}>
            <div className={styles.statLabel}>数据分析</div>
            <div className={styles.statValue}>报表</div>
            <div className={styles.statSub}>打开管理后台完整报表</div>
          </div>
        </div>

      </div>


      {showSkeleton ? (
        <div className={styles.loadingWrap}>
          <Spin size="large" tip="正在加载工作台数据..." />
        </div>
      ) : (
        <div className={styles.grid}>
          {/* 快捷入口 */}
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

          {/* 最近任务 */}
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
      )}
    </div>
  )
}
