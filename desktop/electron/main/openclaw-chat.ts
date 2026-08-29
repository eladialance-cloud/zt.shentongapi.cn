/**
 * OpenClaw 本地直达对话（主进程服务）
 *
 * 链路（v2 设计 docs/superpowers/specs/2026-08-08-openclaw-chat-direct-design.md）：
 *   1. 本地 OpenClaw /v1/chat/completions（OpenAI 兼容 SSE 流式）
 *   2. OpenClaw 的 openai provider 指向云端 llm-proxy（baseUrl+用户静态 Key，service-manager 注入）
 *   3. llm-proxy 按后台供应商直连 + 按「后台定价 × 实际 token」扣费（本服务不再单独记账，避免双重扣费）
 *
 * 消息内容全程留在用户本地，云端只做模型调用与扣费。
 * 登录信息写入 userData/openclaw-chat/auth.json，供 OpenClaw 工具卡（n8n-run-workflow）读取并按工作流定价扣费。
 *
 * 本模块不依赖 electron（便于 node:test 单测：npx tsx --test tests/unit/openclaw-chat.test.ts）。
 */

import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { WebSocket } from 'ws'
import { normalizeChatEndpoint } from './llm-integrations'

// ===== 常量 =====

/** 本地 OpenClaw Gateway 地址（service-manager SERVICE_DEFS.openclaw.port=8080） */
export const OPENCLAW_LOCAL_BASE = 'http://127.0.0.1:8080'
export const OPENCLAW_LOCAL_PORT = 8080
/** OpenClaw OpenAI 兼容端点使用的代理模型名（L0 探针结论） */
export const OPENCLAW_MODEL = 'openclaw/default'

// ===== 类型 =====

export interface OpenClawUsage {
  input: number
  output: number
  total: number
}

export interface OpenClawToolCall {
  id: string
  name: string
  input: unknown
  /** 工具调用状态：start 开始 / done 完成 / error 失败（WS 网关事件链路） */
  state?: 'start' | 'done' | 'error'
  /** 工具执行结果摘要（done/error 时） */
  output?: unknown
}

export interface OpenClawChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 主进程 → 渲染进程事件（IPC openclaw-chat:*） */
export interface OpenClawLifecycleInfo {
  phase: 'start' | 'finishing' | 'end' | 'error'
  stopReason?: string
  error?: string
}

export interface OpenClawChatEvent {
  type: 'message' | 'tool-call' | 'done' | 'lifecycle'
  content?: string
  toolCall?: OpenClawToolCall
  usage?: OpenClawUsage
  lifecycle?: OpenClawLifecycleInfo
}

export interface OpenClawSendParams {
  text: string
  /** 云端登录 token（渲染进程传入，主进程仅本会话内使用；工具卡读 auth.json） */
  token: string
  /** 用户当前选择的模型（写入上下文供工具卡/调试，实际扣费由 llm-proxy 按用户默认模型处理） */
  modelId?: string
  /** 最近会话上下文（可选，最近 N 条，消息不出本机） */
  history?: OpenClawChatMessage[]
  /** 知识库检索范围：指定库 ID（undefined=全局搜索） */
  knowledgeBaseId?: number
  /** 桌面端会话 ID：映射到本地 OpenClaw 会话 key（同会话连续上下文，切换会话自动新建） */
  sessionId?: number
}

export interface OpenClawChatDeps {
  /** 本地 OpenClaw 对话（SSE 流式），逐块 yield 文本 */
  callOpenClaw: (
    params: OpenClawSendParams,
    onEvent: (e: OpenClawChatEvent) => void,
    signal: AbortSignal,
  ) => AsyncGenerator<string, void, unknown>
  /** 自定义大模型直连（modelId 以 custom/ 开头时使用；不经 llm-proxy、不扣平台积分） */
  callCustomModel?: (
    params: OpenClawSendParams,
    onEvent: (e: OpenClawChatEvent) => void,
    signal: AbortSignal,
  ) => AsyncGenerator<string, void, unknown>
  /** 确保 OpenClaw 服务运行中（未运行则启动；启动失败抛错） */
  ensureOpenClaw?: () => Promise<void>
  /** 上下文目录（默认 userData/openclaw-chat，由主进程注入） */
  contextDir?: string
}

export interface OpenClawSendResult {
  usage?: OpenClawUsage
  /** 用户中断（abort）时为 true */
  aborted: boolean
}

// ===== 服务 =====

/**
 * OpenClaw 对话主进程服务：确保本地 OpenClaw 运行 → 本地流式对话。
 * 扣费由云端 llm-proxy 按实际用量完成（服务内不再做 start/settle）。
 * 事件（EventEmitter）：
 *   'event'  (OpenClawChatEvent)  工具调用/完成等结构化事件
 *   'busy'   (boolean)            发送中状态变化
 */
export class OpenClawChatService extends EventEmitter {
  private activeAbort: AbortController | null = null

  constructor(private readonly deps: OpenClawChatDeps) {
    super()
  }

  /** 是否正在对话中 */
  get busy(): boolean {
    return this.activeAbort !== null
  }

  async send(
    params: OpenClawSendParams,
    onChunk: (chunk: string) => void,
    onEvent: (e: OpenClawChatEvent) => void,
    onFinalize?: (content: string) => void,
  ): Promise<OpenClawSendResult> {
    if (!params.token) throw new Error('未登录')
    const text = params.text?.trim()
    if (!text) throw new Error('消息内容为空')

    // 0) 自定义大模型直连（custom/<integrationId>/<modelId>）：不经 OpenClaw / llm-proxy
    const useCustomModel = (params.modelId ?? '').startsWith('custom/')
    const caller = useCustomModel ? this.deps.callCustomModel : this.deps.callOpenClaw
    if (!caller) {
      throw new Error(
        useCustomModel ? '自定义大模型通道不可用（请到设置→大模型接入检查配置）' : 'OpenClaw 对话通道不可用',
      )
    }
    // 0.1) 平台模型走本地 OpenClaw（未运行自动启动；模型 Key 由 service-manager 注入配置）
    if (!useCustomModel && this.deps.ensureOpenClaw) {
      await this.deps.ensureOpenClaw()
    }
    this.writeContext(params)

    const abort = new AbortController()
    this.activeAbort = abort
    this.emit('busy', true)
    let usage: OpenClawUsage | undefined
    let error: Error | null = null
    let fullText = ''
    const events: OpenClawChatEvent[] = []

    try {
      // 1) 本地 OpenClaw 对话（SSE 流式；OpenClaw 内部经 llm-proxy 调后台模型并扣费）
      //    自定义模型则直连用户填写的 OpenAI 兼容端点（无工具/Agent，纯文本流式）
      for await (const chunk of caller(
        { ...params, text },
        (e) => {
          if (e.type === 'done') usage = e.usage
          events.push(e)
          onEvent(e)
        },
        abort.signal,
      )) {
        fullText += chunk
        onChunk(chunk)
      }

      // 2) 终审（脱敏/空结果）+ 产物来源标注（流结束后一次性应用）
      if (onFinalize && !error) {
        const reviewed = this.terminalReview(fullText, events)
        const finalText = this.formatResult(reviewed, events)
        if (finalText && finalText !== fullText) {
          onFinalize(finalText)
        }
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
    } finally {
      this.clearContext()
      this.activeAbort = null
      this.emit('busy', false)
    }

    const aborted = error ? isAbortError(error) : false
    if (error && !aborted) throw error
    return { usage, aborted }
  }

  /** 中断当前对话（本地 fetch abort） */
  abort(): void {
    this.activeAbort?.abort()
  }

  /** 同步最新云端 token 到 auth.json（登录/刷新 token 时由渲染进程调用，供工具卡读取） */
  syncAuthToken(token: string): void {
    if (!this.deps.contextDir || typeof token !== 'string' || !token) return
    try {
      mkdirSync(this.deps.contextDir, { recursive: true })
      writeFileSync(
        join(this.deps.contextDir, 'auth.json'),
        JSON.stringify({ token }),
        'utf-8',
      )
    } catch (err) {
      console.error('[openclaw-chat] sync auth token failed:', err)
    }
  }

  private writeContext(params: OpenClawSendParams): void {
    if (!this.deps.contextDir) return
    try {
      mkdirSync(this.deps.contextDir, { recursive: true })
      // 工具卡（n8n-run-workflow）扣费需要 JWT：写入 auth.json
      writeFileSync(
        join(this.deps.contextDir, 'auth.json'),
        JSON.stringify({ token: params.token }),
        'utf-8',
      )
      writeFileSync(
        join(this.deps.contextDir, 'current-accounting.json'),
        JSON.stringify({ modelId: params.modelId ?? null }),
        'utf-8',
      )
      // 知识库检索范围（knowledge-query 工具卡读取）：空 = 全局搜索；有值 = 指定库
      writeFileSync(
        join(this.deps.contextDir, 'knowledge-scope.json'),
        JSON.stringify(
          params.knowledgeBaseId
            ? { mode: 'kb', kbId: params.knowledgeBaseId }
            : { mode: 'global' },
        ),
        'utf-8',
      )
    } catch (err) {
      console.error('[openclaw-chat] write context failed:', err)
    }
  }

  /** 终审：敏感信息脱敏 + 空结果兜底 + 工具调用无解释时补充说明 */
  private terminalReview(content: string, events: OpenClawChatEvent[]): string {
    // 安全检查：银行卡 16-19 位 / 身份证 15/18 位脱敏
    let sanitized = content
      .replace(/\b\d{16,19}\b/g, '****')
      .replace(/\b\d{17}[\dXx]\b/g, '****')

    // 完整性检查：空结果兜底
    if (!sanitized.trim()) {
      return '(结果为空，请检查输入或重试)'
    }

    // 有工具调用但无解释时，补充来源说明
    const hasToolCall = events.some((e) => e.type === 'tool-call')
    const hasExplanation = sanitized.length > 20
    if (hasToolCall && !hasExplanation) {
      sanitized = sanitized + '\n\n*(以上结果由工具自动生成)*'
    }
    return sanitized
  }

  /** 产物来源标注：根据工具调用追加 📊 数据来源 */
  private formatResult(content: string, events: OpenClawChatEvent[]): string {
    const toolCalls = events.filter((e) => e.type === 'tool-call' && e.toolCall)
    if (toolCalls.length === 0) return content
    const sources = [
      ...new Set(
        toolCalls.map((tc) => {
          const name = tc.toolCall!.name
          switch (name) {
            case 'hermes-agent':
              return 'Hermes 编排引擎'
            case 'n8n-run-workflow':
              return 'N8N 工作流'
            case 'knowledge-query':
              return '知识库'
            default:
              return name
          }
        }),
      ),
    ]
    return content + '\n\n---\n📊 数据来源: ' + sources.join('、')
  }

  private clearContext(): void {
    if (!this.deps.contextDir) return
    try {
      writeFileSync(
        join(this.deps.contextDir, 'current-accounting.json'),
        '{}',
        'utf-8',
      )
    } catch {
      // 清理失败不阻塞
    }
  }
}

function isAbortError(err: Error): boolean {
  return err?.name === 'AbortError' || err?.message?.includes('aborted')
}

// ===== OpenClaw Gateway WebSocket 客户端（富事件链路） =====
// 替代 OpenAI 兼容 SSE：WS 网关提供 agent lifecycle / assistant delta / chat final 事件，
// 用于渲染「思考 → 派发 → 工具执行 → 完成」的完整过程面板（探针实测协议 v4）。

interface WsGatewayFrame {
  type?: string
  id?: string
  ok?: boolean
  event?: string
  payload?: Record<string, any>
  error?: unknown
}

type WsGatewayListener = (frame: WsGatewayFrame) => void

/**
 * OpenClaw Gateway WS 连接（连接复用、按需重连）。
 * 握手：connect(role=operator, client.id=gateway-client) → hello-ok；事件帧 { type:'event', event, payload }。
 */
export class OpenClawWsGateway {
  private ws: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private readonly pending = new Map<string, (frame: WsGatewayFrame) => void>()
  private readonly listeners = new Set<WsGatewayListener>()
  private seq = 0
  private readonly sessionKeys = new Map<number, string>()

  constructor(private readonly baseUrl = OPENCLAW_LOCAL_BASE) {}

  /** 确保已连接（已连接直接返回；断线自动重连） */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.baseUrl.replace(/^http/, 'ws')
      const ws = new WebSocket(url)
      this.ws = ws
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error('本地 OpenClaw 网关连接超时'))
      }, 10_000)
      ws.on('open', () => {
        clearTimeout(timer)
        this.sendReq('connect', {
          minProtocol: 4,
          maxProtocol: 4,
          client: {
            id: 'gateway-client',
            displayName: 'shentong-desktop',
            version: '1.0.0',
            platform: process.platform,
            mode: 'backend',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          auth: {},
          locale: 'zh-CN',
          userAgent: 'shentong-desktop/1.0.0',
        })
          .then((res) => {
            if (res && res.ok === false) {
              reject(new Error('OpenClaw 网关连接被拒绝: ' + JSON.stringify(res.error)))
              return
            }
            resolve()
          })
          .catch((err) => reject(err))
      })
      ws.on('message', (data) => {
        let frame: WsGatewayFrame
        try {
          frame = JSON.parse(data.toString())
        } catch {
          return
        }
        if (frame.type === 'res' && frame.id && this.pending.has(frame.id)) {
          const cb = this.pending.get(frame.id)!
          this.pending.delete(frame.id)
          cb(frame)
          return
        }
        if (frame.type === 'event') {
          for (const fn of this.listeners) {
            try {
              fn(frame)
            } catch {
              /* 单个监听器异常不影响其他监听器 */
            }
          }
        }
      })
      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      ws.on('close', () => {
        this.ws = null
        const stale = [...this.pending.values()]
        this.pending.clear()
        for (const cb of stale) cb({ type: 'res', ok: false, error: 'connection closed' })
      })
    })
  }

  private sendReq(method: string, params: unknown): Promise<WsGatewayFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('OpenClaw 网关未连接'))
    }
    const id = 'st-' + ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, (frame) => {
        if (frame.ok === false) {
          reject(new Error('OpenClaw ' + method + ' 失败: ' + JSON.stringify(frame.error)))
        } else {
          resolve(frame)
        }
      })
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('OpenClaw ' + method + ' 超时'))
        }
      }, 10_000)
    })
  }

  /** 调用网关 RPC，返回 payload */
  async call(method: string, params: unknown = {}): Promise<unknown> {
    await this.connect()
    const frame = await this.sendReq(method, params)
    return frame.payload
  }

  /** 订阅网关事件；返回取消函数 */
  subscribe(listener: WsGatewayListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 桌面会话 → OpenClaw 会话 key（首次创建并缓存；同桌面会话上下文连续） */
  async getSessionKey(desktopSessionId: number): Promise<string> {
    const cached = this.sessionKeys.get(desktopSessionId)
    if (cached) return cached
    const payload = (await this.call('sessions.create', { agentId: 'main' })) as { key?: string }
    if (!payload?.key) throw new Error('OpenClaw 会话创建失败')
    this.sessionKeys.set(desktopSessionId, payload.key)
    return payload.key
  }

  /** 中断某次对话（失败不阻塞，本地连接关闭兜底） */
  async abortChat(sessionKey: string, runId: string): Promise<void> {
    try {
      await this.call('chat.abort', { sessionKey, runId })
    } catch {
      // ignore
    }
  }

  close(): void {
    this.ws?.terminate()
    this.ws = null
  }
}

/** 工具状态归一化（WS 事件里的 state/status → 前端状态机） */
function normalizeToolState(state: unknown): 'start' | 'done' | 'error' | undefined {
  const s = String(state ?? '').toLowerCase()
  if (s === 'done' || s === 'complete' || s === 'completed' || s === 'success' || s === 'ok' || s === 'finished') {
    return 'done'
  }
  if (s === 'error' || s === 'failed' || s === 'fail' || s === 'rejected') {
    return 'error'
  }
  return 'start'
}

function normalizeToolCall(tc: Record<string, any>, data: Record<string, any>): OpenClawToolCall {
  const name =
    tc.name ?? tc.tool ?? tc.toolName ?? (tc.function && tc.function.name) ?? data.name ?? data.toolName ?? 'tool'
  return {
    id: String(tc.id ?? tc.toolId ?? data.id ?? data.toolId ?? 'tool_' + String(name)),
    name: String(name),
    input: tc.args ?? tc.arguments ?? tc.input ?? (tc.function && tc.function.arguments) ?? data.args ?? data.input,
    state: normalizeToolState(tc.state ?? tc.status ?? data.state ?? data.status),
    output: tc.output ?? tc.result ?? data.output ?? data.result,
  }
}

/** 尽力解析 WS 事件帧里的工具调用（OpenClaw 工具事件格式随版本演进，做多种兼容） */
function tryParseToolPayload(payload: Record<string, any>): OpenClawToolCall | null {
  const data = payload.data ?? {}
  const direct = data.toolCall ?? data.tool ?? payload.toolCall
  if (direct && typeof direct === 'object' && (direct.id || direct.name || direct.tool)) {
    return normalizeToolCall(direct, data)
  }
  const stream = payload.stream as string
  if (stream === 'tool' || stream === 'tools' || stream === 'toolCall' || stream === 'function' || stream === 'tool_execution') {
    const name = data.name ?? data.tool ?? data.toolName ?? (data.function && data.function.name)
    if (name) {
      return normalizeToolCall({}, data)
    }
  }
  const toolCalls = data.toolCalls ?? payload.toolCalls
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return normalizeToolCall(toolCalls[0], data)
  }
  return null
}

/**
 * 本地 OpenClaw 对话调用（WS 网关富事件链路）。
 * yield 文本增量；Agent 生命周期 / 工具调用通过 onEvent 上报。
 * 事件流（实测）：agent(assistant delta / lifecycle) + chat(delta/final)。
 */
export function createLocalOpenClawWsCaller(
  baseUrl = OPENCLAW_LOCAL_BASE,
  gateway = new OpenClawWsGateway(baseUrl),
): OpenClawChatDeps['callOpenClaw'] {
  return async function* callOpenClaw(
    params: OpenClawSendParams,
    onEvent: (e: OpenClawChatEvent) => void,
    signal: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    await gateway.connect()
    const sessionKey = await gateway.getSessionKey(params.sessionId ?? 0)

    // 历史已由 OpenClaw 会话自身维护（同 sessionKey 连续上下文）；
    // 跨重启/新建会话时 OpenClaw 从当前消息开始，渲染层仍展示完整历史。

    // 用户选择的平台模型 → 先写入 OpenClaw 会话（sessions.patch 设置 modelOverride），
    // chat.send 才会真正使用该模型；失败不阻塞（后端 llm-proxy 仍有 defaultChatModel 兜底）。
    // OpenClaw 的 chat.send 不接受 model 参数，模型只从会话条目/配置解析，必须在发送前落盘。
    const selectedModel = (params.modelId ?? '').trim()
    if (selectedModel && !selectedModel.startsWith('custom/')) {
      try {
        await Promise.race([
          gateway.call('sessions.patch', { key: sessionKey, model: selectedModel }),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ])
      } catch (err) {
        console.warn(
          '[openclaw-chat] sessions.patch 模型写入失败（忽略，走用户默认模型）: ' +
            (err instanceof Error ? err.message : String(err)),
        )
      }
    }

    const runId = 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const sendRes = (await gateway.call('chat.send', {
      sessionKey,
      message: params.text,
      idempotencyKey: runId,
    })) as { runId?: string; status?: string }
    if (!sendRes || sendRes.status !== 'started') {
      throw new Error('OpenClaw 对话启动失败: ' + JSON.stringify(sendRes))
    }
    const actualRunId = sendRes.runId || runId

    const queue: string[] = []
    let fullText = ''
    let ended = false
    let runError: Error | null = null
    let endTimer: NodeJS.Timeout | null = null
    let wake: (() => void) | null = null

    const notify = (): void => {
      if (wake) {
        const w = wake
        wake = null
        w()
      }
    }
    // end 后 OpenClaw 仍可能推送迟到 delta，延迟收集尾声再结束
    const requestEnd = (delayMs: number): void => {
      if (endTimer) return
      endTimer = setTimeout(() => {
        ended = true
        notify()
      }, delayMs)
    }

    const onFrame = (frame: WsGatewayFrame): void => {
      if (ended) return
      const payload = (frame.payload ?? {}) as Record<string, any>
      if (payload.runId && payload.runId !== actualRunId) return
      const eventName = frame.event ?? ''

      if (eventName === 'agent') {
        const stream = payload.stream as string
        const data = payload.data ?? {}
        if (stream === 'assistant') {
          const text = data.text
          if (typeof text === 'string' && text.length > fullText.length) {
            queue.push(text.slice(fullText.length))
            fullText = text
            notify()
          } else if (typeof data.delta === 'string' && data.delta) {
            fullText += data.delta
            queue.push(data.delta)
            notify()
          }
        } else if (stream === 'lifecycle') {
          const phase = data.phase as string
          onEvent({
            type: 'lifecycle',
            lifecycle: {
              phase: phase === 'error' ? 'error' : phase === 'finishing' ? 'finishing' : phase === 'end' ? 'end' : 'start',
              stopReason: data.stopReason as string | undefined,
              error: typeof data.error === 'string' ? data.error : undefined,
            },
          })
          if (phase === 'end') {
            requestEnd(2000)
          } else if (phase === 'error') {
            runError = new Error(
              (typeof data.error === 'string' && data.error) || 'OpenClaw Agent 执行失败',
            )
            requestEnd(0)
          }
        } else {
          const tool = tryParseToolPayload(payload)
          if (tool) {
            onEvent({ type: 'tool-call', toolCall: tool })
          }
        }
      } else if (eventName === 'chat') {
        const state = payload.state as string
        if (state === 'delta') {
          const msg = payload.message as { content?: Array<{ type?: string; text?: string }> } | undefined
          const text = msg?.content?.map((c) => c.text ?? '').join('') ?? ''
          if (typeof text === 'string' && text.length > fullText.length) {
            queue.push(text.slice(fullText.length))
            fullText = text
            notify()
          }
        } else if (state === 'final') {
          const msg = payload.message as { content?: Array<{ type?: string; text?: string }> } | undefined
          const text = msg?.content?.map((c) => c.text ?? '').join('') ?? ''
          if (typeof text === 'string' && text.length > fullText.length) {
            queue.push(text.slice(fullText.length))
            fullText = text
            notify()
          }
          requestEnd(1500)
        }
      }
    }
    const unsub = gateway.subscribe(onFrame)

    const onAbort = (): void => {
      void gateway.abortChat(sessionKey, actualRunId)
      ended = true
      notify()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      while (!ended) {
        if (queue.length > 0) {
          yield queue.shift() as string
          continue
        }
        if (runError) throw runError
        if (signal.aborted) throw new DOMException('aborted', 'AbortError')
        await new Promise<void>((r) => {
          wake = r
        })
      }
      if (runError) throw runError
    } finally {
      unsub()
      signal.removeEventListener('abort', onAbort)
      if (endTimer) clearTimeout(endTimer)
    }
  }
}

/** 本地 OpenClaw OpenAI 兼容端点调用（SSE 流式解析）；baseUrl 可注入便于测试 */
export function createLocalOpenClawCaller(
  baseUrl = OPENCLAW_LOCAL_BASE,
): OpenClawChatDeps['callOpenClaw'] {
  return async function* callOpenClaw(
    params: OpenClawSendParams,
    onEvent: (e: OpenClawChatEvent) => void,
    signal: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const messages = [
      ...(params.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: params.text },
    ]
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // 把用户当前选择的模型透传给 OpenClaw（x-openclaw-model 覆盖），
    // 否则 OpenClaw 始终用内置默认模型 openai/gpt-5.5 请求 llm-proxy，用户选择不生效
    const selectedModel = params.modelId?.trim()
    if (selectedModel && !selectedModel.startsWith('custom/')) {
      headers['x-openclaw-model'] = selectedModel
    }
    const resp = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: OPENCLAW_MODEL,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      if (resp.status === 401) {
        throw new Error('本地 OpenClaw 未配置模型密钥或登录已过期，请重新登录（SOP：llm-proxy Key 自动注入）')
      }
      throw new Error('本地 OpenClaw 连接失败 (' + resp.status + '): ' + text.slice(0, 200))
    }
    if (!resp.body) throw new Error('本地 OpenClaw 无响应流')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    // 工具调用按 index 聚合（name 与 arguments 分块到达）
    const toolAccum: Record<number, { id: string; name: string; args: string }> = {}
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        for (const chunk of parseSseFrame(part, onEvent, toolAccum)) yield chunk
      }
    }
    if (buffer.trim()) {
      for (const chunk of parseSseFrame(buffer, onEvent, toolAccum)) yield chunk
    }
  }
}

/** 解析单个 SSE 帧，返回文本块；工具调用/usage 通过 onEvent 上报 */
export function parseSseFrame(
  frame: string,
  onEvent: (e: OpenClawChatEvent) => void,
  toolAccum: Record<number, { id: string; name: string; args: string }>,
): string[] {
  const chunks: string[] = []
  const dataLines = frame
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
  for (const raw of dataLines) {
    if (raw === '[DONE]') continue
    let data: {
      choices?: Array<{
        delta?: {
          content?: string
          tool_calls?: Array<{
            index?: number
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }
        finish_reason?: string | null
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    try {
      data = JSON.parse(raw)
    } catch {
      continue
    }
    const choice = data.choices?.[0]
    if (!choice) continue
    const delta = choice.delta ?? {}
    if (typeof delta.content === 'string' && delta.content) {
      chunks.push(delta.content)
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        const prev = toolAccum[idx] ?? { id: '', name: '', args: '' }
        if (tc.id) prev.id = tc.id
        if (tc.function?.name) prev.name = tc.function.name
        if (typeof tc.function?.arguments === 'string') {
          prev.args += tc.function.arguments
        }
        toolAccum[idx] = prev
        if (prev.name) {
          onEvent({
            type: 'tool-call' as const,
            toolCall: {
              id: prev.id || 'tool_' + idx,
              name: prev.name,
              input: prev.args,
            },
          })
        }
      }
    }
    if (data.usage && typeof data.usage === 'object') {
      onEvent({
        type: 'done' as const,
        usage: {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
          total: data.usage.total_tokens ?? 0,
        },
      })
    }
  }
  return chunks
}

/** 等待本地端口就绪（ensureOpenClaw 用） */
export async function waitForLocalPort(
  port: number,
  timeoutMs = 30_000,
  intervalMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    setTimeout(() => done(false), 1000)
  })
}

/** 自定义大模型直连调用（OpenAI 兼容 SSE 流式；modelId 格式 custom/<integrationId>/<modelId>） */
export function createCustomLlmCaller(
  store: { list(): Array<{ id: string; baseUrl: string; apiKey: string }> },
): NonNullable<OpenClawChatDeps['callCustomModel']> {
  return async function* callCustomModel(
    params: OpenClawSendParams,
    onEvent: (e: OpenClawChatEvent) => void,
    signal: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const segments = (params.modelId ?? '').split('/')
    const integrationId = segments[1]
    const modelId = segments.slice(2).join('/')
    if (!integrationId || !modelId) {
      throw new Error('自定义模型标识无效')
    }
    const integration = store.list().find((i) => i.id === integrationId)
    if (!integration) {
      throw new Error('自定义大模型不存在或已删除，请到「设置 → 大模型接入」重新配置')
    }
    const url = normalizeChatEndpoint(integration.baseUrl || '')
    const messages = [
      ...(params.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: params.text },
    ]
    const controller = new AbortController()
    const onUserAbort = () => controller.abort()
    signal.addEventListener('abort', onUserAbort, { once: true })
    const stallTimeoutMs = 60_000
    let stallTimer: NodeJS.Timeout | null = null
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        controller.abort(new Error('自定义大模型响应超时（60 秒未收到数据）'))
      }, stallTimeoutMs)
    }
    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }
    try {
      armStall()
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (integration.apiKey || '').trim(),
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        if (resp.status === 401 || resp.status === 403) {
          throw new Error('自定义大模型鉴权失败（HTTP ' + resp.status + '），请检查 API Key')
        }
        throw new Error('自定义大模型连接失败 (HTTP ' + resp.status + '): ' + text.slice(0, 200))
      }
      if (!resp.body) throw new Error('自定义大模型无响应流')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let usage: OpenClawUsage | undefined

      const consume = (raw: string): string[] => {
        const chunks: string[] = []
        for (const line of raw.split('\n')) {
          const dataLine = line.trim()
          if (!dataLine.startsWith('data:')) continue
          const payload = dataLine.slice(5).trimStart()
          if (payload === '[DONE]') continue
          try {
            const data = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
            }
            const delta = data?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta) chunks.push(delta)
            if (data?.usage) {
              usage = {
                input: data.usage.prompt_tokens ?? 0,
                output: data.usage.completion_tokens ?? 0,
                total: data.usage.total_tokens ?? 0,
              }
            }
          } catch {
            // 非 JSON 帧忽略
          }
        }
        return chunks
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        armStall()
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          for (const chunk of consume(part)) yield chunk
        }
      }
      if (buffer.trim()) {
        for (const chunk of consume(buffer)) yield chunk
      }
      onEvent({ type: 'done', usage })
    } finally {
      clearStall()
      signal.removeEventListener('abort', onUserAbort)
    }
  }
}
