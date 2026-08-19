// 工作台聚合纯函数（可单测，不依赖 React/API）
// 供 Dashboard 各卡片组件与 tests/unit/dashboard-cards.test.ts 复用
// 约定：与 TaskCenter/unified.ts 相同——纯函数/纯数据独立成模块，组件只做渲染

import type { PublishPlan } from '@/types/channel'
import type { UnifiedTaskItem } from '@/api/task-api'
import type { Team, TeamMember, TeamTask } from '@/types/team'

/** 待审核判断：status=pending_review（兼容 reviewStatus=pending） */
export function isPendingReview(plan: PublishPlan): boolean {
  return plan.status === 'pending_review' || plan.reviewStatus === 'pending'
}

function compareTimeDesc(a: string, b: string): number {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return tb - ta
}

/** 待审核队列：过滤 pending_review，按创建时间倒序取前 N（默认 5） */
export function filterPendingReview(plans: PublishPlan[], limit = 5): PublishPlan[] {
  return plans
    .filter(isPendingReview)
    .sort((a, b) => compareTimeDesc(a.createdAt, b.createdAt))
    .slice(0, limit)
}

/** 进行中判断：统一任务状态 running（参考 TaskCenter/unified.ts：running=执行中） */
export function isInProgressTask(task: UnifiedTaskItem): boolean {
  return task.status === 'running'
}

/** 进行中任务：过滤 running，按创建时间倒序取前 N（默认 3） */
export function filterInProgress(tasks: UnifiedTaskItem[], limit = 3): UnifiedTaskItem[] {
  return tasks
    .filter(isInProgressTask)
    .sort((a, b) => compareTimeDesc(a.createdAt, b.createdAt))
    .slice(0, limit)
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function dayKeyOf(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 今日发布计划：按 scheduledAt 日期（YYYY-MM-DD）过滤，按排期时间升序 */
export function todayPlans(plans: PublishPlan[], todayStr: string): PublishPlan[] {
  return plans
    .filter((p) => {
      if (!p.scheduledAt) return false
      const d = new Date(p.scheduledAt)
      return !Number.isNaN(d.getTime()) && dayKeyOf(d) === todayStr
    })
    .sort((a, b) => {
      const ta = new Date(a.scheduledAt ?? '').getTime()
      const tb = new Date(b.scheduledAt ?? '').getTime()
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return ta - tb
    })
}

/** 本周任务数：任务 createdAt 落在最近 7 天内（含今天，与工作台统计口径一致） */
export function countWeekTasks(tasks: TeamTask[], now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - 6)
  const startMs = start.getTime()
  return tasks.filter((t) => {
    const tms = new Date(t.createdAt).getTime()
    return !Number.isNaN(tms) && tms >= startMs
  }).length
}

/** 团队状态聚合行 */
export interface TeamStatusRow {
  id: number
  name: string
  total: number
  busy: number
  idle: number
  weekCount: number
}

/** 团队忙闲聚合：total=成员数，busy=激活成员，idle=未激活成员，weekCount=本周任务数 */
export function aggregateTeamStatus(
  teams: Team[],
  membersByTeam: Map<number, TeamMember[]>,
  weekTaskCountByTeam: Map<number, number> = new Map(),
): TeamStatusRow[] {
  return teams.map((team) => {
    const members = membersByTeam.get(team.id) ?? []
    const busy = members.filter((m) => m.isActive).length
    return {
      id: team.id,
      name: team.name,
      total: Number(team.memberCount) || members.length,
      busy,
      idle: members.length - busy,
      weekCount: weekTaskCountByTeam.get(team.id) ?? 0,
    }
  })
}

/** 发布平台 emoji 标签（工作台自包含，避免与 Publish 页跨页耦合） */
export const PLATFORM_LABELS: Record<string, string> = {
  douyin: '🎵 抖音',
  xiaohongshu: '📕 小红书',
  weibo: '📢 微博',
  zhihu: '💡 知乎',
  bilibili: '📺 B站',
  wechat_mp: '💬 公众号',
}

/** 多平台展示：取前 2 个平台，超出显示总数 */
export function platformLabel(platforms: string[]): string {
  if (!platforms || platforms.length === 0) return '未选平台'
  const first = platforms.slice(0, 2).map((p) => PLATFORM_LABELS[p] ?? p).join(' / ')
  return platforms.length > 2 ? first + ' 等' + platforms.length + '个' : first
}
