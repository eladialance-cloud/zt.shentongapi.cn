// 全局对话流桥（模块级单例）
//
// 解决的问题：
// 1. 切页/切窗口后对话不丢 —— IPC 监听常驻（不随 Chat 页面卸载销毁），流式状态全局持有；
// 2. 正在回复中的内容可恢复 —— 页面通过 useSyncExternalStore 订阅全局快照；
// 3. 完成后自动落库 —— done/error 持久化在全局层执行，页面不存活也能保存回复；
// 4. 崩溃兜底 —— 流式期间每 6s 经主进程落盘草稿（S-53：不再写 localStorage），刷新后可恢复提示。
// 5. 对话做 AI 视频 —— 工具卡出现视频相关调用时自动拉起 video-claw 服务，
//    并订阅其 /api/tasks/{id}/events（SSE）把进度实时写进工具卡。

import { createHermesChat } from '@/api/hermes-chat-api'
import * as chatApi from '@/api/chat-api'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import type { ChatMessage, ToolCallInfo } from '@/types/chat'
import type { HermesChatMessage, HermesChatToolCall } from '@shared/types'
import { isVideoClawTool } from '@/utils/video-claw-tool'
import * as sedimentApi from '@/api/sedimentation-api'

/** 对话引擎：阶段 4 起仅 Hermes（:8642） */
export type ChatEngine = 'hermes'

/** Hermes 引擎最小消息形状 */
type EngineChatMessage = HermesChatMessage

/** Hermes 引擎最小工具调用形状 */
type EngineToolCall = HermesChatToolCall

/** Hermes 引擎最小生命周期形状 */
interface EngineLifecycleInfo {
  phase: string
  stopReason?: string
  error?: string
}

/** Hermes 引擎统一句柄（runStream 只依赖这些方法） */
export interface EngineChatHandle {
  send: (
    text: string,
    history?: EngineChatMessage[],
    knowledgeBaseId?: number,
    sessionId?: number,
    modelId?: string,
  ) => Promise<{ ok: boolean; aborted?: boolean }>
  setModel: (modelId: string) => void
  abort: () => void
  onMessage: (cb: (content: string) => void) => () => void
  onFinalize: (cb: (content: string) => void) => () => void
  onToolCall: (cb: (toolCall: EngineToolCall) => void) => () => void
  onLifecycle: (cb: (info: EngineLifecycleInfo) => void) => () => void
  onDone: (cb: () => void) => () => void
  onError: (cb: (err: Error) => void) => () => void
}

export interface SedimentNotice {
  id: string
  sessionId: number
  /** knowledge_base=云端知识库；hermes_memory=本机 USER.md */
  target: 'knowledge_base' | 'hermes_memory'
  title: string
  feedId?: number
  undoToken?: string
  /** 记忆撤回用：写入 USER.md 的原始条目文本 */
  memoryText?: string
  /** 幂等命中（未重复写入） */
  alreadyExisted?: boolean
  createdAt: number
}

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
  /** 最近一次对话自动沉淀提示（无则 null） */
  sedimentNotice: SedimentNotice | null
}

interface ChatStreamDraft {
  sessionId: number
  content: string
  toolCalls: ToolCallInfo[]
  updatedAt: number
}

const DRAFT_KEY = 'chat-stream:draft'
const ENGINE_KEY = 'chat-stream:engine'
const DRAFT_INTERVAL_MS = 6000

/** 默认对话引擎：Hermes；仍可由用户在对话页切换并持久化 */
const DEFAULT_CHAT_ENGINE: ChatEngine = 'hermes'
let chatEngine: ChatEngine = DEFAULT_CHAT_ENGINE
let engineHydrated = false
let handle: EngineChatHandle | null = null
let snapshot: ChatStreamSnapshot = {
  streaming: false,
  streamingSessionId: null,
  content: '',
  toolCalls: [],
  phase: 'idle',
  error: null,
  completionTick: 0,
  sedimentNotice: null,
}
const listeners = new Set<() => void>()
let draftTimer: ReturnType<typeof setInterval> | null = null
let abortRequested = false
let replyGenerated = false

// ===== 最近一轮对话快照（消息完成后触发沉淀识别用） =====
let lastUserMessage = ''
let lastHistory: EngineChatMessage[] = []
let lastSessionId: number | null = null
let lastKnowledgeBaseId: number | undefined = undefined
let lastModelId: string | undefined = undefined

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

function toToolCallInfo(tc: EngineToolCall): ToolCallInfo {
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

function upsertToolCall(tc: EngineToolCall): ToolCallInfo {
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

function extractTaskId(tc: EngineToolCall): string | null {
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

/**
 * 草稿存储桥（安全审计 S-53）：Electron 下经主进程落 userData（有系统安全存储则整包加密），
 * 不再写 localStorage 明文；浏览器调试环境无 electronAPI，退化为内存（仅本次会话）。
 */
interface DraftStoreBridge {
  save(key: string, value: unknown): Promise<void>
  load<T>(key: string): Promise<T | null>
  clear(key: string): Promise<void>
}

const memoryDrafts = new Map<string, unknown>()

const draftBridge: DraftStoreBridge = {
  async save(key, value) {
    const api = window.electronAPI?.chatDraft
    if (!api) {
      memoryDrafts.set(key, value)
      return
    }
    const res = await api.save(key, value)
    if (!res.ok) throw new Error(res.error)
  },
  async load<T>(key: string): Promise<T | null> {
    const api = window.electronAPI?.chatDraft
    if (!api) return (memoryDrafts.get(key) as T | undefined) ?? null
    const res = await api.load<T>(key)
    if (!res.ok) return null
    return res.value
  },
  async clear(key) {
    memoryDrafts.delete(key)
    const api = window.electronAPI?.chatDraft
    if (!api) return
    await api.clear(key)
  },
}

/** 上一次提交成功的草稿内容（去重，避免每 6s 重复写盘） */
let lastDraftJson: string | null = null
let draftSaveInFlight = false
let draftSaveWarned = false

function saveDraft(): void {
  if (!snapshot.streaming || snapshot.streamingSessionId == null) return
  const draft: ChatStreamDraft = {
    sessionId: snapshot.streamingSessionId,
    content: snapshot.content,
    toolCalls: snapshot.toolCalls,
    updatedAt: Date.now(),
  }
  let json: string
  try {
    json = JSON.stringify(draft)
  } catch {
    return
  }
  if (json === lastDraftJson || draftSaveInFlight) return
  lastDraftJson = json
  draftSaveInFlight = true
  draftBridge
    .save(DRAFT_KEY, draft)
    .catch((err: unknown) => {
      // 落盘失败（如超出体积上限 / 主进程拒绝）只提示一次，避免每 6s 刷屏
      lastDraftJson = null
      if (!draftSaveWarned) {
        draftSaveWarned = true
        console.warn('[chat-stream] 草稿落盘失败：', err)
      }
    })
    .finally(() => {
      draftSaveInFlight = false
    })
}

/** 读取崩溃兜底草稿（S-53：主进程存储，异步） */
export async function loadChatDraft(): Promise<ChatStreamDraft | null> {
  try {
    const draft = await draftBridge.load<ChatStreamDraft>(DRAFT_KEY)
    if (!draft || typeof draft !== 'object') return null
    if (
      typeof draft.sessionId !== 'number' ||
      typeof draft.content !== 'string'
    ) {
      return null
    }
    return draft
  } catch {
    return null
  }
}

/** 清除崩溃兜底草稿（S-53：异步；调用方可 fire-and-forget） */
export async function clearChatDraft(): Promise<void> {
  lastDraftJson = null
  draftSaveWarned = false
  try {
    await draftBridge.clear(DRAFT_KEY)
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

function ensureHandle(): EngineChatHandle {
  if (handle) return handle
  hydrateEngine()
  handle =
    createHermesChat() as unknown as EngineChatHandle

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
    // Hermes 对话安装的内容自动同步进「我的」
    officeBridge.onReview()
    setTimeout(() => officeBridge.onTaskComplete(), 1500)
    if (!abortRequested) {
      void runSedimentation()
    }
    resetStreaming()
  })

  handle.onError((err) => {
    if (abortRequested) return
    const sessionId = snapshot.streamingSessionId
    const content = snapshot.content
    console.error('[chat-stream] hermes error:', err)
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
  void clearChatDraft()
  snapshot = {
    streaming: false,
    streamingSessionId: null,
    content: '',
    toolCalls: [],
    phase: 'idle',
    error: null,
    completionTick,
    sedimentNotice: null,
  }
  abortRequested = false
  replyGenerated = false
  emit()
}

// ==================== 对话知识沉淀（M1：识别 -> 分流写知识库/本机记忆 -> 提示可撤回） ====================

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function runSedimentation(): Promise<void> {
  const content = (lastUserMessage || "").trim()
  const sessionId = lastSessionId
  // 在首个 await 前捕获，避免异步期间被下一轮对话覆盖
  const kbId = lastKnowledgeBaseId
  const modelId = lastModelId
  if (!content || sessionId == null) return
  try {
    const result = await sedimentApi.analyzeSediment({
      content,
      history: lastHistory.slice(-6).map((m) => m.content),
      model: modelId || undefined,
      sessionId,
    })
    // 闲聊/需求对话（requirement 走既有需求链路）不自动沉淀
    if (!result || result.type === "none" || result.type === "requirement") return

    // 分流 1：客户画像/偏好 -> 本机 Hermes 记忆（USER.md，幂等去重）
    if (result.target === "hermes_memory" || result.type === "customer_profile") {
      const mem = window.electronAPI?.hermesMemory
      if (!mem) return
      const entryText = [result.title, result.content].filter(Boolean).join("：")
      const write = await mem.add("profile", entryText)
      if (!write?.ok) return
      patch({
        sedimentNotice: {
          id: uniqueId(),
          sessionId,
          target: "hermes_memory",
          title: result.title || "客户画像",
          memoryText: entryText,
          createdAt: Date.now(),
        },
      })
      return
    }

    // 分流 2：企业资料/数据更新(add) -> 云端知识库（会话关联库，无则默认「对话沉淀」库）
    if (result.type === "data_update" && result.operation === "remove") return // 删除/覆盖确认在 M3
    const type = result.type === "data_update" ? "data_update" : "enterprise_doc"
    const applied = await sedimentApi.applySediment({
      type,
      target: "knowledge_base",
      title: result.title || "对话沉淀",
      content: result.content,
      kbId: kbId,
      sessionId,
    })
    if (!applied?.feedId) return
    patch({
      sedimentNotice: {
        id: uniqueId(),
        sessionId,
        target: "knowledge_base",
        title: result.title || "对话沉淀",
        feedId: applied.feedId,
        undoToken: applied.undoToken,
        alreadyExisted: applied.alreadyExisted,
        createdAt: Date.now(),
      },
    })
  } catch (err) {
    // 沉淀失败不打断对话（静默降级）
    console.warn("[chat-stream] sedimentation failed:", err)
  }
}

/** 撤回最近一次沉淀（knowledge=删除知识库文档；memory=移除 USER.md 条目） */
export async function undoSedimentNotice(): Promise<boolean> {
  const notice = snapshot.sedimentNotice
  if (!notice) return false
  try {
    if (notice.target === "knowledge_base" && notice.undoToken) {
      await sedimentApi.undoSediment(notice.undoToken)
    } else if (notice.target === "hermes_memory" && notice.memoryText) {
      const mem = window.electronAPI?.hermesMemory
      if (mem) await mem.remove("profile", notice.memoryText)
    }
    patch({ sedimentNotice: null })
    return true
  } catch (err) {
    console.warn("[chat-stream] undo sedimentation failed:", err)
    return false
  }
}

/** 关闭沉淀提示（不撤回） */
export function dismissSedimentNotice(): void {
  if (snapshot.sedimentNotice) patch({ sedimentNotice: null })
}

// ==================== 对外 API ====================

export interface StartChatSendParams {
  sessionId: number
  content: string
  history: EngineChatMessage[]
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
    sedimentNotice: null,
  }
  abortRequested = false
  replyGenerated = false
  void clearChatDraft()

  lastUserMessage = params.content || ''
  lastHistory = params.history || []
  lastSessionId = params.sessionId
  lastKnowledgeBaseId = params.knowledgeBaseId
  lastModelId = params.modelId
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

/** 切换对话引擎（hermes）。切前中断进行中的流式，避免旧引擎事件流入新会话。 */
export function setChatEngine(engine: ChatEngine): void {
  if (chatEngine === engine) return
  if (snapshot.streaming) {
    abortRequested = true
    handle?.abort()
  }
  chatEngine = engine
  engineHydrated = true
  try {
    localStorage.setItem(ENGINE_KEY, engine)
  } catch {
    /* localStorage 不可用时忽略（隐私模式） */
  }
  handle = null
  resetStreaming()
  emit()
}

/** 惰性从 localStorage 恢复上次选择的引擎（模块首次被引用时执行一次） */
function hydrateEngine(): void {
  if (engineHydrated) return
  engineHydrated = true
  try {
    const v = localStorage.getItem(ENGINE_KEY)
    if (v === 'hermes') chatEngine = v
  } catch {
    /* 忽略非浏览器环境（SSR/测试） */
  }
}

export function getChatEngine(): ChatEngine {
  hydrateEngine()
  return chatEngine
}

export function isChatStreamBusy(): boolean {
  return snapshot.streaming
}

export default {
  subscribeChatStream,
  getChatStreamSnapshot,
  startChatSend,
  abortChatSend,
  setChatEngine,
  getChatEngine,
  loadChatDraft,
  clearChatDraft,
  consumePendingVideos,
  consumePendingCompletions,
  isChatStreamBusy,
  undoSedimentNotice,
  dismissSedimentNotice,
}
