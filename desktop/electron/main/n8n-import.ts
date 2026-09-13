// n8n 模板批量导入 / 激活（F5）
//
// 背景：本地 n8n（127.0.0.1:5678）的 12 个工作流模板此前靠人工「Import from File」逐个导入 +
// 手工激活 webhook。本模块用 n8n 公开 REST API（`/api/v1/workflows`）把它做成可重复执行的批处理：
// 已存在则更新（幂等），不存在则创建；随后按风控级别决定是否激活。
//
// 风控（F6 统一灰度）：`risk: 'high'` 的模板**默认只导入不激活**，需显式 `activateHighRisk`。
//
// 刻意不 import electron：本模块在脚本（tsx）与主进程里都能跑，且可注入 fetch 便于单测。

const DEFAULT_BASE_URL = 'http://127.0.0.1:5678'

/** 超时信号：优先用 AbortSignal.timeout（Node 18+）；测试环境（jsdom）缺该 API 时降级为不设超时 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  const factory = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
  if (typeof factory !== 'function') return undefined
  try {
    return factory(ms)
  } catch {
    return undefined
  }
}

export interface WorkflowPayload {
  name: string
  nodes: Array<Record<string, unknown>>
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
  [key: string]: unknown
}

/** 一个待导入的模板：id + 风控级别 + 工作流 JSON */
export interface ImportTarget {
  id: string
  name: string
  risk: 'readonly' | 'high'
  workflow: WorkflowPayload
}

export interface N8nImportOptions {
  /** n8n API Key（n8n → Settings → n8n API）。缺省时直接返回结构化失败，不发请求 */
  apiKey: string
  /** n8n 地址，默认 http://127.0.0.1:5678 */
  baseUrl?: string
  targets: ImportTarget[]
  /** 是否激活（默认 true）；高风险模板还要看 activateHighRisk */
  activate?: boolean
  /** 是否激活 risk=high 的模板（默认 false：只导入不激活） */
  activateHighRisk?: boolean
  /** 只读演练：照常拉取远端清单并计算 create/update，但不写不改 */
  dryRun?: boolean
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export type ImportAction = 'create' | 'update' | 'skip' | 'error'

export interface ImportItemResult {
  id: string
  name: string
  risk: string
  action: ImportAction
  remoteId?: string
  activated?: boolean
  detail?: string
}

export interface N8nImportReport {
  ok: boolean
  baseUrl: string
  dryRun: boolean
  created: number
  updated: number
  activated: number
  skipped: number
  failed: number
  items: ImportItemResult[]
  error?: string
}

interface RemoteWorkflow {
  id: string
  name?: string
  nodes?: Array<Record<string, unknown>>
}

/** 归一化 baseUrl：去尾部斜杠，缺省走本地 n8n */
export function normalizeBaseUrl(raw?: string): string {
  const value = String(raw || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  return value || DEFAULT_BASE_URL
}

/** 从工作流 JSON 里取 webhook 路径（模板的唯一稳定标识，改名也不影响幂等匹配） */
export function webhookPathOf(workflow: WorkflowPayload | undefined | null): string {
  const nodes = Array.isArray(workflow?.nodes) ? workflow!.nodes : []
  for (const node of nodes) {
    const type = String(node?.type ?? '')
    if (!type.includes('webhook')) continue
    const path = (node?.parameters as Record<string, unknown> | undefined)?.path
    if (typeof path === 'string' && path) return path.replace(/^\/+|\/+$/g, '')
  }
  return ''
}

/** 是否应该激活该模板 */
export function shouldActivate(
  target: Pick<ImportTarget, 'risk'>,
  opts: Pick<N8nImportOptions, 'activate' | 'activateHighRisk'>,
): boolean {
  if (opts.activate === false) return false
  if (target.risk === 'high' && opts.activateHighRisk !== true) return false
  return true
}

/** 拉取远端工作流清单（分页合并） */
async function listRemoteWorkflows(
  baseUrl: string,
  apiKey: string,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; list: RemoteWorkflow[] } | { ok: false; error: string }> {
  const list: RemoteWorkflow[] = []
  let cursor = ''
  try {
    for (let page = 0; page < 20; page += 1) {
      const url = `${baseUrl}/api/v1/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res = await doFetch(url, {
        method: 'GET',
        headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
        signal: timeoutSignal(timeoutMs),
      })
      const text = await res.text()
      if (!res.ok) {
        return { ok: false, error: `读取 n8n 工作流清单失败：HTTP ${res.status} ${text.slice(0, 200)}` }
      }
      const parsed = text ? (JSON.parse(text) as { data?: RemoteWorkflow[]; nextCursor?: string | null }) : {}
      for (const item of parsed.data ?? []) {
        if (item && typeof item.id === 'string') list.push(item)
      }
      if (!parsed.nextCursor) break
      cursor = String(parsed.nextCursor)
    }
    return { ok: true, list }
  } catch (err) {
    return { ok: false, error: `连接本地 n8n 失败：${(err as Error).message}` }
  }
}

/**
 * 批量导入（幂等）并按风控激活。
 * 单个模板失败不影响其它模板：失败项记进 items，整体 ok=false 由调用方决定是否中断。
 */
export async function importN8nWorkflows(opts: N8nImportOptions): Promise<N8nImportReport> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl)
  const doFetch = opts.fetchImpl ?? fetch
  const timeoutMs = Math.max(2000, Number(opts.timeoutMs) || 20000)
  const dryRun = opts.dryRun === true
  const report: N8nImportReport = {
    ok: true,
    baseUrl,
    dryRun,
    created: 0,
    updated: 0,
    activated: 0,
    skipped: 0,
    failed: 0,
    items: [],
  }

  if (!opts.apiKey) {
    report.ok = false
    report.error = '缺少 n8n API Key（--api-key 或环境变量 N8N_API_KEY）'
    return report
  }
  const targets = Array.isArray(opts.targets) ? opts.targets : []
  if (targets.length === 0) {
    report.ok = false
    report.error = '没有待导入的模板'
    return report
  }

  const remote = await listRemoteWorkflows(baseUrl, opts.apiKey, doFetch, timeoutMs)
  if (!remote.ok) {
    report.ok = false
    report.error = remote.error
    return report
  }
  const bySlug = new Map<string, RemoteWorkflow>()
  const byName = new Map<string, RemoteWorkflow>()
  for (const item of remote.list) {
    const slug = webhookPathOf(item as unknown as WorkflowPayload)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, item)
    if (item.name && !byName.has(item.name)) byName.set(item.name, item)
  }

  const authHeaders = (): Record<string, string> => ({
    'X-N8N-API-KEY': opts.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  })

  for (const target of targets) {
    const item: ImportItemResult = { id: target.id, name: target.name, risk: target.risk, action: 'skip' }
    report.items.push(item)
    const slug = webhookPathOf(target.workflow)
    const existing = (slug && bySlug.get(slug)) || byName.get(target.name)

    if (dryRun) {
      item.action = existing ? 'update' : 'create'
      item.remoteId = existing?.id
      item.detail = existing ? '演练：将覆盖已存在的工作流' : '演练：将新建工作流'
      if (!shouldActivate(target, opts)) {
        item.activated = false
        item.detail += '；高风险模板默认不激活'
      }
      continue
    }

    try {
      const body = JSON.stringify(target.workflow)
      let remoteId = existing?.id
      if (existing) {
        const res = await doFetch(`${baseUrl}/api/v1/workflows/${encodeURIComponent(existing.id)}`, {
          method: 'PUT',
          headers: authHeaders(),
          body,
          signal: timeoutSignal(timeoutMs),
        })
        const text = await res.text()
        if (!res.ok) {
          item.action = 'error'
          item.detail = `更新失败：HTTP ${res.status} ${text.slice(0, 200)}`
          report.failed += 1
          report.ok = false
          continue
        }
        item.action = 'update'
        report.updated += 1
      } else {
        const res = await doFetch(`${baseUrl}/api/v1/workflows`, {
          method: 'POST',
          headers: authHeaders(),
          body,
          signal: timeoutSignal(timeoutMs),
        })
        const text = await res.text()
        if (!res.ok) {
          item.action = 'error'
          item.detail = `创建失败：HTTP ${res.status} ${text.slice(0, 200)}`
          report.failed += 1
          report.ok = false
          continue
        }
        const created = text ? (JSON.parse(text) as { id?: string }) : {}
        remoteId = created?.id
        item.action = 'create'
        report.created += 1
      }
      item.remoteId = remoteId

      if (!shouldActivate(target, opts)) {
        item.activated = false
        item.detail = target.risk === 'high' ? '高风险模板：已导入，未激活（灰度关闭）' : '按参数要求保持未激活'
        continue
      }
      if (!remoteId) {
        item.activated = false
        item.detail = '未拿到远端 id，无法激活（请在 n8n 界面手动激活）'
        continue
      }
      const activation = await activateWorkflow(baseUrl, remoteId, authHeaders(), doFetch, timeoutMs)
      item.activated = activation.ok
      if (activation.ok) report.activated += 1
      item.detail = activation.detail
    } catch (err) {
      item.action = 'error'
      item.detail = `导入异常：${(err as Error).message}`
      report.failed += 1
      report.ok = false
    }
  }

  return report
}

/**
 * 激活工作流：优先用专用 activate 端点；老版本 n8n 没有该端点时回退到 PUT {active:true}。
 * 两者都不支持时返回 ok=false + 明确提示（由用户在 n8n 界面手动激活），不算致命错误。
 */
async function activateWorkflow(
  baseUrl: string,
  remoteId: string,
  headers: Record<string, string>,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: boolean; detail: string }> {
  const url = `${baseUrl}/api/v1/workflows/${encodeURIComponent(remoteId)}`
  try {
    const res = await doFetch(`${url}/activate`, {
      method: 'POST',
      headers,
      signal: timeoutSignal(timeoutMs),
    })
    if (res.ok) return { ok: true, detail: '已激活' }
    if (res.status !== 404 && res.status !== 405 && res.status !== 400) {
      const text = await res.text()
      return { ok: false, detail: `激活失败：HTTP ${res.status} ${text.slice(0, 200)}` }
    }
  } catch (err) {
    return { ok: false, detail: `激活异常：${(err as Error).message}` }
  }
  // 回退：PUT 工作流时带 active=true（n8n 1.x 公开 API 支持）
  try {
    const res = await doFetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ active: true }),
      signal: timeoutSignal(timeoutMs),
    })
    if (res.ok) return { ok: true, detail: '已激活（PUT active=true 回退路径）' }
    const text = await res.text()
    return { ok: false, detail: `未激活（n8n 版本不支持 API 激活）：HTTP ${res.status} ${text.slice(0, 160)}` }
  } catch (err) {
    return { ok: false, detail: `激活异常：${(err as Error).message}` }
  }
}

/** 人类可读报告（CLI 输出用） */
export function formatReport(report: N8nImportReport): string {
  const lines: string[] = []
  lines.push(`目标 n8n：${report.baseUrl}${report.dryRun ? '（演练模式，不写入）' : ''}`)
  if (report.error) lines.push(`错误：${report.error}`)
  for (const item of report.items) {
    const flag = item.action === 'error' ? 'FAIL' : item.action === 'create' ? 'NEW ' : item.action === 'update' ? 'UPD ' : 'SKIP'
    const act = item.activated === true ? ' 已激活' : ''
    lines.push(`[${flag}] ${item.name} (${item.id})${act}${item.detail ? ' — ' + item.detail : ''}`)
  }
  lines.push(
    `汇总：新建 ${report.created} / 更新 ${report.updated} / 激活 ${report.activated} / 跳过 ${report.skipped} / 失败 ${report.failed}`,
  )
  return lines.join('\n')
}
