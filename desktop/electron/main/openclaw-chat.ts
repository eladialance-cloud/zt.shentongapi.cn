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
}

export interface OpenClawChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 主进程 → 渲染进程事件（IPC openclaw-chat:*） */
export interface OpenClawChatEvent {
  type: 'message' | 'tool-call' | 'done'
  content?: string
  toolCall?: OpenClawToolCall
  usage?: OpenClawUsage
}

export interface OpenClawSendParams {
  text: string
  /** 云端登录 token（渲染进程传入，主进程仅本会话内使用；工具卡读 auth.json） */
  token: string
  /** 用户当前选择的模型（写入上下文供工具卡/调试，实际扣费由 llm-proxy 按用户默认模型处理） */
  modelId?: string
  /** 最近会话上下文（可选，最近 N 条，消息不出本机） */
  history?: OpenClawChatMessage[]
}

export interface OpenClawChatDeps {
  /** 本地 OpenClaw 对话（SSE 流式），逐块 yield 文本 */
  callOpenClaw: (
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
  ): Promise<OpenClawSendResult> {
    if (!params.token) throw new Error('未登录')
    const text = params.text?.trim()
    if (!text) throw new Error('消息内容为空')

    // 0) 确保本地 OpenClaw 已运行（未运行自动启动；模型 Key 由 service-manager 注入配置）
    if (this.deps.ensureOpenClaw) {
      await this.deps.ensureOpenClaw()
    }
    this.writeContext(params)

    const abort = new AbortController()
    this.activeAbort = abort
    this.emit('busy', true)
    let usage: OpenClawUsage | undefined
    let error: Error | null = null

    try {
      // 1) 本地 OpenClaw 对话（SSE 流式；OpenClaw 内部经 llm-proxy 调后台模型并扣费）
      for await (const chunk of this.deps.callOpenClaw(
        { ...params, text },
        (e) => {
          if (e.type === 'done') usage = e.usage
          onEvent(e)
        },
        abort.signal,
      )) {
        onChunk(chunk)
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
    } catch (err) {
      console.error('[openclaw-chat] write context failed:', err)
    }
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
    const resp = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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