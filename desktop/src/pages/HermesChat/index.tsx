// Hermes 对话（独立入口）：直接与本地 Hermes Agent（:8642）流式对话
// 链路：createHermesGatewayHandle() → /api/ws JSON-RPC（session.create/resume → prompt.submit → 事件流），保留持久化/沉淀/officeBridge
// 计费归引擎层 llm-proxy；消息内容全程本机。复用 Chat 页面消息列表/输入组件，保持视觉一致。
// 阶段 2：对齐会话持久化 + 沉淀提示（SedimentNotice）+ officeBridge 事件流水线。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Select, Space, Spin, Tag, Tooltip, Modal, List, Tabs, Input } from 'antd'
import { RobotOutlined, SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { createHermesChat, type HermesChatHandle } from '@/api/hermes-chat-api'
import { createHermesGatewayHandle, type HermesGatewayHandle } from '@/services/hermes-gateway-client'
import { readLocalPref, writeLocalPref, normalizePersonaId, normalizeMemoryTarget, PERSONA_STORAGE_KEY, MEMORY_TARGET_STORAGE_KEY, REASONING_EFFORT_STORAGE_KEY } from './prefs'
import { MessageList as UpstreamMessageList } from './upstream/MessageList'
import { ChatEmptyState as UpstreamChatEmptyState } from './upstream/ChatEmptyState'
import './upstream/upstreamChat.css'
import type { ChatMessage as UpstreamChatMessage, ClarifyMessage as UpstreamClarifyMessage } from './upstream/types'
import type { Attachment as UpstreamAttachment } from './upstream/attachments'
import { MessageInput } from '@/pages/Chat/components/MessageInput'
import { SessionList } from '@/pages/Chat/components/SessionList'
import { ConversationSettings } from '@/pages/Chat/ConversationSettings'
import { MediaGenerationModal } from '@/pages/Chat/components/MediaGenerationModal'
import { listMarketAgents } from '@/api/agent-api'
import { listKnowledgeBases, listOfficialKnowledgeBases } from '@/api/knowledge-api'
import { listLlmIntegrations } from '@/api/llm-integrations-api'
import type { MediaJob } from '@/api/media-generation-api'
import type { Agent } from '@/types/agent'
import ScheduleModal from '@/pages/Chat/ScheduleModal'
import { detectScheduleIntent, type ScheduleIntent } from '@/pages/Chat/schedule-intent'
import { checkHealth } from '@/services/hermes-local'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import SedimentNotice from '@/components/SedimentNotice'
import { ensureHermesSession, persistHermesMessage, runHermesSediment, undoHermesSediment, type HermesPipelineDeps } from '@/services/hermes-chat-pipeline'
import * as chatApi from '@/api/chat-api'
import { edictModels } from '@/api/edict-api'
import * as sedimentApi from '@/api/sedimentation-api'
import type { AgentOption, ChatMessage, ChatSession, KnowledgeBaseOption, ModelOption, ToolCallInfo } from '@/types/chat'
import type { HermesChatToolCall, HermesChatUsage, HermesStatusResult, HermesMemoryEntry, LlmIntegration } from '@shared/types'
import type { SedimentNotice as SedimentNoticeData } from '@/store/chat-stream'
import HermesRuntimeInstallAlert from '@/components/HermesRuntimeInstallAlert'
import { parseSlashCommand, LOCAL_COMMAND_NAMES, AGENT_ONLY_COMMAND_NAMES, SLASH_HELP, type ParsedSlashCommand } from './slash'
import { MemoryProviderPanel } from './MemoryProviderPanel'
import { ChatInput as UpstreamChatInput, type ChatInputHandle as UpstreamChatInputHandle } from './upstream/ChatInput'
import UpstreamSoul from './upstream/Soul'
import { contextWindowForModel } from './contextWindow'
import { ModelPicker as UpstreamModelPicker } from './upstream/ModelPicker'
import { ReasoningEffortPicker as UpstreamReasoningEffortPicker } from './upstream/ReasoningEffortPicker'
import { normalizeToolCalls, toolCallText } from '@/utils/tool-call-normalize'
import type { ModelGroup as UpstreamModelGroup } from './upstream/types'
import HermesTools from './HermesTools'
import { WebPreviewPanel as UpstreamWebPreviewPanel } from './upstream/WebPreviewPanel'
import { ContextFolderChip as UpstreamContextFolderChip } from './upstream/ContextFolderChip'
import { WorktreePanel as UpstreamWorktreePanel } from './upstream/WorktreePanel'
import { RemoteFolderPicker as UpstreamRemoteFolderPicker } from './upstream/RemoteFolderPicker'
import { QueuedMessages as UpstreamQueuedMessages } from './upstream/QueuedMessages'
import { normalizeReasoningEffort, type ReasoningEffort } from './reasoningEffort'
import styles from './styles.module.css'

interface StreamState {
  content: string
  toolCalls: ToolCallInfo[]
  phase: string
  usage: HermesChatUsage | undefined
  error: string
}

const EMPTY_STREAM: StreamState = { content: '', toolCalls: [], phase: 'idle', usage: undefined, error: '' }
interface QueuedDraft {
  text: string
  attachments: UpstreamAttachment[]
}
/** 深瞳消息/流式状态 → 上游 Hermes ChatMessage[]（保留气泡/工具行/markdown 渲染） */
function toUpstreamAttachment(
  att: NonNullable<ChatMessage['attachments']>[number],
  index: number,
): UpstreamAttachment {
  const isImg = /^image\//.test(att.mimeType || '')
  return {
    // id 必须跨渲染稳定：旧写法用 Math.random() 会导致每次渲染 key 变化、附件节点被反复卸载重建
    id: att.fileId || att.url || att.fileName || `att-${index}`,
    kind: isImg ? 'image' : 'text-file',
    name: att.fileName || '附件',
    mime: att.mimeType || '',
    size: att.fileSize || 0,
    dataUrl: isImg ? att.url : undefined,
    path: isImg ? undefined : att.url,
  }
}

function mapToolStatus(s: ToolCallInfo['status'] | undefined): 'running' | 'completed' | 'failed' {
  return s === 'running' ? 'running' : s === 'failed' ? 'failed' : 'completed'
}

function toUpstreamMessages(msgs: ChatMessage[], stream: StreamState, clarify: UpstreamClarifyMessage[] = []): UpstreamChatMessage[] {
  const out: UpstreamChatMessage[] = []
  for (const m of msgs) {
    if (m.role === 'system') continue
    const role = m.role === 'user' ? 'user' : 'agent'
    const base = {
      id: String(m.id),
      role: role as 'user' | 'agent',
      content: m.content,
      timestamp: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
    }
    if (m.role === 'user') {
      out.push({ ...base, attachments: m.attachments?.map((a, i) => toUpstreamAttachment(a, i)) })
      continue
    }
    // 历史里的 toolCalls 形状不受库约束（旧版本写入 / OpenAI function 形状 /
    // 双编码 JSON 串），统一归一化后再渲染，避免 name 缺失把整页打崩。
    if (m.toolCalls) {
      for (const tc of normalizeToolCalls(m.toolCalls)) {
        out.push({ id: `tc-${tc.id}`, kind: 'tool_call', role: 'agent', callId: tc.id, name: tc.name, args: toolCallText(tc.input), status: mapToolStatus(tc.status) })
        if (tc.output != null) {
          out.push({ id: `tr-${tc.id}`, kind: 'tool_result', role: 'agent', callId: tc.id, name: tc.name, content: toolCallText(tc.output) })
        }
      }
    }
    out.push({ ...base, attachments: m.attachments?.map((a, i) => toUpstreamAttachment(a, i)) })
  }
  for (const tc of stream.toolCalls) {
    out.push({ id: `stc-${tc.id}`, kind: 'tool_call', role: 'agent', callId: tc.id, name: tc.name || 'tool', args: toolCallText(tc.input), status: mapToolStatus(tc.status) })
  }
  if (stream.content) {
    out.push({ id: '__stream__', role: 'agent', content: stream.content, pending: true })
  }
  for (const m of clarify) out.push(m)
  return out
}

/** 依据所选模型单价估算本次积分成本（上游 token 追踪的本地估算；无单价则返回 0） */
function estimateCost(usage: HermesChatUsage | undefined, models: ModelOption[], modelId: string): number {
  if (!usage) return 0
  const m = models.find((x) => x.id === modelId)
  if (!m) return 0
  const inCost = (usage.input / 1000) * (m.inputPricePer1k || 0)
  const outCost = (usage.output / 1000) * (m.outputPricePer1k || 0)
  const total = inCost + outCost
  return total > 0 ? Math.round(total * 100) / 100 : 0
}

/** 独立页注入真实会话/沉淀 API（纯 DI，便于单测） */
const pipelineDeps: HermesPipelineDeps = {
  createSession: chatApi.createSession,
  saveMessage: chatApi.saveMessage,
  analyzeSediment: sedimentApi.analyzeSediment,
  applySediment: sedimentApi.applySediment,
  undoSediment: sedimentApi.undoSediment,
}

function toToolCallInfo(tc: HermesChatToolCall): ToolCallInfo {
  return {
    id: tc.id,
    name: tc.name,
    input: tc.input,
    output: tc.output,
    duration: 0,
    creditsCost: 0,
    status: tc.state === 'done' ? 'success' : tc.state === 'error' ? 'failed' : 'running',
  }
}

function upsertTool(list: ToolCallInfo[], tc: HermesChatToolCall): ToolCallInfo[] {
  const mapped = toToolCallInfo(tc)
  const idx = list.findIndex((t) => t.id === mapped.id)
  if (idx === -1) return [...list, mapped]
  const next = [...list]
  next[idx] = { ...next[idx], ...mapped }
  return next
}

type GatewayPayload = Record<string, unknown>

function gwText(payload: unknown, ...keys: string[]): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const p = payload as GatewayPayload
  for (const k of keys) {
    const v = p[k]
    if (typeof v === "string" && v.trim()) return v
    if (typeof v === "number" || typeof v === "boolean") return String(v)
    if (typeof v === "object" && v) {
      const o = v as GatewayPayload
      if (typeof o.text === "string") return o.text
      if (typeof o.output_text === "string") return o.output_text
      if (typeof o.content === "string") return o.content
      try { return JSON.stringify(o) } catch { return "" }
    }
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? gwText(x, "text", "output_text") : "")).join("")
    }
  }
  return ""
}

function gwUsage(payload: unknown): HermesChatUsage | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined
  const u = (payload as GatewayPayload).usage
  if (!u || typeof u !== "object") return undefined
  const up = u as GatewayPayload
  const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  const input = n(up.input ?? up.prompt ?? up.prompt_tokens ?? up.promptTokens)
  const output = n(up.output ?? up.completion ?? up.completion_tokens ?? up.completionTokens)
  const total = n(up.total ?? up.total_tokens ?? up.totalTokens) || input + output
  return input || output || total ? { input, output, total } : undefined
}

function gwToolFromEvent(type: string, payload: unknown): HermesChatToolCall | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined
  const p = payload as GatewayPayload
  const name = gwText(p, "name", "tool", "function", "function_name")
  if (!name) return undefined
  const input = p.args ?? p.input ?? p.arguments ?? undefined
  const outVal = p.result ?? p.output ?? p.content ?? undefined
  const status = typeof p.status === "string" ? p.status : ""
  let state: HermesChatToolCall["state"] = "running"
  if (status === "completed" || status === "done" || type === "tool.complete" || type === "tool.done") state = "done"
  else if (status === "failed" || status === "error" || p.error) state = "error"
  return {
    id: gwText(p, "call_id", "tool_call_id", "id") || name,
    name,
    input: typeof input === "object" ? input : input,
    state,
    ...(outVal !== undefined ? { output: typeof outVal === "string" ? outVal : JSON.stringify(outVal) } : {}),
  }
}

function gwClarifyFromEvent(payload: unknown): UpstreamClarifyMessage | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined
  const p = payload as GatewayPayload
  const requestId = gwText(p, "request_id", "requestId", "id")
  if (!requestId) return undefined
  const question = gwText(p, "question", "prompt", "message", "text")
  if (!question.trim()) return undefined
  const choicesRaw = Array.isArray(p.choices) ? p.choices : []
  const choices = choicesRaw.map((ch) => typeof ch === "string" ? ch : gwText(ch, "text", "label", "value")).filter((ch) => !!ch.trim())
  return {
    id: `clarify-${requestId}`,
    kind: "clarify",
    role: "agent",
    requestId,
    question,
    choices,
  }
}
function base64FromDataUrl(dataUrl: string | undefined): string {
  if (!dataUrl) return ''
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : ''
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function dashboardDataUrlForTextAttachment(att: UpstreamAttachment): string | null {
  if (att.kind !== 'text-file' || typeof att.text !== 'string') return null
  const mime = att.mime || 'text/plain'
  return 'data:' + mime + ';base64,' + base64EncodeUtf8(att.text)
}

function safeAttachmentFilename(name: string | undefined, index: number): string {
  const trimmed = (name || '').trim()
  return trimmed || 'image-' + (index + 1) + '.png'
}

function safeFileAttachmentName(name: string | undefined, index: number): string {
  const trimmed = (name || '').trim()
  return trimmed || 'attachment-' + (index + 1)
}

function upstreamToDeepAttachment(a: UpstreamAttachment): NonNullable<ChatMessage['attachments']>[number] {
  return {
    fileId: a.id,
    fileName: a.name,
    fileSize: a.size || 0,
    mimeType: a.mime || '',
    url: a.kind === 'image' ? a.dataUrl || '' : a.path || a.dataUrl || '',
  }
}

async function syncAttachmentsForSubmit(
  g: HermesGatewayHandle,
  sessionId: string,
  attachments: UpstreamAttachment[],
): Promise<{ ok: boolean; refs: string[]; error?: string }> {
  const images = attachments.filter((a) => a.kind === 'image')
  const files = attachments.filter((a) => a.kind !== 'image')
  const refs: string[] = []
  for (let i = 0; i < images.length; i++) {
    const att = images[i]
    const contentBase64 = base64FromDataUrl(att.dataUrl)
    if (!contentBase64) return { ok: false, refs: [], error: '无法读取图片附件 ' + att.name }
    const r = await g.request<{ attached?: boolean; message?: string }>('image.attach_bytes', {
      session_id: sessionId,
      content_base64: contentBase64,
      filename: safeAttachmentFilename(att.name, i),
    })
    if (!r.ok || !r.result?.attached) return { ok: false, refs: [], error: r.error || r.result?.message || '图片附件 ' + att.name + ' 上传失败' }
  }
  for (let i = 0; i < files.length; i++) {
    const att = files[i]
    const params: Record<string, unknown> = { session_id: sessionId, name: safeFileAttachmentName(att.name, i) }
    if (att.kind === 'text-file') {
      const dataUrl = dashboardDataUrlForTextAttachment(att)
      if (!dataUrl) return { ok: false, refs: [], error: '附件 ' + att.name + ' 不是文本文件' }
      params.data_url = dataUrl
    } else if (att.kind === 'path-ref' && att.path) {
      params.path = att.path
    } else {
      return { ok: false, refs: [], error: '附件 ' + att.name + ' 类型不支持' }
    }
    const r = await g.request<{ attached?: boolean; ref_text?: string; message?: string }>('file.attach', params)
    if (!r.ok || !r.result?.attached) return { ok: false, refs: [], error: r.error || r.result?.message || '附件 ' + att.name + ' 上传失败' }
    if (r.result?.ref_text) refs.push(r.result.ref_text)
  }
  return { ok: true, refs }
}
export default function HermesChat() {
  const navigate = useNavigate()
  const [committed, setCommitted] = useState<ChatMessage[]>([])
  const [clarifyMessages, setClarifyMessages] = useState<UpstreamClarifyMessage[]>([])
  const [stream, setStreamState] = useState<StreamState>(EMPTY_STREAM)
  const [sending, setSending] = useState(false)
  const [ready, setReady] = useState<boolean | null>(null)
  const [status, setStatus] = useState<HermesStatusResult | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [sedimentNotice, setSedimentNotice] = useState<SedimentNoticeData | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [sessionTitle, setSessionTitle] = useState('和深瞳机器人对话')
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('custom/deep-shentong')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [generationOpen, setGenerationOpen] = useState(false)
  const [generationType, setGenerationType] = useState<'image' | 'video'>('image')
  const [agentId, setAgentId] = useState<number | undefined>(undefined)
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [kbOptions, setKbOptions] = useState<KnowledgeBaseOption[]>([])
  const [customIntegrations, setCustomIntegrations] = useState<LlmIntegration[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [agentPriceMap, setAgentPriceMap] = useState<Record<number, Agent>>({})
  const [schedulePick, setSchedulePick] = useState<ScheduleIntent | null>(null)
  const [personaOptions, setPersonaOptions] = useState<{ id: string; label: string }[]>([])
  const [personaId, setPersonaId] = useState<string>(() => normalizePersonaId(readLocalPref(PERSONA_STORAGE_KEY)))
  const [personaOpen, setPersonaOpen] = useState(false)
  const [personaLoading, setPersonaLoading] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memoryTarget, setMemoryTarget] = useState<'profile' | 'memory'>(() => normalizeMemoryTarget(readLocalPref(MEMORY_TARGET_STORAGE_KEY)))
  const [memoryEntries, setMemoryEntries] = useState<HermesMemoryEntry[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memoryTab, setMemoryTab] = useState<'profile' | 'memory' | 'providers'>(() => normalizeMemoryTarget(readLocalPref(MEMORY_TARGET_STORAGE_KEY)))
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => normalizeReasoningEffort(readLocalPref(REASONING_EFFORT_STORAGE_KEY)))
  const [toolsOpen, setToolsOpen] = useState(false)
  const [gw, setGw] = useState<{ connected: boolean; checking: boolean; error?: string }>({ connected: false, checking: false })
  const [soulOpen, setSoulOpen] = useState(false)
  const [soulProfileId, setSoulProfileId] = useState('')
  const [webPreviewOpen, setWebPreviewOpen] = useState(false)
  const [webPreviewUrl, setWebPreviewUrl] = useState('')
  const [contextFolder, setContextFolder] = useState<string | null>(null)
  const [worktreeOpen, setWorktreeOpen] = useState(false)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [queue, setQueue] = useState<QueuedDraft[]>([])


  const handleRef = useRef<HermesChatHandle | null>(null)
  const streamRef = useRef<StreamState>(EMPTY_STREAM)
  const finalizedRef = useRef(false)
  const idRef = useRef(0)
  // 阶段 2：会话持久化 + 沉淀 + Office 事件所需的近一轮快照
  const sessionIdRef = useRef<number | null>(null)
  // Hermes gateway 运行时会话 id（/api/ws 的 session.create/resume 返回，区别于后端 sessionIdRef）
  const hermesRuntimeSidRef = useRef<string | null>(null)
  const abortedRef = useRef(false)
  const replyGeneratedRef = useRef(false)
  const lastUserMessageRef = useRef('')
  const lastHistoryRef = useRef<string[]>([])
  const lastKbRef = useRef<number | undefined>(undefined)
  const lastModelRef = useRef<string | undefined>(undefined)
  const localMsgIdsRef = useRef<Set<number>>(new Set())
  const queueRef = useRef<QueuedDraft[]>([])
  const flushingRef = useRef(false)
  const sendDraftRef = useRef<(text: string, attachments?: UpstreamAttachment[]) => Promise<void>>(async () => {})

  const setStream = useCallback((updater: (s: StreamState) => StreamState) => {
    streamRef.current = updater(streamRef.current)
    setStreamState(streamRef.current)
  }, [])

  /** 选择会话 → 加载历史 + 设置当前会话/模型 */
  const handleSelectSession = useCallback(async (next: ChatSession | null) => {
    queueRef.current = []
    setQueue([])
    flushingRef.current = false
    if (!next) {
      setActiveSessionId(null)
      sessionIdRef.current = null
      setCommitted([])
      setClarifyMessages([])
      setStreamState(EMPTY_STREAM)
      finalizedRef.current = false
      abortedRef.current = false
      localMsgIdsRef.current.clear()
      hermesRuntimeSidRef.current = null
      setSessionTitle('和深瞳机器人对话')
      return
    }
    setActiveSessionId(next.id)
    sessionIdRef.current = next.id
    setSelectedModel(next.modelId)
    setKnowledgeBaseId(next.knowledgeBaseId)
    setAgentId(next.agentId)
    setSessionTitle(next.title || '和深瞳机器人对话')
    localMsgIdsRef.current.clear()
    hermesRuntimeSidRef.current = null
    setLoadingHistory(true)
    try {
      const res = await chatApi.listMessages(next.id, { page: 1, pageSize: 100 })
      setCommitted((res.list || []).filter((m) => m.role !== 'system'))
      setClarifyMessages([])
    } catch (err) {
      console.warn('[HermesChat] 加载会话消息失败:', err)
      setCommitted([])
      setClarifyMessages([])
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  /** 加载模型（后端启用 + 自定义大模型） */
  const loadModels = useCallback(async () => {
    setModelLoading(true)
    try {
      const [listResult, customResult] = await Promise.allSettled([chatApi.listChatModels(), listLlmIntegrations()])
      const list = listResult.status === 'fulfilled' && Array.isArray(listResult.value) ? listResult.value : []
      const custom = customResult.status === 'fulfilled' && Array.isArray(customResult.value) ? customResult.value : []
      setModelOptions(list)
      setCustomIntegrations(custom)
    } catch (err) {
      console.warn('[HermesChat] 加载模型失败:', err)
    } finally {
      setModelLoading(false)
    }
  }, [])

  /** 加载市场 Agent（仅填充选择器；Hermes 直连暂不消费 agentId） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await listMarketAgents({ pageSize: 100 })
        if (cancelled) return
        const list = result.list || []
        setAgentOptions(list.map((a) => ({ id: a.id, name: a.name, avatar: a.avatar, description: a.description })))
        const priceMap: Record<number, Agent> = {}
        list.forEach((a) => { priceMap[a.id] = a })
        setAgentPriceMap(priceMap)
      } catch (err) {
        console.warn('[HermesChat] 加载 Agent 失败:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** 深链支持：/chat?agentId= 或市场页跳转携带的 agentId，进入后预选对应 Agent */
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const raw = searchParams.get('agentId')
    if (!raw) return
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) return
    setAgentId(parsed)
  }, [searchParams])

  /** 加载知识库（我的 + 官方） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [mine, official] = await Promise.all([listKnowledgeBases(), listOfficialKnowledgeBases({ page: 1, pageSize: 50 })])
        if (cancelled) return
        setKbOptions([
          ...(mine || []).map((k) => ({ id: k.id, name: k.name, description: k.description })),
          ...(official?.list || []).map((k) => ({ id: k.id, name: k.industryName ? k.name + ' · ' + k.industryName : k.name, description: k.description || '官方知识库' })),
        ])
      } catch (err) {
        console.warn('[HermesChat] 加载知识库失败:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { void loadModels() }, [loadModels])

  /** 加载官署人格（SOUL 注入用；IPC 不可用时降级为空列表） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setPersonaLoading(true)
      try {
        const r = await edictModels()
        if (cancelled || !r || !Array.isArray(r.profiles)) return
        setPersonaOptions(r.profiles)
      } catch (err) {
        console.warn('[HermesChat] 加载官署人格失败:', err)
      } finally {
        if (!cancelled) setPersonaLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** 持久化人格选择（刷新保持） */
  useEffect(() => {
    writeLocalPref(PERSONA_STORAGE_KEY, personaId)
  }, [personaId])

  /** 持久化记忆面板 tab（刷新保持） */
  useEffect(() => {
    writeLocalPref(MEMORY_TARGET_STORAGE_KEY, memoryTarget)
  }, [memoryTarget])

  /** 加载 Hermes 记忆条目（USER.md=profile / MEMORY.md=memory） */
  const loadMemory = useCallback(async (target: 'profile' | 'memory') => {
    const mem = window.electronAPI?.hermesMemory
    if (!mem) return
    setMemoryLoading(true)
    try {
      const r = await mem.list(target)
      if (r.ok) setMemoryEntries(r.entries || [])
    } catch (err) {
      console.warn('[HermesChat] 加载记忆失败:', err)
      setMemoryEntries([])
    } finally {
      setMemoryLoading(false)
    }
  }, [])

  const handleAddMemory = useCallback(async () => {
    const mem = window.electronAPI?.hermesMemory
    const text = memoryDraft.trim()
    if (!mem || !text) return
    await mem.add(memoryTarget, text)
    setMemoryDraft('')
    await loadMemory(memoryTarget)
  }, [memoryDraft, memoryTarget, loadMemory])

  const handleRemoveMemory = useCallback(async (text: string) => {
    const mem = window.electronAPI?.hermesMemory
    if (!mem) return
    await mem.remove(memoryTarget, text)
    await loadMemory(memoryTarget)
  }, [memoryTarget, loadMemory])

  useEffect(() => {
    if (memoryOpen && memoryTab !== 'providers') void loadMemory(memoryTarget)
  }, [memoryOpen, memoryTarget, memoryTab, loadMemory])

  /** 切换默认模型：新建会话缺省；当前会话即时更新 */
  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId)
    if (sessionIdRef.current && sessionIdRef.current > 0) {
      if (!modelId.startsWith('custom/')) {
        chatApi.updateSession(sessionIdRef.current, { modelId }).catch((err) => console.warn('[HermesChat] 更新会话模型失败:', err))
        chatApi.setPreferredChatModel(modelId).catch((err) => console.warn('[HermesChat] 设置默认模型失败:', err))
      }
    }
  }, [])

  /** 切换知识库：当前会话即时更新；发送时作为检索依赖 */
  const handleKnowledgeBaseChange = useCallback((kbId?: number) => {
    setKnowledgeBaseId(kbId)
    if (sessionIdRef.current && sessionIdRef.current > 0) {
      chatApi.updateSession(sessionIdRef.current, { knowledgeBaseId: kbId }).catch((err) => console.warn('[HermesChat] 更新知识库失败:', err))
    }
  }, [])

  /** 切换 Agent（Hermes 直连暂不消费，仅记录到会话） */
  const handleAgentChange = useCallback((id?: number) => {
    setAgentId(id)
    if (sessionIdRef.current && sessionIdRef.current > 0) {
      chatApi.updateSession(sessionIdRef.current, { agentId: id }).catch((err) => console.warn('[HermesChat] 更新 Agent 失败:', err))
    }
  }, [])

  const selectedAgent = agentId != null ? agentPriceMap[agentId] : undefined
  const personaLabel = personaOptions.find((p) => p.id === personaId)?.label ?? ''
  const agentPriceHint = useMemo(() => {
    if (!selectedAgent) return ''
    const parts: string[] = []
    if (selectedAgent.pricePerCall > 0) parts.push(selectedAgent.pricePerCall + ' 积分/次')
    if (selectedAgent.pricePerToken?.input > 0 || selectedAgent.pricePerToken?.output > 0) parts.push('Token 费用')
    return parts.length ? parts.join(' + ') : '免费'
  }, [selectedAgent])

  /** 追加一条本地助手消息（用于斜杠命令反馈，不进入模型历史/沉淀） */
  const appendLocalMessage = useCallback((text: string) => {
    const id = ++idRef.current
    localMsgIdsRef.current.add(id)
    const msg: ChatMessage = { id, sessionId: sessionIdRef.current || 0, userId: 0, role: 'assistant', content: text, status: 'done', createdAt: new Date() }
    setCommitted((prev) => [...prev, msg])
  }, [])

  /** 推理强度变更：localStorage 持久化，随后随 send 下发 */
  const handleReasoningEffortChange = useCallback((next: ReasoningEffort) => {
    setReasoningEffort(next)
    writeLocalPref(REASONING_EFFORT_STORAGE_KEY, next)
  }, [])

  /** 本地斜杠命令执行（/new /clear /help /usage /version /persona /skills /memory /settings /office /agents /schedules /gateway /kanban 等） */
  const handleLocalSlashCommand = useCallback((parsed: ParsedSlashCommand) => {
    const name = parsed.name
    switch (name) {
      case 'new':
        setCommitted([])
        setClarifyMessages([])
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
        sessionIdRef.current = null
        hermesRuntimeSidRef.current = null
        setActiveSessionId(null)
        setSessionTitle('和深瞳机器人对话')
        setRefreshTrigger((t) => t + 1)
        break
      case 'clear':
        setCommitted([])
        setClarifyMessages([])
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
        hermesRuntimeSidRef.current = null
        break
      case 'model':
        setSettingsOpen(true)
        break
      case 'help':
      case 'commands':
        appendLocalMessage(SLASH_HELP)
        break
      case 'usage': {
        let tokens = 0
        let cost = 0
        committed.forEach((m) => {
          if (m.tokenUsage) tokens += (m.tokenUsage.totalTokens || (m.tokenUsage.promptTokens + m.tokenUsage.completionTokens))
          if (m.creditsCost) cost += m.creditsCost
        })
        appendLocalMessage('⚙️ 本次会话 token 用量：合计 ' + tokens + ' tokens' + (cost > 0 ? '，估算积分 ' + cost.toFixed(2) : '') + '。')
        break
      }
      case 'version': {
        const v = status?.status?.version ?? status?.stats?.hermes_version ?? '未知'
        appendLocalMessage('⚙️ 深瞳机器人版本：' + v)
        break
      }
      case 'persona':
        setPersonaOpen(true)
        break
      case 'image':
        setGenerationType('image')
        setGenerationOpen(true)
        break
      case 'video':
        setGenerationType('video')
        setGenerationOpen(true)
        break
      case 'skills':
      case 'discover':
        navigate('/skill-market')
        break
      case 'memory':
        setMemoryOpen(true)
        break
      case 'settings':
      case 'providers':
        navigate('/settings')
        break
      case 'office':
        navigate('/office')
        break
      case 'agents':
        navigate('/agent-market')
        break
      case 'schedules':
        navigate('/automation')
        break
      case 'gateway':
        navigate('/services')
        break
      case 'kanban':
        navigate('/task-center')
        break
      case 'fast':
        appendLocalMessage('⚙️ 快速模式（/fast）规划中。')
        break
      case 'status':
        appendLocalMessage('⚙️ 深瞳机器人状态：' + (ready === null ? '检测中' : ready ? '运行中' : '未启动') + (status?.status?.version ? ' · 版本 ' + status.status.version : '') + '。')
        break
      case 'debug': {
        const tokenTotal = committed.reduce((n, m) => n + (m.tokenUsage?.totalTokens || ((m.tokenUsage?.promptTokens || 0) + (m.tokenUsage?.completionTokens || 0))), 0)
        const personaName = personaOptions.find((x) => x.id === personaId)?.label ?? '未设置'
        appendLocalMessage([
          '⚙️ 深瞳机器人调试信息：',
          '状态：' + (ready === null ? '检测中' : ready ? '运行中' : '未启动'),
          '模型：' + selectedModel,
          '人格：' + personaName,
          '知识库：' + (knowledgeBaseId ?? '未绑定'),
          '会话：' + (sessionIdRef.current ?? '未创建'),
          'Token 合计：' + tokenTotal,
        ].join('\n'))
        break
      }
      case 'undo':
        setCommitted((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') next.pop()
          return next
        })
        appendLocalMessage('⚙️ 已撤回上一条助手回复。')
        break
      case 'compact':
      case 'compress':
        setCommitted([])
        setClarifyMessages([])
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        appendLocalMessage('⚙️ 已压缩上下文，历史已清空（后续对话将重新开始）。')
        break
      case 'learn':
      case 'remember':
      case 'recall':
        setMemoryOpen(true)
        break
      case 'resume':
        appendLocalMessage('⚙️ 恢复会话：请在左侧会话列表选择历史对话继续。')
        break
      case 'reset':
        setCommitted([])
        setClarifyMessages([])
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
        hermesRuntimeSidRef.current = null
        appendLocalMessage('⚙️ 已重置上下文。')
        break
      case 'reload-skills':
        void window.electronAPI?.hermesSkills?.check?.().then((r) => {
          appendLocalMessage(r?.ok ? '⚙️ 技能目录已刷新。' : '⚙️ 技能刷新失败：' + (r?.error || '未知错误'))
        })
        break
      case 'curator':
        appendLocalMessage('⚙️ Curator（技能使用排序）状态：待深瞳机器人网关返回 usage-rank 数据。')
        break
      case 'tools':
        setToolsOpen(true)
        break
      default:
        appendLocalMessage('⚙️ 未知斜杠命令：/' + name + '，输入 /help 查看可用命令。')
    }
  }, [committed, status, agentOptions, agentId, navigate, appendLocalMessage, ready, selectedModel, knowledgeBaseId, personaOptions, personaId])

  /** 素材生成完成 → 追加助手消息 + 持久化 */
  const handleGenerationComplete = useCallback((job: MediaJob) => {
    const promptText = job.prompt || ''
    const firstUrl = job.resultUrls?.[0] || ''
    const typeLabel = job.type === 'image' ? '文生图' : '文生视频'
    let mediaMarkdown = ''
    if (firstUrl) {
      mediaMarkdown = job.type === 'image' ? '![' + promptText + '](' + firstUrl + ')' : firstUrl
    }
    const costText = job.creditsCost > 0 ? '（已扣除 ' + job.creditsCost + ' 积分）' : ''
    const assistantMsg: ChatMessage = {
      id: Date.now() + 2,
      sessionId: sessionIdRef.current || 0,
      userId: 0,
      role: 'assistant',
      content: ('✨ ' + typeLabel + '完成' + costText + '\n' + (promptText ? '提示词：' + promptText + '\n' : '') + mediaMarkdown).replace(/\n$/, ''),
      status: 'done',
      creditsCost: job.creditsCost,
      createdAt: new Date(),
    }
    setCommitted((prev) => [...prev, assistantMsg])
    if (sessionIdRef.current && sessionIdRef.current > 0) {
      persistHermesMessage(sessionIdRef.current, { role: 'assistant', content: assistantMsg.content, creditsCost: job.creditsCost }, pipelineDeps)
    }
    setGenerationOpen(false)
  }, [])
  if (!handleRef.current) {
    // 在 Electron 渲染层创建；非 Electron 环境抛错由下方 try/catch 兜底
    try {
      handleRef.current = createHermesChat()
    } catch {
      handleRef.current = null
    }
  }
  const handle = handleRef.current

  const gatewayRef = useRef<HermesGatewayHandle | null>(null)
  if (!gatewayRef.current) {
    try {
      gatewayRef.current = createHermesGatewayHandle({ wsUrl: () => window.electronAPI?.hermesGateway?.getUrl() ?? Promise.resolve({ error: 'gateway api 不可用' }) })
    } catch (err) {
      console.warn('[HermesChat] gateway 句柄创建失败:', err)
      gatewayRef.current = null
    }
  }
  const gateway = gatewayRef.current

  /** 确保 gateway 已连接（幂等；失败不抛错） */
  const ensureGateway = useCallback(async (): Promise<{ connected: boolean; error?: string }> => {
    if (!gateway) return { connected: false, error: 'gateway 不可用' }
    if (gateway.connected) return { connected: true }
    setGw((g) => ({ ...g, checking: true }))
    const r = await gateway.connect()
    setGw({ connected: r.ok, checking: false, error: r.error })
    return { connected: r.ok, error: r.error }
  }, [gateway])

  /** Agent 网关命令（/web /browse /code /shell）：经 Hermes gateway slash.exec 执行 */
  const runAgentGatewayCommand = useCallback(async (parsed: ParsedSlashCommand) => {
    const conn = await ensureGateway()
    if (!conn.connected) {
      appendLocalMessage('⚙️ 该命令（/' + parsed.name + '）需深瞳机器人网关，当前未连接。请在「服务」页确认深瞳机器人运行后再试。')
      return
    }
    appendLocalMessage('⚙️ 正在通过深瞳机器人网关执行 /' + parsed.name + ' ...')
    const sid = hermesRuntimeSidRef.current || ''
    const r = await gateway!.request('slash.exec', { command: parsed.raw.replace(/^\/+/, ''), session_id: sid })
    if (r.ok) {
      const out = typeof r.result === 'string' ? r.result : r.result == null ? '(无返回)' : JSON.stringify(r.result)
      appendLocalMessage('⚙️ /' + parsed.name + ' 完成：' + out)
    } else {
      appendLocalMessage('⚙️ /' + parsed.name + ' 执行失败：' + (r.error || '未知错误'))
    }
  }, [ensureGateway, appendLocalMessage, gateway])

  /** Clarify 卡片应答：经 gateway 透传真实 clarify.respond，成功后本地翻转已解决 */
  const handleClarifyRespond = useCallback(async (requestId: string, answer: string): Promise<boolean> => {
    if (!gateway) { appendLocalMessage('⚙️ Clarify 应答需深瞳机器人网关。'); return false }
    if (!gateway.connected) {
      const conn = await ensureGateway()
      if (!conn.connected) { appendLocalMessage('⚙️ Clarify 应答需深瞳机器人网关，当前未连接。'); return false }
    }
    const r = await gateway.request('clarify.respond', { request_id: requestId, answer })
    if (!r.ok) { appendLocalMessage('⚙️ Clarify 应答失败：' + (r.error || '未知错误')); return false }
    return true
  }, [gateway, ensureGateway, appendLocalMessage])

  /** 本地将 clarify 卡片标为已解决（只读态） */
  const handleClarifyResolved = useCallback((requestId: string, answer: string) => {
    setClarifyMessages((prev) => prev.map((m) => m.requestId === requestId ? { ...m, answer, resolved: true } : m))
  }, [])

  useEffect(() => {
    void ensureGateway()
    const t = window.setInterval(() => void ensureGateway(), 6000)
    return () => window.clearInterval(t)
  }, [ensureGateway])

  /** 打开 SOUL 编辑器（上游 Soul 组件自行读写） */
  const openSoulEditor = useCallback((profileId: string) => {
    setSoulProfileId(profileId)
    setSoulOpen(true)
  }, [])

  /** 忙碌队列：上一轮结束后自动发送下一条排队消息（忠实上游 QueuedMessages 的排队模型） */
  const flushQueue = useCallback(() => {
    if (flushingRef.current) return
    if (queueRef.current.length === 0) return
    const next = queueRef.current.shift()!
    setQueue([...queueRef.current])
    flushingRef.current = true
    void sendDraftRef.current(next.text, next.attachments).catch((err) => {
      // 发送未能启动（会话/网关等前置步骤抛错，此时不会走到 commit）：复位队列锁并把
      // 消息放回队首，否则 flushingRef 永远为 true，后续排队消息全部静默丢弃。
      flushingRef.current = false
      queueRef.current.unshift(next)
      setQueue([...queueRef.current])
      setSending(false)
      const msg = err instanceof Error ? err.message : String(err)
      setStream((s) => ({ ...s, phase: 'error', error: msg }))
    })
  }, [])

  const commit = useCallback((statusOk: 'done' | 'error') => {
    if (finalizedRef.current) return
    finalizedRef.current = true
    setClarifyMessages([])
    const s = streamRef.current
    const sessionId = sessionIdRef.current || 0
    const assistant: ChatMessage = {
      id: ++idRef.current,
      sessionId,
      userId: 0,
      role: 'assistant',
      content: s.content,
      toolCalls: s.toolCalls.length ? s.toolCalls : undefined,
      tokenUsage: s.usage
        ? { promptTokens: s.usage.input, completionTokens: s.usage.output, totalTokens: s.usage.total }
        : undefined,
      status: statusOk,
      creditsCost: estimateCost(s.usage, modelOptions, selectedModel),
      createdAt: new Date(),
    }
    setCommitted((prev) => [...prev, assistant])

    // 会话持久化（非阻断；后端不可用时仅本地展示）
    if (sessionId > 0 && s.content.trim()) {
      persistHermesMessage(sessionId, {
        role: 'assistant',
        content: s.content,
        toolCalls: assistant.toolCalls,
        tokenUsage: assistant.tokenUsage,
        creditsCost: assistant.creditsCost,
      }, pipelineDeps)
    }

    // Office 事件 + 沉淀提示（仅在正常完成且未中断时触发）
    if (statusOk === 'done' && !abortedRef.current) {
      officeBridge.onReview()
      setTimeout(() => officeBridge.onTaskComplete(), 1500)
      void runHermesSediment({
        content: lastUserMessageRef.current,
        history: lastHistoryRef.current,
        sessionId,
        knowledgeBaseId: lastKbRef.current,
        modelId: lastModelRef.current,
      }, pipelineDeps).then((n) => { if (n) setSedimentNotice(n) })
    }

    streamRef.current = EMPTY_STREAM
    setStreamState(EMPTY_STREAM)
    // 忙碌队列：上一轮结束后自动发送下一条排队消息
    flushingRef.current = false
    flushQueue()
  }, [modelOptions, selectedModel, setClarifyMessages, flushQueue])

  useEffect(() => {
    // 状态轮询：健康 + Hermes 状态；运行时缺失时给一键安装（HermesRuntimeInstallAlert）
    let mounted = true
    let probed = false
    const probeRuntime = async () => {
      if (probed) return
      probed = true
      try {
        const r = await window.electronAPI?.hermesSkills.check()
        if (mounted && r && !r.ok && r.error?.includes('Hermes 运行时未安装或未配置')) {
          setRuntimeError(r.error)
        }
      } catch {
        /* 探测失败忽略，保持通用“未就绪”提示 */
      }
    }
    const refresh = async () => {
      const ok = await checkHealth()
      if (mounted) setReady(ok)
      if (ok) {
        if (mounted) setRuntimeError(null)
      } else {
        void probeRuntime()
      }
      try {
        const st = await window.electronAPI?.hermesStatus.get()
        if (mounted) setStatus(st ?? null)
      } catch {
        if (mounted) setStatus(null)
      }
    }
    void refresh()
    const t = window.setInterval(refresh, 5000)
    return () => {
      mounted = false
      window.clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!handle) return
    const un = [
      handle.onMessage((content) => {
        if (!replyGeneratedRef.current) {
          replyGeneratedRef.current = true
          officeBridge.onReplyGenerated()
        }
        setStream((s) => ({ ...s, content: s.content + content }))
      }),
      handle.onFinalize((content) => setStream((s) => ({ ...s, content }))),
      handle.onToolCall((tc) => {
        officeBridge.onToolCall(tc.name)
        if (isRetrieveTool(tc.name)) officeBridge.onAgentRetrieve()
        setStream((s) => ({ ...s, toolCalls: upsertTool(s.toolCalls, tc) }))
      }),
      handle.onLifecycle((info) => setStream((s) => ({ ...s, phase: info.phase }))),
      handle.onDone((payload) => {
        setStream((s) => ({ ...s, usage: payload?.usage, phase: 'end' }))
        commit('done')
      }),
      handle.onError((err) => {
        if (abortedRef.current) return
        officeBridge.onSystemError(err.message)
        setStream((s) => ({ ...s, phase: 'error', error: err.message }))
        commit('error')
      }),
    ]
    return () => un.forEach((off) => off())
  }, [handle, setStream, commit])

  // Hermes gateway 运行时会话：session.resume → 失败则 session.create 带历史种子
  const ensureHermesRuntimeSession = useCallback(async (): Promise<string> => {
    const profileParam = personaId && personaId !== "default" ? { profile: personaId } : {}
    const existing = hermesRuntimeSidRef.current
    if (existing) {
      try {
        const resumed = await gateway!.request<{ session_id?: string }>("session.resume", { session_id: existing, cols: 96, ...profileParam })
        if (resumed.ok && resumed.result?.session_id) {
          hermesRuntimeSidRef.current = resumed.result.session_id
          return resumed.result.session_id
        }
      } catch {
        hermesRuntimeSidRef.current = null
      }
    }
    const seed = committed
      .filter((m) => (m.role === "user" || m.role === "assistant") && !localMsgIdsRef.current.has(m.id))
      .slice(-24)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }))
    const created = await gateway!.request<{ session_id?: string }>("session.create", {
      cols: 96,
      ...(seed.length ? { messages: seed } : {}),
      ...profileParam,
    })
    if (!created.ok || !created.result?.session_id) throw new Error(created.error || "session.create 未返回 session_id")
    hermesRuntimeSidRef.current = created.result.session_id
    return created.result.session_id
  }, [gateway, personaId, committed])

  /** 授权/拒绝命令：直接以用户消息经 prompt.submit 打给当前暂停的 Hermes 回合（不走 slash.exec） */
  const sendControl = useCallback(async (command: '/approve' | '/deny') => {
    if (!gateway) { appendLocalMessage('⚙️ /' + command.slice(1) + ' 需深瞳机器人网关。'); return }
    const conn = gateway.connected ? { connected: true } : await ensureGateway()
    if (!conn.connected) { appendLocalMessage('⚙️ /' + command.slice(1) + ' 需深瞳机器人网关，当前未连接。'); return }
    setSending(true)
    officeBridge.onChatMessageSent()
    const userMsg: ChatMessage = {
      id: ++idRef.current,
      sessionId: sessionIdRef.current || 0,
      userId: 0,
      role: 'user',
      content: command,
      status: 'done',
      createdAt: new Date(),
    }
    setCommitted((prev) => [...prev, userMsg])
    const prevSessionId = sessionIdRef.current
    const sessionId = await ensureHermesSession(prevSessionId, command, { modelId: selectedModel, knowledgeBaseId }, pipelineDeps)
    sessionIdRef.current = sessionId
    if (sessionId > 0) {
      persistHermesMessage(sessionId, { role: 'user', content: command }, pipelineDeps)
      if (sessionId !== prevSessionId) {
        setActiveSessionId(sessionId)
        setSessionTitle(command === '/approve' ? '审批通过 · 深瞳机器人' : '审批拒绝 · 深瞳机器人')
        setRefreshTrigger((t) => t + 1)
      }
    }
    try {
      const runtimeSid = await ensureHermesRuntimeSession()
      const r = await gateway.request('prompt.submit', {
        session_id: runtimeSid,
        text: command,
        ...(personaId && personaId !== 'default' ? { profile: personaId } : {}),
      })
      if (!r.ok) throw new Error(r.error || 'prompt.submit 失败')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      officeBridge.onSystemError(msg)
      appendLocalMessage('⚙️ /' + command.slice(1) + ' 失败：' + msg)
      setSending(false)
    }
  }, [gateway, ensureGateway, ensureHermesSession, ensureHermesRuntimeSession, appendLocalMessage, selectedModel, knowledgeBaseId, personaId])

  // Hermes gateway(/api/ws) 事件流：message.delta / message.complete / tool.* / error → 更新流并提交
  useEffect(() => {
    if (!gateway) return
    const off = gateway.onEvent((e) => {
      if (e.type === "message.start") {
        setStream((s) => ({ ...s, phase: "start" }))
        return
      }
      if (e.type === "message.delta") {
        if (!replyGeneratedRef.current) {
          replyGeneratedRef.current = true
          officeBridge.onReplyGenerated()
        }
        const text = gwText(e.payload, "text", "delta")
        if (text) setStream((s) => ({ ...s, content: s.content + text }))
        return
      }
      if (e.type === "reasoning.delta" || e.type === "thinking.delta") return
      if (e.type === "tool.start" || e.type === "tool.progress" || e.type === "tool.generating" || e.type === "tool.complete" || e.type === "tool.done") {
        const tc = gwToolFromEvent(e.type, e.payload)
        if (tc) {
          officeBridge.onToolCall(tc.name)
          if (isRetrieveTool(tc.name)) officeBridge.onAgentRetrieve()
          setStream((s) => ({ ...s, toolCalls: upsertTool(s.toolCalls, tc) }))
        }
        return
      }
      if (e.type === "clarify.request") {
        const cm = gwClarifyFromEvent(e.payload)
        if (cm) {
          setClarifyMessages((prev) => prev.some((m) => m.requestId === cm.requestId) ? prev : [...prev, cm])
        }
        return
      }
      if (e.type === "background.complete" || e.type === "background.done") {
        const p = (e.payload && typeof e.payload === "object" ? e.payload : {}) as { task_id?: string; text?: string }
        const label = p.task_id ? "[bg " + p.task_id + "] " : "[bg] "
        const body = String(p.text ?? "").trim() || "(no output)"
        const id = ++idRef.current
        localMsgIdsRef.current.add(id)
        const bgMsg: ChatMessage = { id, sessionId: sessionIdRef.current || 0, userId: 0, role: "assistant", content: label + body, status: "done", createdAt: new Date() }
        setCommitted((prev) => [...prev, bgMsg])
        return
      }
      if (e.type === "background.error" || e.type === "background.failed") {
        const bgErr = typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload ?? "")
        appendLocalMessage("⚙️ /btw 后台失败：" + bgErr)
        return
      }
      if (e.type === "message.complete") {
        if (abortedRef.current) { setSending(false); return }
        const errText = gwText(e.payload, "error")
        const failed = !!errText
        const text = gwText(e.payload, "text", "rendered") || streamRef.current.content
        const usage = gwUsage(e.payload)
        if (failed) officeBridge.onSystemError(errText)
        setStream((s) => ({ ...s, content: text, usage: usage ?? s.usage, phase: failed ? "error" : "end" }))
        setSending(false)
        commit(failed ? "error" : "done")
        return
      }
      if (e.type === "error" || e.type === "gateway.error") {
        const msg = typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload)
        if (!abortedRef.current) officeBridge.onSystemError(msg)
        setStream((s) => ({ ...s, phase: "error", error: msg }))
        setSending(false)
        commit("error")
        return
      }
    })
    return off
  }, [gateway, setStream, commit])


  /** 旁支问题（/btw、/bg、/background、💭 快捷提问）：后台并发 agent，不阻塞主回合 */
  const sendBackground = useCallback(async (raw: string) => {
    const question = raw.replace(/^\/(btw|bg|background)\s*/i, '').replace(/^💭\s*/, '').trim()
    if (!question) return
    if (!gateway) { appendLocalMessage('⚙️ /btw 需深瞳机器人网关。'); return }
    const conn = gateway.connected ? { connected: true } : await ensureGateway()
    if (!conn.connected) { appendLocalMessage('⚙️ /btw 需深瞳机器人网关，当前未连接。'); return }
    const id = ++idRef.current
    localMsgIdsRef.current.add(id)
    const userMsg: ChatMessage = { id, sessionId: sessionIdRef.current || 0, userId: 0, role: 'user', content: '💭 ' + question, status: 'done', createdAt: new Date() }
    setCommitted((prev) => [...prev, userMsg])
    try {
      const runtimeSid = await ensureHermesRuntimeSession()
      const r = await gateway.request('prompt.background', {
        session_id: runtimeSid,
        text: question,
        ...(personaId && personaId !== 'default' ? { profile: personaId } : {}),
      })
      if (!r.ok) throw new Error(r.error || 'prompt.background 失败')
    } catch (err) {
      appendLocalMessage('⚙️ /btw 失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [gateway, ensureGateway, ensureHermesRuntimeSession, appendLocalMessage, personaId])

  const sendRaw = useCallback(
    async (text: string, attachments?: UpstreamAttachment[]) => {
      if (!text.trim()) return
      const parsedSlash = parseSlashCommand(text)
      if (parsedSlash) {
        if (parsedSlash.name === 'retry') {
          const lastUser = [...committed].reverse().find((m) => m.role === 'user' && !localMsgIdsRef.current.has(m.id))
          if (!lastUser) {
            appendLocalMessage('⚙️ 没有可重发的用户消息。')
            return
          }
          text = lastUser.content
        } else if (parsedSlash.name === 'btw' || parsedSlash.name === 'bg' || parsedSlash.name === 'background') {
          void sendBackground(text)
          return
        } else if (LOCAL_COMMAND_NAMES.has(parsedSlash.name)) {
          handleLocalSlashCommand(parsedSlash)
          return
        } else if (AGENT_ONLY_COMMAND_NAMES.has(parsedSlash.name) && parsedSlash.name !== 'approve' && parsedSlash.name !== 'deny') {
          void runAgentGatewayCommand(parsedSlash)
          return
        } else {
          appendLocalMessage('⚙️ 未知斜杠命令：/' + parsedSlash.name + '，输入 /help 查看可用命令。')
          return
        }
      }
      finalizedRef.current = false
      abortedRef.current = false
      replyGeneratedRef.current = false
      streamRef.current = { ...EMPTY_STREAM, phase: 'start' }
      setStreamState(streamRef.current)
      setSending(true)
      setSedimentNotice(null)

      // 近一轮快照（沉淀识别用）
      lastUserMessageRef.current = text
      lastHistoryRef.current = committed
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && !localMsgIdsRef.current.has(m.id))
        .map((m) => m.content)
      lastKbRef.current = knowledgeBaseId
      lastModelRef.current = selectedModel

      officeBridge.onChatMessageSent()
      const intent = detectScheduleIntent(text)
      if (intent) setSchedulePick(intent)
      // 用户消息先入列（会话未就绪时也即时展示）
      const userMsg: ChatMessage = {
        id: ++idRef.current,
        sessionId: sessionIdRef.current || 0,
        userId: 0,
        role: 'user',
        content: text,
        attachments: attachments?.length ? attachments.map(upstreamToDeepAttachment) : undefined,
        status: 'done',
        createdAt: new Date(),
      }
      setCommitted((prev) => [...prev, userMsg])

      // 创建/复用后端会话（失败降级为仅本地展示）
      const prevSessionId = sessionIdRef.current
      const sessionId = await ensureHermesSession(prevSessionId, text, { modelId: selectedModel, knowledgeBaseId }, pipelineDeps)
      sessionIdRef.current = sessionId
      if (sessionId > 0) {
        persistHermesMessage(sessionId, { role: 'user', content: text }, pipelineDeps)
        if (sessionId !== prevSessionId) {
          setActiveSessionId(sessionId)
          setSessionTitle(text.slice(0, 50) || '和深瞳机器人对话')
          setRefreshTrigger((t) => t + 1)
        }
      }

      const gwConn = await ensureGateway()
      try {
        if (!gwConn.connected || !gateway) {
          throw new Error('深瞳机器人网关未连接，请到「服务」页重启深瞳机器人服务后重试')
        }
        const runtimeSid = await ensureHermesRuntimeSession()
        let submitText = text
        if (attachments && attachments.length) {
          const synced = await syncAttachmentsForSubmit(gateway, runtimeSid, attachments)
          if (!synced.ok) throw new Error(synced.error || '附件上传失败')
          if (synced.refs.length) submitText = [synced.refs.join('\n'), text].filter(Boolean).join('\n\n')
        }
        const submit = await gateway!.request('prompt.submit', {
          session_id: runtimeSid,
          text: submitText,
          ...(personaId && personaId !== 'default' ? { profile: personaId } : {}),
        })
        if (!submit.ok) throw new Error(submit.error || 'prompt.submit 失败')
      } catch (err) {
        if (!abortedRef.current) {
          const msg = err instanceof Error ? err.message : String(err)
          officeBridge.onSystemError(msg)
          setStream((s) => ({ ...s, phase: 'error', error: msg }))
          setSending(false)
          commit('error')
        }
      }
    },
    [committed, commit, selectedModel, handleLocalSlashCommand, appendLocalMessage, personaId, runAgentGatewayCommand, ensureGateway, ensureHermesRuntimeSession, sendBackground],
  )

  sendDraftRef.current = sendRaw

  /** 对外的发送入口：忙碌（Agent 处理中）时把消息放入 busy 队列；空闲时直接发送 */
  const send = useCallback(
    async (text: string, attachments?: UpstreamAttachment[]) => {
      if (!text.trim()) return
      const parsedSlash = parseSlashCommand(text)
      // 非阻塞斜杠命令（后台 / 本地 / agent 网关 / 未知）忙碌时也立即处理，不入队列
      if (parsedSlash) {
        if (parsedSlash.name === 'btw' || parsedSlash.name === 'bg' || parsedSlash.name === 'background') {
          void sendBackground(text)
          return
        }
        if (parsedSlash.name === 'retry') {
          // /retry 需要解析上一条用户消息 → 走普通发送，进入排队
        } else if (LOCAL_COMMAND_NAMES.has(parsedSlash.name)) {
          handleLocalSlashCommand(parsedSlash)
          return
        }
        if (AGENT_ONLY_COMMAND_NAMES.has(parsedSlash.name) && parsedSlash.name !== 'approve' && parsedSlash.name !== 'deny') {
          void runAgentGatewayCommand(parsedSlash)
          return
        }
        if (parsedSlash.name !== 'retry') {
          appendLocalMessage('⚙️ 未知斜杠命令：/' + parsedSlash.name + '，输入 /help 查看可用命令。')
          return
        }
      }
      if (sending || flushingRef.current) {
        const draft: QueuedDraft = { text, attachments: attachments ?? [] }
        queueRef.current = [...queueRef.current, draft]
        setQueue([...queueRef.current])
        return
      }
      await sendRaw(text, attachments)
    },
    [sending, sendRaw, sendBackground, handleLocalSlashCommand, runAgentGatewayCommand, appendLocalMessage],
  )

  const abort = useCallback(() => {
    abortedRef.current = true
    setClarifyMessages([])
    handle?.abort()
    const sid = hermesRuntimeSidRef.current
    if (gateway && sid) void gateway.request('session.interrupt', { session_id: sid }).catch(() => undefined)
    setSending(false)
    // 中断当前回合，同时释放忙碌锁：若队列仍有消息，会在下一轮 commit 时继续发送
    flushingRef.current = false
  }, [handle, gateway])

  const statusLabel = ready === null ? '检测中' : ready ? '运行中' : '未启动'
  const statusColor = ready === null ? 'default' : ready ? 'success' : 'error'

  const showEmpty = !loadingHistory && committed.length === 0 && !sending && !stream.content && !stream.error

  const upstreamMessages = useMemo(() => toUpstreamMessages(committed, stream, clarifyMessages), [committed, stream, clarifyMessages])
  const chatInputRef = useRef<UpstreamChatInputHandle>(null)
  const contextWindow = contextWindowForModel(selectedModel)
  const modelGroups = useMemo<UpstreamModelGroup[]>(() => {
    const byProvider: Record<string, UpstreamModelGroup> = {}
    for (const m of modelOptions) {
      const provider = m.provider || 'custom'
      const label = m.name || m.id
      if (!byProvider[provider]) byProvider[provider] = { provider, providerLabel: provider, models: [] }
      byProvider[provider].models.push({ provider, model: m.id, label, baseUrl: '' })
    }
    return Object.values(byProvider)
  }, [modelOptions])

  const selectedModelLabel = useMemo(
    () => modelOptions.find((m) => m.id === selectedModel)?.name || selectedModel,
    [modelOptions, selectedModel],
  )

  useEffect(() => {
    function handleWebPreviewNavigate(e: Event): void {
      const url = (e as CustomEvent<string>).detail
      if (url) { setWebPreviewUrl(url); setWebPreviewOpen(true) }
    }
    document.addEventListener('web-preview:navigate', handleWebPreviewNavigate)
    return () => document.removeEventListener('web-preview:navigate', handleWebPreviewNavigate)
  }, [])

  return (
    <div className={`${styles.page} hermes-chat-upstream`} data-theme="dark">
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <RobotOutlined className={styles.titleIcon} />
          <span className={styles.title}>深瞳机器人</span>
        </div>
        <Space size="small" wrap>
          <Tooltip title="深瞳机器人健康状态（本地 :8642）">
            <Tag color={statusColor}>{statusLabel}</Tag>
          </Tooltip>
          {status?.status?.version ? <Tag>{String(status.status.version)}</Tag> : null}
          {status?.status?.active_sessions != null ? <Tag>会话 {String(status.status.active_sessions)}</Tag> : null}
          {status?.stats?.hermes_version ? <Tag>核心 {String(status.stats.hermes_version)}</Tag> : null}
          <Tag color="geekblue" style={{ cursor: 'pointer' }} onClick={() => setPersonaOpen(true)}>
            人格 · {personaLabel || '未设置'}
          </Tag>
          <Tag color="cyan" style={{ cursor: 'pointer' }} onClick={() => setMemoryOpen(true)}>记忆</Tag>
          <Tag color={gw.connected ? 'success' : 'default'} style={{ cursor: 'pointer' }} onClick={() => void ensureGateway()}>
            网关 {gw.connected ? '已连接' : gw.checking ? '连接中' : '未连接'}
          </Tag>
        </Space>
      </header>

      <div className={styles.layout}>
        <SessionList
          activeSessionId={activeSessionId}
          defaultModelId={selectedModel}
          onSelectSession={(s) => void handleSelectSession(s)}
          refreshTrigger={refreshTrigger}
        />

        <div className={styles.body}>
          <div className={styles.chatHead}>
            <div className={styles.chatHeadTitle}>{sessionTitle}</div>
            <div className={styles.chatHeadActions}>
              <Tooltip title="斜杠命令帮助（/help）">
                <Button
                  type="text"
                  size="small"
                  icon={<QuestionCircleOutlined />}
                  onClick={() => void send('/help')}
                />
              </Tooltip>
              <Tooltip title="模型 / 知识库 / 素材生成设置">
                <Button
                  type="text"
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={() => setSettingsOpen(true)}
                />
              </Tooltip>
            </div>
          </div>

          {runtimeError ? (
            <HermesRuntimeInstallAlert
              error={runtimeError}
              onReady={() => { setRuntimeError(null); setReady(null) }}
              onClose={() => setRuntimeError(null)}
            />
          ) : ready === false ? (
            <Alert
              type="warning"
              showIcon
              className={styles.alert}
              message="深瞳机器人未就绪，发送消息将尝试自动启动。"
              description="若启动失败，请到「服务」页检查深瞳机器人服务状态。"
            />
          ) : null}
          {stream.error && (
            <Alert type="error" showIcon className={styles.alert} message={stream.error} closable />
          )}
          <SedimentNotice
            notice={sedimentNotice}
            onUndo={async () => {
              if (!sedimentNotice) return false
              const ok = await undoHermesSediment(sedimentNotice, pipelineDeps)
              if (ok) setSedimentNotice(null)
              return ok
            }}
            onDismiss={() => setSedimentNotice(null)}
          />

          <div className={styles.messages}>
            {loadingHistory ? (
              <div className={styles.loadingCenter}>
                <Spin size="small" /> 加载历史消息...
              </div>
            ) : showEmpty ? (
              <UpstreamChatEmptyState onSelectSuggestion={(text) => void send(text)} />
            ) : (
              <UpstreamMessageList
                messages={upstreamMessages}
                isLoading={sending}
                toolProgress={stream.phase === 'start' ? 'Agent 正在思考…' : stream.phase === 'finishing' ? '正在整理结果…' : null}
                onApprove={() => void sendControl('/approve')}
                onDeny={() => void sendControl('/deny')}
                onClarifyResolved={handleClarifyResolved}
                onClarifyRespond={handleClarifyRespond}
                agentAvatar={{ name: '深瞳机器人' }}
              />
            )}
          </div>

          <div className={styles.inputBar}>
            <UpstreamQueuedMessages
              messages={queue}
              onRemove={(index) => {
                queueRef.current = queueRef.current.filter((_, i) => i !== index)
                setQueue([...queueRef.current])
              }}
            />
            <UpstreamChatInput
              ref={chatInputRef}
              isLoading={sending}
              hasSession={!!activeSessionId}
              sessionId={activeSessionId ? String(activeSessionId) : undefined}
              contextUsage={
                stream.usage?.input != null ? { used: stream.usage.input, window: contextWindow } : null
              }
              onSubmit={(text, atts) => void send(text, atts)}
              onQuickAsk={(text) => void sendBackground(text)}
              onAbort={abort}
              toolbarExtras={
                <>
                  <UpstreamModelPicker
                    active
                    currentModel={selectedModel}
                    currentProvider={(selectedModel.split('/')[0]) || 'custom'}
                    currentBaseUrl=""
                    modelGroups={modelGroups}
                    displayModel={selectedModelLabel}
                    onOpen={() => void loadModels()}
                    onSelectModel={(provider, model, baseUrl) => void handleModelChange(model)}
                  />
                  <UpstreamReasoningEffortPicker value={reasoningEffort} onChange={handleReasoningEffortChange} />
                  <Button size="small" onClick={() => setWebPreviewOpen((v) => !v)}>{webPreviewOpen ? '关闭网页' : '网页预览'}</Button>
                  <UpstreamContextFolderChip
                    contextFolder={contextFolder}
                    show
                    worktreeVisible={worktreeOpen}
                    onPickFolder={() => setFolderPickerOpen(true)}
                    onClearFolder={() => setContextFolder(null)}
                    onToggleWorktree={() => setWorktreeOpen((v) => !v)}
                    onSelectRecentFolder={(path) => setContextFolder(path)}
                  />
                </>
              }
            />
          </div>
        </div>
        {webPreviewOpen && (
          <UpstreamWebPreviewPanel
            initialUrl={webPreviewUrl || 'https://example.com'}
            onClose={() => setWebPreviewOpen(false)}
            onInspectElement={(payload) => void send(`[网页标注] ${payload.selector} ${payload.comment}`)}
          />
        )}
        <UpstreamRemoteFolderPicker
          initialPath={contextFolder}
          open={folderPickerOpen}
          onCancel={() => setFolderPickerOpen(false)}
          onSelect={(path) => { setContextFolder(path); setFolderPickerOpen(false); void (window as any).electronAPI?.fs?.setSessionContextFolder?.(path) }}
        />
        {worktreeOpen && contextFolder && (
          <UpstreamWorktreePanel
            folderPath={contextFolder}
          />
        )}
      </div>
        <ScheduleModal
          open={!!schedulePick}
          prefilled={schedulePick ?? { repeatType: 'once' }}
          onClose={() => setSchedulePick(null)}
          onCreated={(title) => console.log('[HermesChat] 定时任务已创建:', title)}
        />

        <MediaGenerationModal
          open={generationOpen}
          onClose={() => setGenerationOpen(false)}
          defaultType={generationType}
          onComplete={handleGenerationComplete}
        />

        <ConversationSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelId={selectedModel}
          modelOptions={modelOptions}
          customIntegrations={customIntegrations}
          modelLoading={modelLoading}
          agentId={agentId}
          agentOptions={agentOptions}
          agentPriceHint={agentPriceHint}
          knowledgeBaseId={knowledgeBaseId}
          kbOptions={kbOptions}
          onModelChange={(id) => void handleModelChange(id)}
          onRefreshModels={() => void loadModels()}
          onAgentChange={(id) => void handleAgentChange(id)}
          onKnowledgeBaseChange={(id) => void handleKnowledgeBaseChange(id)}
          onOpenGeneration={(type) => { setGenerationType(type); setGenerationOpen(true) }}
        />

        <Modal
          title="人格（官署 Profile）"
          open={personaOpen}
          onCancel={() => setPersonaOpen(false)}
          footer={null}
          width={480}
        >
          <List
            loading={personaLoading}
            dataSource={personaOptions}
            renderItem={(item) => (
              <List.Item
                onClick={() => { setPersonaId(item.id); setPersonaOpen(false) }}
                style={{ cursor: 'pointer' }}
                actions={[
                  <Button key="edit" size="small" type="link" onClick={(e) => { e.stopPropagation(); void openSoulEditor(item.id) }}>编辑 SOUL</Button>,
                  personaId === item.id ? <Tag key="cur" color="success">当前</Tag> : null,
                ]}
              >
                <List.Item.Meta title={item.label} />
              </List.Item>
            )}
          />
          <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
            选择后将注入该官署 SOUL.md 作为深瞳机器人对话人设；留空使用默认人格。
          </div>
        </Modal>

        <Modal
          title="深瞳机器人记忆"
          open={memoryOpen}
          onCancel={() => setMemoryOpen(false)}
          footer={null}
          width={520}
        >
          <Tabs
            activeKey={memoryTab}
            onChange={(k) => {
              if (k === 'providers') { setMemoryTab('providers'); return }
              setMemoryTab(k as 'profile' | 'memory')
              setMemoryTarget(k as 'profile' | 'memory')
            }}
            items={[
              { key: 'profile', label: 'USER.md（用户画像）' },
              { key: 'memory', label: 'MEMORY.md（长期记忆）' },
              { key: 'providers', label: '第三方 Provider' },
            ]}
          />
          {memoryTab === 'providers' ? (
            <MemoryProviderPanel profileId={personaId} />
          ) : (
            <>
              <List
                loading={memoryLoading}
                dataSource={memoryEntries}
                locale={{ emptyText: '暂无记忆条目' }}
                renderItem={(entry) => (
                  <List.Item
                    actions={[
                      <Button key="rm" size="small" type="text" danger onClick={() => void handleRemoveMemory(entry.text)}>删除</Button>,
                    ]}
                  >
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.text}</div>
                  </List.Item>
                )}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Input.TextArea
                  rows={2}
                  value={memoryDraft}
                  onChange={(e) => setMemoryDraft(e.target.value)}
                  placeholder="输入要沉淀到本机深瞳机器人记忆的内容..."
                />
                <Button type="primary" onClick={() => void handleAddMemory()}>添加</Button>
              </div>
            </>
          )}
        </Modal>

        <Modal
          title={"SOUL 人格编辑器 · " + (personaOptions.find((x) => x.id === soulProfileId)?.label || soulProfileId)}
          open={soulOpen}
          onCancel={() => setSoulOpen(false)}
          footer={[
            <Button key="close" onClick={() => setSoulOpen(false)}>关闭</Button>,
          ]}
          width={680}
        >
          <UpstreamSoul profile={soulProfileId} />
        </Modal>

        <HermesTools
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
        />
    </div>
  )
}
