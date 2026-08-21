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
  /** 团队任务原始 result（Hermes 编排结果，含 steps，供流水线展示） */
  result?: unknown
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