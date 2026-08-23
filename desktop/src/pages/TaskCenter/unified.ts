// 统一任务中心 —— 统一任务模型与状态映射（纯函数，便于单测）

/** 统一任务状态：todo=待执行 running=执行中 done=成功 failed=失败 cancelled=已取消 */
export type UnifiedTaskStatus = "todo" | "running" | "done" | "failed" | "cancelled"

/** 任务来源：team=团队 task=我的任务 hermes=Hermes 调用日志 */
export type UnifiedTaskSource = "team" | "task" | "hermes"

export interface UnifiedTask {
  key: string // ${source}:${id}
  source: UnifiedTaskSource
  title: string
  status: UnifiedTaskStatus
  rawStatus: string
  assignee?: string
  createdAt: string
  finishedAt?: string | null
  briefId?: number
  /** 发布批次标识（同一次需求拆解共享，用于分组） */
  executionRef?: string
  /** 团队任务原始 result（Hermes 编排结果，含 steps，供流水线展示） */
  result?: unknown
  /** 执行方式：team=指定团队 auto=Hermes自动匹配 agent=指定单个Agent */
  executeMode?: "team" | "auto" | "agent"
  /** 指定单个 Agent（executeMode=agent 时指向 agents.id） */
  agentId?: number
}

/** 团队任务状态 → 统一状态 */
export function mapTeamStatus(s: string): UnifiedTaskStatus {
  if (s === "pending") return "todo"
  if (s === "in_progress") return "running"
  if (s === "completed") return "done"
  return "failed"
}

/** 我的任务状态 → 统一状态 */
export function mapTaskStatus(s: string): UnifiedTaskStatus {
  if (s === "queued") return "todo"
  if (s === "running") return "running"
  if (s === "success") return "done"
  if (s === "cancelled") return "cancelled"
  return "failed"
}

/** Hermes 调用状态 → 统一状态 */
export function mapHermesStatus(s: string): UnifiedTaskStatus {
  if (s === "running") return "running"
  if (s === "success") return "done"
  if (s === "timeout" || s === "failed") return "failed"
  return "todo"
}

/** 统一状态 Tag 文案与颜色（antd Tag：default/processing/success/error） */
export const STATUS_TAG_META: Record<UnifiedTaskStatus, { label: string; color: string }> = {
  todo: { label: "待执行", color: "default" },
  running: { label: "执行中", color: "processing" },
  done: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  cancelled: { label: "已取消", color: "default" },
}

/** 来源 Tag 文案与颜色（antd Tag：blue/gold/purple） */
export const SOURCE_TAG_META: Record<UnifiedTaskSource, { label: string; color: string }> = {
  team: { label: "团队", color: "blue" },
  task: { label: "任务", color: "gold" },
  hermes: { label: "Hermes", color: "purple" },
}

/** 状态主题色（TaskFlow 单线模式 themeColor 使用） */
export const STATUS_COLORS: Record<UnifiedTaskStatus, string> = {
  todo: "var(--color-text-tertiary)",
  running: "var(--color-primary)",
  done: "var(--color-success)",
  failed: "var(--color-error)",
  cancelled: "var(--color-text-disabled)",
}

/** 合并排序：按 createdAt 倒序（最新在前；非法时间排最后） */
export function sortByCreatedAtDesc(list: UnifiedTask[]): UnifiedTask[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}
/** 补漏输入的最小结构（与 TeamTask 字段兼容，避免页面模块耦合） */
export interface UnifiedFallbackTask {
  teamId?: number | null
  title: string
  status: string
  assigneeName?: string
  createdAt: string
  completedAt?: string
  briefId?: number
  executionRef?: string
  result?: unknown
  executeMode?: "team" | "auto" | "agent"
  agentId?: number
}

/** 补漏合并：unified 列表 + 「我的任务」里 unified 漏掉的 auto/agent 无团队归属任务（team_id 为空）
 *  只补无团队归属任务，避免普通团队任务与 unified 分页语义冲突；已出现的不重复并入；按查询条件过滤后统一排序 */
export function mergeUnifiedWithFallback(
  mapped: UnifiedTask[],
  teamTaskByKey: ReadonlyMap<string, UnifiedFallbackTask>,
  query: { status?: UnifiedTaskStatus; source?: UnifiedTaskSource } = {},
): UnifiedTask[] {
  if (query.source && query.source !== "team") return mapped
  const seen = new Set(mapped.map((x) => x.key))
  const extra: UnifiedTask[] = []
  teamTaskByKey.forEach((t, key) => {
    if (seen.has(key)) return
    if (t.teamId != null) return // 只补 auto/agent 无团队归属任务（unified 的 team 源可能不含 team_id 为空的任务）
    const status = mapTeamStatus(t.status)
    if (query.status && query.status !== status) return
    extra.push({
      key,
      source: "team",
      title: t.title,
      status,
      rawStatus: t.status,
      assignee: t.assigneeName,
      createdAt: t.createdAt,
      finishedAt: t.completedAt ?? null,
      briefId: t.briefId ?? undefined,
      executionRef: t.executionRef ?? undefined,
      result: t.result,
      executeMode: t.executeMode ?? undefined,
      agentId: t.agentId ?? undefined,
    })
  })
  return sortByCreatedAtDesc([...mapped, ...extra])
}

/** 任务分组（按发布批次）：executionRef → briefId → 单任务一组 */
export interface TaskGroup {
  key: string
  /** 组标题：需求/批次名 */
  title: string
  /** 组内最新任务时间（排序用） */
  createdAt: string
  tasks: UnifiedTask[]
}

/** 按发布批次分组；titleOf 可选：briefId → 需求标题（前端用简报 API 缓存提供） */
export function groupTasksByBatch(
  tasks: UnifiedTask[],
  titleOf?: (briefId: number) => string | undefined,
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>()
  const order: string[] = []
  const push = (t: UnifiedTask, key: string, title: string) => {
    let g = groups.get(key)
    if (!g) {
      g = { key, title, createdAt: t.createdAt, tasks: [] }
      groups.set(key, g)
      order.push(key)
    }
    g.tasks.push(t)
    if (new Date(t.createdAt).getTime() > new Date(g.createdAt).getTime()) g.createdAt = t.createdAt
  }
  for (const t of sortByCreatedAtDesc([...tasks])) {
    if (t.source === "team" && t.executionRef) push(t, "exec:" + t.executionRef, "")
    else if (t.source === "team" && t.briefId) push(t, "brief:" + t.briefId, "")
    else push(t, "one:" + t.key, t.title)
  }
  const out = order.map((k) => groups.get(k)!).map((g) => {
    g.tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (!g.title) {
      const brief = g.tasks.find((t) => t.briefId && titleOf?.(t.briefId))
      const bid = g.tasks.find((t) => t.briefId)?.briefId
      if (brief && titleOf) g.title = titleOf(brief.briefId as number) || ("需求单 #" + bid)
      else if (bid) g.title = "需求单 #" + bid
      else g.title = g.tasks[0]?.title || "未命名任务"
    }
    return g
  })
  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
