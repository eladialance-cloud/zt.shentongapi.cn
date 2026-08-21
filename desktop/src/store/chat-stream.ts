// 全局对话流桥（模块级单例）
//
// 解决的问题：
// 1. 切页/切窗口后对话不丢 —— IPC 监听常驻（不随 Chat 页面卸载销毁），流式状态全局持有；
// 2. 正在回复中的内容可恢复 —— 页面通过 useSyncExternalStore 订阅全局快照；
// 3. 完成后自动落库 —— done/error 持久化在全局层执行，页面不存活也能保存回复；
// 4. 崩溃兜底 —— 流式期间每 6s 写 localStorage 草稿，刷新后可恢复提示。
// 5. 对话做 AI 视频 —— 工具卡出现视频相关调用时自动拉起 video-claw 服务，
//    并订阅其 /api/tasks/{id}/events（SSE）把进度实时写进工具卡。

import { createOpenClawChat, type OpenClawChatHandle } from '@/api/openclaw-chat-api'
import * as chatApi from '@/api/chat-api'
import * as marketApi from '@/api/market-api'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import type { ChatMessage, ToolCallInfo } from '@/types/chat'
import type { OpenClawChatMessage, OpenClawToolCall } from '@shared/types'
import { isVideoClawTool } from '@/utils/video-claw-tool'

export interface ChatStreamSnapshot {
  /** 是否正在流式回复 */
  streaming: boolean
  /** 正在回复的会话 id（null = 无进行中任务） */
  streamingSessionId: number | null
  /** 已流出的文本 */
  content: string
  /** 工具卡列表 */
  toolCalls: ToolCallInfo[]
  /** Agent 生命周期阶段 */
  phase: string
  /** 最近错误 */
  error: string | null
  /** 完成消息序号（每次 done/error 固化后 +1，页面据此回填消息区） */
  completionTick: number
}

interface ChatStreamDraft {
  sessionId: number
  content: string
  toolCalls: ToolCallInfo[]
  updatedAt: number
}

const DRAFT_KEY = 'chat-stream:draft'
const DRAFT_INTERVAL_MS = 6000

let handle: OpenClawChatHandle | null = null
let snapshot: ChatStreamSnapshot = {
  streaming: false,
  streamingSessionId: null,
  content: '',
  toolCalls: [],
  phase: 'idle',
  error: null,
  completionTick: 0,
}
const listeners = new Set<() => void>()
let draftTimer: ReturnType<typeof setInterval> | null = null
let abortRequested = false
let replyGenerated = false

const VIDEO_CLAW_FRONTEND = 'http://127.0.0.1:3000'
const VIDEO_CLAW_API = 'http://127.0.0.1:8000'

function emit(): void {
  const s = { ...snapshot, toolCalls: snapshot.toolCalls.map((t) => ({ ...t })) }
  snapshotRef = s
  for (const cb of listeners) cb()
}

let snapshotRef: ChatStreamSnapshot = snapshot

export function subscribeChatStream(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getChatStreamSnapshot(): ChatStreamSnapshot {
  return snapshotRef
}

function patch(part: Partial<ChatStreamSnapshot>): void {
  snapshot = { ...snapshot, ...part }
  emit()
}

/** 工具卡状态更新（按 id） */
function updateToolCall(id: string, updater: (tc: ToolCallInfo) => ToolCallInfo): void {
  const next = snapshot.toolCalls.map((tc) => (tc.id === id ? updater(tc) : tc))
  snapshot = { ...snapshot, toolCalls: next }
  emit()
}

function toToolCallInfo(tc: OpenClawToolCall): ToolCallInfo {
  return {
    id: tc.id,
    name: tc.name,
    input: tc.input,
    output: tc.output ?? undefined,
    duration: 0,
    creditsCost: 0,
    status: tc.state === 'done' ? 'success' : tc.state === 'error' ? 'failed' : 'running',
  }
}

function upsertToolCall(tc: OpenClawToolCall): ToolCallInfo {
  const mapped = toToolCallInfo(tc)
  const idx = snapshot.toolCalls.findIndex((t) => t.id === mapped.id)
  if (idx >= 0) {
    const prev = snapshot.toolCalls[idx]
    const merged: ToolCallInfo = {
      ...prev,
      ...mapped,
      duration: prev.duration || mapped.duration,
      creditsCost: prev.creditsCost || mapped.creditsCost,
    }
    const next = [...snapshot.toolCalls]
    next[idx] = merged
    snapshot = { ...snapshot, toolCalls: next }
    emit()
    return merged
  }
  const next = [...snapshot.toolCalls, mapped]
  snapshot = { ...snapshot, toolCalls: next }
  emit()
  return mapped
}

// ==================== 视频任务（对话内实时进度） ====================

function extractTaskId(tc: OpenClawToolCall): string | null {
  const scan = (v: unknown): string => {
    if (v == null) return ''
    if (typeof v === 'string') return v
    try {
      return JSON.stringify(v)
    } catch {
      return ''
    }
  }
  const hay = scan(tc.output) + '\n' + scan(tc.input)
  const m = hay.match(/"task_id"\s*:\s*"([^"]+)"/) || hay.match(/task_id=([A-Za-z0-9_-]{8,})/) || hay.match(/\/api\/tasks\/([A-Za-z0-9_-]{8,})/)
  return m ? m[1] : null
}

function ensureVideoClawStarted(): void {
  const svc = window.electronAPI?.service
  if (!svc) return
  void svc.start('video-claw').catch(() => undefined)
}

function subscribeVideoTask(taskId: string, toolCallId: string): void {
  let es: EventSource | null = null
  try {
    es = new EventSource(VIDEO_CLAW_API + '/api/tasks/' + encodeURIComponent(taskId) + '/events')
  } catch {
    return
  }
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as Record<string, unknown>
      const status = typeof data.status === 'string' ? data.status : undefined
      const progress = typeof data.progress === 'number' ? data.progress : undefined
      updateToolCall(toolCallId, (tc) => ({
        ...tc,
        progress,
        stage: status,
      }))
      if (data.type === 'completed') {
        void onVideoTaskCompleted(taskId, toolCallId)
        es?.close()
      } else if (data.type === 'failed') {
        updateToolCall(toolCallId, (tc) => ({ ...tc, status: 'failed', stage: 'failed', progress: tc.progress ?? 0 }))
        es?.close()
      }
    } catch {
      /* 忽略解析错误 */
    }
  }
  es.onerror = () => {
    es?.close()
  }
}

/** 完成后拉取任务元数据，把成片 URL 写进工具卡（可播放） */
async function onVideoTaskCompleted(taskId: string, toolCallId: string): Promise<void> {
  try {
    const resp = await fetch(VIDEO_CLAW_API + '/api/tasks/' + encodeURIComponent(taskId))
    if (!resp.ok) return
    const meta = (await resp.json()) as { output?: { final_video?: string }; artifacts?: Array<{ kind?: string; name?: string; path?: string }> }
    const finalPath = meta.output?.final_video
    const finalArtifact = (meta.artifacts || []).find((a) => a.kind === 'video' && (a.name === 'final' || /final/.test(a.path || '')))
    const videoPath = finalPath || finalArtifact?.path
    if (!videoPath) return
    const url = toArtifactUrl(videoPath)
    updateToolCall(toolCallId, (tc) => ({ ...tc, status: 'success', stage: 'completed', progress: 100, videoUrl: url, output: '✅ 视频生成完成' }))
    pendingVideos.push({ toolCallId, url })
    emit()
  } catch {
    /* 忽略 */
  }
}

function toArtifactUrl(path: string): string {
  if (/^(https?:|data:|file:)/.test(path)) return path
  const marker = '/code/'
  const idx = path.indexOf(marker)
  if (idx >= 0) return VIDEO_CLAW_FRONTEND + '/code/' + path.slice(idx + marker.length)
  return path
}

export interface PendingVideo {
  toolCallId: string
  url: string
}

/** 视频完成队列：Chat 页面轮询消费后插入消息区 */
let pendingVideos: PendingVideo[] = []

/** 完成消息序号（模块级，reset 时保留） */
let completionTick = 0

export function consumePendingVideos(): PendingVideo[] {
  if (pendingVideos.length === 0) return []
  const batch = pendingVideos
  pendingVideos = []
  return batch
}

export interface CompletedAssistant {
  sessionId: number
  content: string
  toolCalls?: ToolCallInfo[]
  status: 'done' | 'error'
}

/** 已完成助手消息队列：Chat 页面消费后追加到消息区（完成后不消失） */
let pendingCompletions: CompletedAssistant[] = []

function pushCompleted(item: CompletedAssistant): void {
  pendingCompletions.push(item)
  completionTick += 1
  snapshot = { ...snapshot, completionTick }
  emit()
}

export function consumePendingCompletions(): CompletedAssistant[] {
  if (pendingCompletions.length === 0) return []
  const batch = pendingCompletions
  pendingCompletions = []
  return batch
}

// ==================== 草稿（崩溃/刷新兜底） ====================

function saveDraft(): void {
  if (!snapshot.streaming || snapshot.streamingSessionId == null) return
  const draft: ChatStreamDraft = {
    sessionId: snapshot.streamingSessionId,
    content: snapshot.content,
    toolCalls: snapshot.toolCalls,
    updatedAt: Date.now(),
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 忽略 */
  }
}

export function loadChatDraft(): ChatStreamDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ChatStreamDraft
  } catch {
    return null
  }
}

export function clearChatDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* 忽略 */
  }
}

// ==================== 持久化 ====================

function persistAssistant(sessionId: number, msg: Omit<ChatMessage, 'id' | 'sessionId' | 'userId' | 'createdAt'>): void {
  void chatApi
    .saveMessage(sessionId, {
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments,
      toolCalls: msg.toolCalls,
      creditsCost: msg.creditsCost,
    })
    .catch((err) => console.error('[chat-stream] persist message failed:', err))
}

// ==================== 事件注册（常驻） ====================

function ensureHandle(): OpenClawChatHandle {
  if (handle) return handle
  handle = createOpenClawChat()

  handle.onMessage((chunk) => {
    const content = snapshot.content + chunk
    snapshot = { ...snapshot, content }
    if (!replyGenerated) {
      replyGenerated = true
      officeBridge.onReplyGenerated()
    }
    emit()
  })

  handle.onFinalize((finalContent) => {
    snapshot = { ...snapshot, content: finalContent }
    emit()
  })

  handle.onLifecycle((info) => {
    snapshot = { ...snapshot, phase: info.phase }
    emit()
  })

  handle.onToolCall((tc) => {
    const mapped = upsertToolCall(tc)
    officeBridge.onToolCall(tc.name)
    if (isRetrieveTool(tc.name)) officeBridge.onAgentRetrieve()
    // 视频相关工具：自动拉起服务 + 订阅任务进度
    if (isVideoClawTool(tc.name)) {
      ensureVideoClawStarted()
      const taskId = extractTaskId(tc)
      if (taskId) subscribeVideoTask(taskId, mapped.id)
    }
  })

  handle.onDone(() => {
    const sessionId = snapshot.streamingSessionId
    const content = snapshot.content + (abortRequested ? '\n\n[已停止]' : '')
    const toolCalls = snapshot.toolCalls.length > 0 ? snapshot.toolCalls : undefined
    if (sessionId != null && (content.trim() || (toolCalls && toolCalls.length > 0))) {
      persistAssistant(sessionId, { role: 'assistant', content, toolCalls, status: 'done' })
      pushCompleted({ sessionId, content, toolCalls, status: 'done' })
    }
    // OpenClaw 对话安装的内容自动同步进「我的」
    void marketApi.syncChat().catch(() => undefined)
    officeBridge.onReview()
    setTimeout(() => officeBridge.onTaskComplete(), 1500)
    resetStreaming()
  })

  handle.onError((err) => {
    if (abortRequested) return
    const sessionId = snapshot.streamingSessionId
    const content = snapshot.content
    console.error('[chat-stream] openclaw error:', err)
    officeBridge.onSystemError(err.message)
    if (sessionId != null && content.trim()) {
      persistAssistant(sessionId, {
        role: 'assistant',
        content: content + '\n\n[生成中断]',
        toolCalls: snapshot.toolCalls.length > 0 ? snapshot.toolCalls : undefined,
        status: 'error',
      })
      pushCompleted({
        sessionId,
        content: content + '\n\n[生成中断]',
        toolCalls: snapshot.toolCalls.length > 0 ? snapshot.toolCalls : undefined,
        status: 'error',
      })
    }
    snapshot = { ...snapshot, error: err.message }
    void marketApi.syncChat().catch(() => undefined)
    emit()
    resetStreaming()
  })

  return handle
}

function resetStreaming(): void {
  if (draftTimer) {
    clearInterval(draftTimer)
    draftTimer = null
  }
  clearChatDraft()
  snapshot = {
    streaming: false,
    streamingSessionId: null,
    content: '',
    toolCalls: [],
    phase: 'idle',
    error: null,
    completionTick,
  }
  abortRequested = false
  replyGenerated = false
  emit()
}

// ==================== 对外 API ====================

export interface StartChatSendParams {
  sessionId: number
  content: string
  history: OpenClawChatMessage[]
  knowledgeBaseId?: number
  /** 当前会话选择的模型（custom/<integrationId>/<modelId> 时主进程直连自定义端点） */
  modelId?: string
}

export async function startChatSend(params: StartChatSendParams): Promise<void> {
  const h = ensureHandle()
  snapshot = {
    streaming: true,
    streamingSessionId: params.sessionId,
    content: '',
    toolCalls: [],
    phase: 'start',
    error: null,
    completionTick,
  }
  abortRequested = false
  replyGenerated = false
  clearChatDraft()
  emit()

  if (draftTimer) clearInterval(draftTimer)
  draftTimer = setInterval(saveDraft, DRAFT_INTERVAL_MS)

  try {
    await h.send(params.content, params.history, params.knowledgeBaseId, params.sessionId, params.modelId)
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err)
    officeBridge.onSystemError(messageText)
    if (snapshot.content.trim()) {
      persistAssistant(params.sessionId, {
        role: 'assistant',
        content: snapshot.content + '\n\n[生成中断]',
        toolCalls: snapshot.toolCalls.length > 0 ? snapshot.toolCalls : undefined,
        status: 'error',
      })
    }
    snapshot = { ...snapshot, error: messageText }
    emit()
    resetStreaming()
  }
}

export function abortChatSend(): void {
  abortRequested = true
  handle?.abort()
}

export function isChatStreamBusy(): boolean {
  return snapshot.streaming
}

export default {
  subscribeChatStream,
  getChatStreamSnapshot,
  startChatSend,
  abortChatSend,
  loadChatDraft,
  clearChatDraft,
  consumePendingVideos,
  consumePendingCompletions,
  isChatStreamBusy,
}
