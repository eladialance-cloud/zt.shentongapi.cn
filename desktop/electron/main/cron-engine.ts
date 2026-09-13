/** @file 无人值守定时任务引擎（主进程）
 *
 * 对标 RRClaw 的常驻调度：把定时任务的触发从「渲染进程（关窗口即停）」搬到主进程。
 *
 * 运行语义：
 *  - 主进程存活即轮询（默认 30s），窗口关闭最小化到托盘时继续执行（托盘常驻）；
 *  - 每次触发：POST /scheduled-tasks/:id/fire 占位（后端 10 分钟窗口防重复）→
 *      按 executeKind 分流：flow=主进程直跑业务流引擎；llm=创建团队任务 + 提交 Hermes 逐步编排 →
 *      POST /scheduled-tasks/:id/fired 回执（后端据此推进下次时间 / 记录 lastError）；
 *  - 每条触发写本地 local_scheduled_runs 执行日志（成功/失败均回填）。
 *
 * 依赖注入（便于单测）：fetch / runFlow / runLlm / 日志读写 / 通知 均可注入。
 * 开关持久化：<statePath> 记录 backgroundEnabled（默认 true）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runFlow } from './flow-executor'

export const DEFAULT_TICK_MS = 30_000

/** 定时任务（后端实体子集，字段与 scheduled-tasks 契约一致） */
export interface CronScheduledTask {
  id: number
  title: string
  description?: string | null
  teamId?: number | null
  agentId?: string | null
  repeatType: 'once' | 'daily' | 'weekly'
  runTime?: string | null
  weekday?: number | null
  dueAt?: string | null
  nextRunAt?: string | null
  status: 'active' | 'paused' | 'done' | 'failed'
  executeKind?: 'llm' | 'flow' | null
  flowId?: string | null
  flowParams?: string | null
  lastRunAt?: string | null
  lastError?: string | null
}

export interface CronEngineRunLog {
  scheduledId: number
  userId: number
  title?: string
  executeKind: 'llm' | 'flow'
  flowId?: string | null
  teamTaskId?: number | null
}

export interface CronEngineDeps {
  /** 云端 API 基址（如 https://zt.shentongapi.cn/api） */
  stApiBase: string
  /** 读取当前登录 JWT（未登录返回 null → 本轮跳过） */
  getToken: () => string | null
  /**
   * llm 路径执行器：创建团队任务 + 提交 Hermes 逐步编排。
   * 由主进程注入（复用既有 stepRunners 与团队成员装载逻辑），失败抛错。
   */
  runLlm: (token: string, item: CronScheduledTask) => Promise<{ teamTaskId: number }>
  /** 写执行日志（返回日志行 id；降级/失败返回 null 不阻断） */
  createRun: (input: CronEngineRunLog) => Promise<number | null>
  /** 回填执行日志 */
  finishRun: (id: number, patch: { status: 'success' | 'error'; errorMessage?: string | null; resultSummary?: string | null; durationMs?: number | null }) => Promise<void>
  /** 状态广播（可选；用于给渲染层发事件） */
  notify?: (payload: { type: 'executed' | 'error' | 'state'; taskId?: number; ok?: boolean; error?: string; enabled?: boolean }) => void
  /** 可注入 fetch（单测） */
  fetchImpl?: typeof fetch
  /** 轮询间隔（默认 30s） */
  intervalMs?: number
  /** 开关持久化路径（默认不落盘） */
  statePath?: string
  /** 日志器 */
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }
}

export interface CronEngineState {
  enabled: boolean
  running: boolean
  lastTickAt: string | null
  lastError: string | null
  executed: number
  errors: number
}

/** 解析业务流参数（非法 JSON / 非对象抛错，避免把坏参数丢给执行体） */
export function parseFlowParams(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('业务流参数必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

/** 任务是否到期（active 且 nextRunAt ≤ now + 容忍窗口） */
export function isDue(item: CronScheduledTask, now: number, slackMs = 5000): boolean {
  if (item.status !== 'active' || !item.nextRunAt) return false
  const t = new Date(item.nextRunAt).getTime()
  return Number.isFinite(t) && t <= now + slackMs
}

export class CronEngine {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private enabled = true
  private readonly fetchImpl: typeof fetch
  private readonly intervalMs: number
  private readonly log: NonNullable<CronEngineDeps['logger']>
  private state: CronEngineState = {
    enabled: true,
    running: false,
    lastTickAt: null,
    lastError: null,
    executed: 0,
    errors: 0,
  }

  constructor(private readonly deps: CronEngineDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.intervalMs = deps.intervalMs ?? DEFAULT_TICK_MS
    this.log = deps.logger ?? {
      info: (m) => console.log('[cron-engine] ' + m),
      warn: (m) => console.warn('[cron-engine] ' + m),
      error: (m) => console.error('[cron-engine] ' + m),
    }
    this.loadState()
  }

  getState(): CronEngineState {
    return { ...this.state, running: this.timer !== null }
  }

  getEnabled(): boolean {
    return this.enabled
  }

  /** 开关后台常驻调度（关：主进程不再触发；窗口内渲染调度器仍可继续） */
  setEnabled(enabled: boolean): CronEngineState {
    this.enabled = !!enabled
    this.state.enabled = this.enabled
    this.saveState()
    this.deps.notify?.({ type: 'state', enabled: this.enabled })
    return this.getState()
  }

  /** 启动引擎：立即跑一轮 + 定时轮询 */
  start(): void {
    if (this.timer) return
    this.log.info(`启动（间隔 ${this.intervalMs}ms，enabled=${this.enabled}）`)
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    // 立即跑一轮，避免刚创建的近期任务等到下一个周期
    void this.tick()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 单轮：列出所有定时任务，执行到期项（逐任务隔离错误） */
  async tick(): Promise<{ executed: number; errors: number }> {
    if (!this.enabled) return { executed: 0, errors: 0 }
    if (this.ticking) return { executed: 0, errors: 0 }
    const token = this.deps.getToken()
    if (!token) return { executed: 0, errors: 0 }
    this.ticking = true
    let executed = 0
    let errors = 0
    try {
      const list = await this.listTasks(token)
      const now = Date.now()
      for (const item of list) {
        if (!isDue(item, now)) continue
        try {
          const r = await this.runOne(token, item)
          if (r.executed) {
            executed += 1
            if (r.error) errors += 1
          }
        } catch (err) {
          errors += 1
          this.log.warn('任务 ' + item.id + ' 执行异常: ' + (err instanceof Error ? err.message : String(err)))
        }
      }
      this.state.lastTickAt = new Date().toISOString()
      this.state.executed += executed
      this.state.errors += errors
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err)
      this.log.warn('轮询失败: ' + this.state.lastError)
    } finally {
      this.ticking = false
    }
    return { executed, errors }
  }

  /** 手动立即执行（不受 nextRunAt 限制；仍走 fire 占位防并发） */
  async runNow(taskId: number): Promise<{ executed: boolean; error?: string }> {
    const token = this.deps.getToken()
    if (!token) return { executed: false, error: '未登录' }
    const item = await this.getTask(token, taskId)
    if (!item) return { executed: false, error: '任务不存在' }
    return this.runOne(token, item)
  }

  /** fire → 按 executeKind 分流执行 → fired 回执；返回是否执行 */
  private async runOne(token: string, item: CronScheduledTask): Promise<{ executed: boolean; error?: string }> {
    let claimed: CronScheduledTask
    try {
      claimed = await this.fire(token, item.id)
    } catch {
      return { executed: false } // 未到期或正在触发中
    }
    const executeKind: 'llm' | 'flow' = (claimed.executeKind ?? item.executeKind) ?? 'llm'
    const flowId = ((claimed.flowId ?? item.flowId) ?? '').trim()
    const startTime = Date.now()

    const runId = await this.deps
      .createRun({
        scheduledId: item.id,
        userId: 0,
        title: claimed.title ?? item.title,
        executeKind,
        flowId: flowId || null,
      })
      .catch(() => null)

    const finish = async (patch: Parameters<CronEngineDeps['finishRun']>[1]) => {
      if (runId == null) return
      await this.deps.finishRun(runId, patch).catch(() => undefined)
    }

    try {
      if (executeKind === 'flow') {
        if (!flowId) throw new Error('执行方式为业务流但未指定业务流 id')
        const params = parseFlowParams(claimed.flowParams ?? item.flowParams)
        const result = await runFlow(flowId, { params })
        if (!result?.ok) {
          throw new Error(`业务流执行失败[${result?.code ?? 'FLOW_FAILED'}]：${result?.error ?? '未知错误'}`)
        }
        await this.fired(token, item.id, { success: true })
        await finish({
          status: 'success',
          resultSummary: result.data ? JSON.stringify(result.data).slice(0, 500) : null,
          durationMs: result.durationMs ?? Date.now() - startTime,
        })
        this.deps.notify?.({ type: 'executed', taskId: item.id, ok: true })
        return { executed: true }
      }

      const { teamTaskId } = await this.deps.runLlm(token, claimed)
      await this.fired(token, item.id, { success: true })
      await finish({
        status: 'success',
        resultSummary: `已提交 Hermes 编排（团队任务 #${teamTaskId}）`,
        durationMs: Date.now() - startTime,
      })
      this.deps.notify?.({ type: 'executed', taskId: item.id, ok: true })
      return { executed: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      try {
        await this.fired(token, item.id, { success: false, error: msg })
      } catch {
        /* 回执失败不影响结果 */
      }
      await finish({ status: 'error', errorMessage: msg.slice(0, 2000), durationMs: Date.now() - startTime })
      this.deps.notify?.({ type: 'error', taskId: item.id, ok: false, error: msg })
      this.log.warn('任务 ' + item.id + ' 执行失败: ' + msg)
      return { executed: true, error: msg }
    }
  }

  // ===== HTTP =====

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  }

  private async listTasks(token: string): Promise<CronScheduledTask[]> {
    const res = await this.fetchImpl(this.deps.stApiBase.replace(/\/+$/, '') + '/scheduled-tasks', {
      headers: this.authHeaders(token),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error('拉取定时任务失败: HTTP ' + res.status)
    return unwrapList(await res.json())
  }

  private async getTask(token: string, id: number): Promise<CronScheduledTask | null> {
    const res = await this.fetchImpl(this.deps.stApiBase.replace(/\/+$/, '') + `/scheduled-tasks/${id}`, {
      headers: this.authHeaders(token),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return unwrapOne(await res.json())
  }

  private async fire(token: string, id: number): Promise<CronScheduledTask> {
    const res = await this.fetchImpl(this.deps.stApiBase.replace(/\/+$/, '') + `/scheduled-tasks/${id}/fire`, {
      method: 'POST',
      headers: this.authHeaders(token),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error('fire 失败: HTTP ' + res.status)
    return unwrapOne(await res.json())
  }

  private async fired(token: string, id: number, body: { success: boolean; error?: string }): Promise<void> {
    const res = await this.fetchImpl(this.deps.stApiBase.replace(/\/+$/, '') + `/scheduled-tasks/${id}/fired`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error('fired 失败: HTTP ' + res.status)
  }

  // ===== 开关持久化 =====

  private loadState(): void {
    const p = this.deps.statePath
    if (!p || !existsSync(p)) return
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { backgroundEnabled?: boolean }
      if (typeof raw.backgroundEnabled === 'boolean') {
        this.enabled = raw.backgroundEnabled
        this.state.enabled = this.enabled
      }
    } catch {
      /* 损坏则用默认值 */
    }
  }

  private saveState(): void {
    const p = this.deps.statePath
    if (!p) return
    try {
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, JSON.stringify({ backgroundEnabled: this.enabled }, null, 2), 'utf8')
    } catch {
      /* 落盘失败不影响运行 */
    }
  }
}

/** 兼容后端统一响应包装 { code, data } 与裸数组 */
export function unwrapList(json: unknown): CronScheduledTask[] {
  const data = unwrapAny(json)
  return Array.isArray(data) ? (data as CronScheduledTask[]) : []
}

/** 兼容 { code, data } 与裸对象两种返回 */
export function unwrapOne(json: unknown): CronScheduledTask {
  return unwrapAny(json) as CronScheduledTask
}

function unwrapAny(json: unknown): unknown {
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as Record<string, unknown>).data
  }
  return json
}

/** 工厂：构造引擎（开关状态落 <userData>/cron-engine-state.json） */
export function createCronEngine(deps: CronEngineDeps): CronEngine {
  return new CronEngine(deps)
}

export function defaultCronEngineStatePath(userDataDir: string): string {
  return join(userDataDir, 'cron-engine-state.json')
}
