// Hermes 对话（独立入口）：直接与本地 Hermes Agent（:8642）流式对话
// 链路：createHermesChat() → IPC → 主进程 HermesChatService → Hermes /v1/chat/completions
// 计费归引擎层 llm-proxy；消息内容全程本机。复用 Chat 页面消息列表/输入组件，保持视觉一致。
// 阶段 2：对齐会话持久化 + 沉淀提示（SedimentNotice）+ officeBridge 事件流水线。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Select, Space, Spin, Tag, Tooltip, Modal, List, Tabs, Input } from 'antd'
import { RobotOutlined, ArrowLeftOutlined, LoadingOutlined, SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { createHermesChat, type HermesChatHandle } from '@/api/hermes-chat-api'
import { createHermesGatewayHandle, type HermesGatewayHandle } from '@/services/hermes-gateway-client'
import { readLocalPref, writeLocalPref, normalizePersonaId, normalizeMemoryTarget, PERSONA_STORAGE_KEY, MEMORY_TARGET_STORAGE_KEY, REASONING_EFFORT_STORAGE_KEY } from './prefs'
import { MessageList } from '@/pages/Chat/components/MessageList'
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
import { ContextGauge } from './ContextGauge'
import { ReasoningEffortPicker } from './ReasoningEffortPicker'
import HermesTools from './HermesTools'
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

export default function HermesChat() {
  const navigate = useNavigate()
  const [committed, setCommitted] = useState<ChatMessage[]>([])
  const [stream, setStreamState] = useState<StreamState>(EMPTY_STREAM)
  const [sending, setSending] = useState(false)
  const [ready, setReady] = useState<boolean | null>(null)
  const [status, setStatus] = useState<HermesStatusResult | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [sedimentNotice, setSedimentNotice] = useState<SedimentNoticeData | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [sessionTitle, setSessionTitle] = useState('和 Hermes 对话')
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
  const [soulContent, setSoulContent] = useState('')
  const [soulSource, setSoulSource] = useState<'custom' | 'blueprint' | ''>('')
  const [soulLoading, setSoulLoading] = useState(false)
  const [soulSaving, setSoulSaving] = useState(false)

  const handleRef = useRef<HermesChatHandle | null>(null)
  const streamRef = useRef<StreamState>(EMPTY_STREAM)
  const finalizedRef = useRef(false)
  const idRef = useRef(0)
  // 阶段 2：会话持久化 + 沉淀 + Office 事件所需的近一轮快照
  const sessionIdRef = useRef<number | null>(null)
  const abortedRef = useRef(false)
  const replyGeneratedRef = useRef(false)
  const lastUserMessageRef = useRef('')
  const lastHistoryRef = useRef<string[]>([])
  const lastKbRef = useRef<number | undefined>(undefined)
  const lastModelRef = useRef<string | undefined>(undefined)
  const localMsgIdsRef = useRef<Set<number>>(new Set())

  const setStream = useCallback((updater: (s: StreamState) => StreamState) => {
    streamRef.current = updater(streamRef.current)
    setStreamState(streamRef.current)
  }, [])

  /** 选择会话 → 加载历史 + 设置当前会话/模型 */
  const handleSelectSession = useCallback(async (next: ChatSession | null) => {
    if (!next) {
      setActiveSessionId(null)
      sessionIdRef.current = null
      setCommitted([])
      setStreamState(EMPTY_STREAM)
      finalizedRef.current = false
      abortedRef.current = false
      localMsgIdsRef.current.clear()
      setSessionTitle('和 Hermes 对话')
      return
    }
    setActiveSessionId(next.id)
    sessionIdRef.current = next.id
    setSelectedModel(next.modelId)
    setKnowledgeBaseId(next.knowledgeBaseId)
    setAgentId(next.agentId)
    setSessionTitle(next.title || '和 Hermes 对话')
    localMsgIdsRef.current.clear()
    setLoadingHistory(true)
    try {
      const res = await chatApi.listMessages(next.id, { page: 1, pageSize: 100 })
      setCommitted((res.list || []).filter((m) => m.role !== 'system'))
    } catch (err) {
      console.warn('[HermesChat] 加载会话消息失败:', err)
      setCommitted([])
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
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
        sessionIdRef.current = null
        setActiveSessionId(null)
        setSessionTitle('和 Hermes 对话')
        setRefreshTrigger((t) => t + 1)
        break
      case 'clear':
        setCommitted([])
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
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
        appendLocalMessage('⚙️ Hermes 版本：' + v)
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
        appendLocalMessage('⚙️ Hermes 状态：' + (ready === null ? '检测中' : ready ? '运行中' : '未启动') + (status?.status?.version ? ' · 版本 ' + status.status.version : '') + '。')
        break
      case 'debug': {
        const tokenTotal = committed.reduce((n, m) => n + (m.tokenUsage?.totalTokens || ((m.tokenUsage?.promptTokens || 0) + (m.tokenUsage?.completionTokens || 0))), 0)
        const personaName = personaOptions.find((x) => x.id === personaId)?.label ?? '未设置'
        appendLocalMessage([
          '⚙️ Hermes 调试信息：',
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
        streamRef.current = EMPTY_STREAM
        setStreamState(EMPTY_STREAM)
        finalizedRef.current = false
        abortedRef.current = false
        replyGeneratedRef.current = false
        localMsgIdsRef.current.clear()
        appendLocalMessage('⚙️ 已重置上下文。')
        break
      case 'reload-skills':
        void window.electronAPI?.hermesSkills?.check?.().then((r) => {
          appendLocalMessage(r?.ok ? '⚙️ 技能目录已刷新。' : '⚙️ 技能刷新失败：' + (r?.error || '未知错误'))
        })
        break
      case 'curator':
        appendLocalMessage('⚙️ Curator（技能使用排序）状态：待 Hermes 网关返回 usage-rank 数据。')
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
    gatewayRef.current = createHermesGatewayHandle({ wsUrl: () => window.electronAPI?.hermesGateway?.getUrl() ?? Promise.resolve({ error: 'gateway api 不可用' }) })
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
      appendLocalMessage('⚙️ 该命令（/' + parsed.name + '）需 Hermes gateway，当前未连接。请在「服务」页确认 Hermes 运行后再试。')
      return
    }
    appendLocalMessage('⚙️ 正在通过 Hermes gateway 执行 /' + parsed.name + ' ...')
    const r = await gateway!.request('slash.exec', { command: parsed.raw })
    if (r.ok) {
      const out = typeof r.result === 'string' ? r.result : r.result == null ? '(无返回)' : JSON.stringify(r.result)
      appendLocalMessage('⚙️ /' + parsed.name + ' 完成：' + out)
    } else {
      appendLocalMessage('⚙️ /' + parsed.name + ' 执行失败：' + (r.error || '未知错误'))
    }
  }, [ensureGateway, appendLocalMessage, gateway])

  useEffect(() => {
    void ensureGateway()
    const t = window.setInterval(() => void ensureGateway(), 6000)
    return () => window.clearInterval(t)
  }, [ensureGateway])

  /** 打开 SOUL 编辑器（读覆盖/蓝本） */
  const openSoulEditor = useCallback(async (profileId: string) => {
    setSoulProfileId(profileId)
    setSoulOpen(true)
    setSoulLoading(true)
    setSoulSource('')
    try {
      const r = await window.electronAPI?.hermesSoul?.get(profileId)
      if (r?.ok) { setSoulContent(r.content || ''); setSoulSource(r.source || '') }
      else { setSoulContent(''); setSoulSource('') }
    } catch { setSoulContent(''); setSoulSource('') }
    finally { setSoulLoading(false) }
  }, [])

  const saveSoul = useCallback(async () => {
    const api = window.electronAPI?.hermesSoul
    if (!api || !soulProfileId) return
    setSoulSaving(true)
    try {
      const r = await api.save(soulProfileId, soulContent)
      if (r.ok) { setSoulOpen(false); appendLocalMessage('⚙️ 已保存 ' + soulProfileId + ' 的 SOUL 人设。') }
      else appendLocalMessage('⚙️ 保存 SOUL 失败：' + (r.error || '未知错误'))
    } catch (err) {
      appendLocalMessage('⚙️ 保存 SOUL 失败：' + (err instanceof Error ? err.message : String(err)))
    } finally { setSoulSaving(false) }
  }, [soulProfileId, soulContent, appendLocalMessage])

  const commit = useCallback((statusOk: 'done' | 'error') => {
    if (finalizedRef.current) return
    finalizedRef.current = true
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
  }, [modelOptions, selectedModel])

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

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending || !handle) return
      const parsedSlash = parseSlashCommand(text)
      if (parsedSlash) {
        if (parsedSlash.name === 'retry') {
          const lastUser = [...committed].reverse().find((m) => m.role === 'user' && !localMsgIdsRef.current.has(m.id))
          if (!lastUser) {
            appendLocalMessage('⚙️ 没有可重发的用户消息。')
            return
          }
          text = lastUser.content
        } else if (LOCAL_COMMAND_NAMES.has(parsedSlash.name)) {
          handleLocalSlashCommand(parsedSlash)
          return
        } else if (AGENT_ONLY_COMMAND_NAMES.has(parsedSlash.name)) {
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
          setSessionTitle(text.slice(0, 50) || '和 Hermes 对话')
          setRefreshTrigger((t) => t + 1)
        }
      }

      const history = committed
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && !localMsgIdsRef.current.has(m.id))
        .map((m): { role: 'user' | 'assistant'; content: string } => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      try {
        await handle.send(text, history, knowledgeBaseId, sessionId, selectedModel, personaId || undefined, undefined, reasoningEffort)
      } catch {
        // 错误已由 onError 提交；此处兜底，避免流式残留
        if (!abortedRef.current) commit('error')
      } finally {
        setSending(false)
      }
    },
    [committed, sending, handle, commit, selectedModel, handleLocalSlashCommand, appendLocalMessage, personaId, runAgentGatewayCommand],
  )

  const abort = useCallback(() => {
    abortedRef.current = true
    handle?.abort()
    setSending(false)
  }, [handle])

  const statusLabel = ready === null ? '检测中' : ready ? '运行中' : '未启动'
  const statusColor = ready === null ? 'default' : ready ? 'success' : 'error'

  const showEmpty = !loadingHistory && committed.length === 0 && !sending && !stream.content && !stream.error

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/chat')} />
        <div className={styles.titleWrap}>
          <RobotOutlined className={styles.titleIcon} />
          <span className={styles.title}>Hermes 对话</span>
        </div>
        <Space size="small" wrap>
          <Tooltip title="本地 Hermes Agent 健康状态（:8642）">
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
              <Select
                className={styles.modelSelect}
                size="small"
                value={selectedModel}
                onChange={handleModelChange}
                popupMatchSelectWidth={false}
                options={modelOptions.map((m) => ({ value: m.id, label: m.name || m.id }))}
                style={{ minWidth: 150 }}
              />
              {stream.usage?.input != null && <ContextGauge model={selectedModel} used={stream.usage.input} />}
              <ReasoningEffortPicker value={reasoningEffort} onChange={handleReasoningEffortChange} />
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
              message="本地 Hermes Agent 未就绪，发送消息将尝试自动启动。"
              description="若启动失败，请到「服务」页检查 Hermes 服务状态。"
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
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIconWrap}>
                  <RobotOutlined className={styles.emptyStateIcon} />
                </div>
                <div className={styles.emptyStateTitle}>和 Hermes 对话</div>
                <div className={styles.emptyStateTip}>
                  对话由本地 Hermes Agent（:8642）驱动，经 llm-proxy 计费，消息内容全程本机。可自动调用工具与记忆帮你完成复杂任务。选择左侧对话开始聊天，或点击「新建对话」。输入 /help 查看可用斜杠命令。
                </div>
              </div>
            ) : (
              <MessageList
                messages={committed}
                streamingContent={stream.content}
                streaming={sending}
                streamingToolCalls={stream.toolCalls}
                agentPhase={stream.phase === 'idle' ? 'idle' : (stream.phase as 'start' | 'finishing' | 'end' | 'error')}
              />
            )}
          </div>

          <div className={styles.inputBar}>
            {sending ? (
              <div className={styles.abortRow}>
                <LoadingOutlined /> Hermes 正在生成...
                <Button size="small" danger onClick={abort}>中断</Button>
              </div>
            ) : null}
            <MessageInput
              onSend={(content) => void send(content)}
              sending={sending}
              onAbort={abort}
              onOpenGeneration={(type) => { setGenerationType(type); setGenerationOpen(true) }}
              placeholder="和 Hermes 聊天，Enter 发送，Shift+Enter 换行..."
            />
          </div>
        </div>
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
            选择后将注入该官署 SOUL.md 作为 Hermes 对话人设；留空使用默认人格。
          </div>
        </Modal>

        <Modal
          title="Hermes 记忆"
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
                  placeholder="输入要沉淀到本机 Hermes 记忆的内容..."
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
            <Button key="cancel" onClick={() => setSoulOpen(false)}>取消</Button>,
            <Button key="save" type="primary" loading={soulSaving} onClick={() => void saveSoul()}>保存</Button>,
          ]}
          width={560}
        >
          {soulLoading ? <Spin /> : (
            <>
              <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                {soulSource === 'custom' ? '当前使用自定义 SOUL（已覆盖蓝本）。' : soulSource === 'blueprint' ? '当前为蓝本人设，保存后将作为自定义覆盖。' : ''}
              </div>
              <Input.TextArea
                rows={14}
                value={soulContent}
                onChange={(e) => setSoulContent(e.target.value)}
                style={{ fontFamily: 'monospace' }}
              />
            </>
          )}
        </Modal>

        <HermesTools
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
        />
    </div>
  )
}
