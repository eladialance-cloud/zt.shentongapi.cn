/**
 * n8n-path-policy —— n8n webhook 路径净化与 flowId 形态校验（安全审计 S-24）
 *
 * 两个不同的注入面，同一类根因（渲染层/云端可控字符串直接进入 URL 或子进程 argv）：
 *
 * 1. n8n webhook 路径：`N8N_BASE + '/webhook/' + path`。
 *    若 path 含 `..`，请求会落到 N8N 的 /rest/* 管理接口，而该请求**携带云端 JWT**
 *    （payload.token / Authorization），等于把凭据送到非预期端点。
 *
 * 2. flowId：直接作为 Python `tool_box.py <id>` 的 argv。
 *    以 `-` 开头可伪装成 CLI 参数，含路径分隔符/空格可越界。
 *    params 侧已是单个 argv（JSON 串），注入面小；这里补齐 id 侧。
 *
 * 设计：整项丢弃而非「修正」，避免把可疑输入改写成一个看似合法的目标。
 */

/** 允许的路径字符：字母数字与 . _ - /（足够表达 webhook 路径，又不含任何 URL 结构字符） */
const WEBHOOK_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/
const MAX_WEBHOOK_PATHS = 10
const MAX_WEBHOOK_PATH_LENGTH = 200

/** flowId 允许的字符：字母数字与 . _ -，不得以 - 或 . 开头，不得含 .. */
const FLOW_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const MAX_FLOW_ID_LENGTH = 100

/**
 * 净化 n8n webhook 候选路径：非数组 → []；逐项去首尾斜杠；
 * 含 `..` / 查询串 / 锚点 / 空格 / 非法字符 / 超长 → 整项丢弃；最多保留前 10 项。
 */
export function sanitizeWebhookPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (out.length >= MAX_WEBHOOK_PATHS) break
    if (typeof raw !== 'string' && typeof raw !== 'number') continue
    const candidate = String(raw).trim().replace(/^\/+|\/+$/g, '')
    if (!candidate) continue
    if (candidate.length > MAX_WEBHOOK_PATH_LENGTH) continue
    if (candidate.includes('..')) continue
    if (!WEBHOOK_PATH_PATTERN.test(candidate)) continue
    out.push(candidate)
  }
  return out
}

/** flowId 形态是否合法（纯形态校验，不需要枚举已知业务流） */
export function isSafeFlowId(input: unknown): boolean {
  if (typeof input !== 'string') return false
  const id = input.trim()
  if (!id || id.length > MAX_FLOW_ID_LENGTH) return false
  if (id.startsWith('-') || id.startsWith('.')) return false
  if (id.includes('..')) return false
  return FLOW_ID_PATTERN.test(id)
}

/**
 * 是否命中已知业务流集合。
 *
 * 约定：`known` 为空集表示「引擎当前无法枚举」，返回 true（放行），
 * 由调用方**先**跑 isSafeFlowId 兜底 —— 否则一次 `--list` 超时就会让所有定时任务失败。
 */
export function assertKnownFlowId(flowId: unknown, known: ReadonlySet<string>): boolean {
  if (!known || known.size === 0) return true
  if (typeof flowId !== 'string') return false
  return known.has(flowId.trim())
}
