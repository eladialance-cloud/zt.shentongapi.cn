// 对话页面（核心）
// 布局：左侧会话列表 + 中间消息区（需求模式：自由对话 / 老板模式 / 客户会议模式）
// 需求对话重构（Task 3）：页面只保留 4 块 —— 会话列表 / 需求模式 / 历史简报 / 对话设置
// 原有对话能力全部保留：模型选择 / Agent / 知识库 / 素材生成 / 工具调用收进「对话设置」抽屉

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, Radio, Select, Tooltip, message } from 'antd'
import {
  HistoryOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { SessionList } from './components/SessionList'
import { MessageList } from './components/MessageList'
import { MessageInput } from './components/MessageInput'
import { MediaGenerationModal } from './components/MediaGenerationModal'
import { DemandModeBar, DemandWizard } from './DemandMode'
import { DemandTemplateEditor } from './DemandTemplateEditor'
import { ConversationSettings } from './ConversationSettings'
import { HistoryBriefs } from './HistoryBriefs'
import {
  buildBriefPayload,
  briefToAnswers,
  isWizardMode,
} from './demand-schema'
import type { DemandAnswers, DemandMode } from './demand-schema'
import type { MediaJob } from '@/api/media-generation-api'
import * as chatApi from '@/api/chat-api'
import { createBriefWithOfflineFallback } from '@/api/brief-offline'
import { confirmBrief, getBrief } from '@/api/brief-api'
import * as teamApi from '@/api/team-api'
import type { Team } from '@/types/team'
import type { BriefItem } from '@/api/brief-api'
import ScheduleModal from './ScheduleModal'
import { detectScheduleIntent, type ScheduleIntent } from './schedule-intent'
import { useAuthStore } from '@/store'
import type { OpenClawChatMessage } from '@shared/types'
import {
  subscribeChatStream,
  getChatStreamSnapshot,
  startChatSend,
  abortChatSend,
  loadChatDraft,
  clearChatDraft,
  consumePendingVideos,
  consumePendingCompletions,
  undoSedimentNotice,
  dismissSedimentNotice,
} from '@/store/chat-stream'
import SedimentNotice from '@/components/SedimentNotice'
import { listMarketAgents } from '@/api/agent-api'
import { listLlmIntegrations } from '@/api/llm-integrations-api'
import type { LlmIntegration } from '@shared/types'
import { listKnowledgeBases, listOfficialKnowledgeBases } from '@/api/knowledge-api'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import type {
  ChatSession,
  ChatMessage,
  UploadResult,
  ModelOption,
  AgentOption,
  KnowledgeBaseOption,
} from '@/types/chat'
import type { Agent } from '@/types/agent'
import styles from './styles.module.css'

/** 当前会话本地记忆 Key：切页/切窗口后回到对话页自动恢复上次会话 */
const CHAT_ACTIVE_SESSION_KEY = 'chat:active-session'

/** 确认简报后轮询 AI 拆解状态：3s 一次，最多 6 次（与需求单详情页一致） */
const DISPATCH_POLL_INTERVAL_MS = 3000
const DISPATCH_POLL_MAX_ATTEMPTS = 6

/** 确认后轮询拆解状态直至非 pending；查询失败不抛出，全部失败返回 null（由调用方降级提示） */
async function waitDispatchResult(
  briefId: number,
  maxAttempts = DISPATCH_POLL_MAX_ATTEMPTS,
): Promise<BriefItem | null> {
  let latest: BriefItem | null = null
  for (let i = 0; i < maxAttempts; i++) {
    try {
      latest = await getBrief(briefId)
      if (latest.dispatchStatus !== 'pending') return latest
    } catch {
      // 单次查询失败继续下一轮
    }
    await new Promise((r) => setTimeout(r, DISPATCH_POLL_INTERVAL_MS))
  }
  return latest
}

export default function Chat() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)

  // ===== 需求模式（自由对话默认 / 老板模式 / 客户会议模式） =====
  const [demandMode, setDemandMode] = useState<DemandMode>('free')
  const [historyPrefill, setHistoryPrefill] = useState<DemandAnswers | null>(null)
  const [historyPrefillTitle, setHistoryPrefillTitle] = useState<string | null>(null)
  const [wizardSeq, setWizardSeq] = useState(0)
  const [briefPublishing, setBriefPublishing] = useState(false)
  /** 发布简报前选择执行方式（team=指定团队 / auto=Hermes自动匹配 / agent=指定单个Agent） */
  const [teamPick, setTeamPick] = useState<{ briefId: number; title: string } | null>(null)
  const [teamPickMode, setTeamPickMode] = useState<'team' | 'auto' | 'agent'>('team')
  const [teamPickValue, setTeamPickValue] = useState<number | undefined>(undefined)
  const [teamOptions, setTeamOptions] = useState<Team[]>([])
  const [teamPickAgentId, setTeamPickAgentId] = useState<number | undefined>(undefined)
  /** 对话中识别到的定时任务意图 */
  const [schedulePick, setSchedulePick] = useState<ScheduleIntent | null>(null)

  // ===== 对话设置抽屉 / 历史简报 Modal =====
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateVersion, setTemplateVersion] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)

  // ===== 当前会话与消息 =====
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // ===== 文生图/文生视频弹窗 =====
  const [generationOpen, setGenerationOpen] = useState(false)
  const [generationType, setGenerationType] = useState<'image' | 'video'>('image')

  // ===== 流式状态（全局对话流桥：切页不丢、完成后自动落库、视频任务实时进度） =====
  const chatStream = useSyncExternalStore(subscribeChatStream, getChatStreamSnapshot)
  const streaming = chatStream.streaming
  const streamingContent = chatStream.content
  const streamingToolCalls = chatStream.toolCalls
  const agentPhase = chatStream.phase as 'idle' | 'start' | 'finishing' | 'end' | 'error'
  const knowledgeBaseIdRef = useRef<number | undefined>(undefined)
  const activeSessionIdRef = useRef<number | null>(null)
  const lastCompletionTickRef = useRef(0)
  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null
  }, [activeSession])

  // ===== 顶部选择器（收进对话设置抽屉后状态仍保留在页面） =====
  const [modelId, setModelId] = useState<string>('')
  const [agentId, setAgentId] = useState<number | undefined>(undefined)
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined)
  useEffect(() => {
    knowledgeBaseIdRef.current = knowledgeBaseId
  }, [knowledgeBaseId])

  // ===== 选项数据 =====
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [customIntegrations, setCustomIntegrations] = useState<LlmIntegration[]>([])
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentPriceMap, setAgentPriceMap] = useState<Record<number, Agent>>({})
  const [kbOptions, setKbOptions] = useState<KnowledgeBaseOption[]>([])

  /** 流式事件由全局对话流桥（store/chat-stream）常驻监听：切页不丢、完成后自动落库。 */

  /** 加载市场 Agent 列表（用于 Agent 选择器 + 价格提示） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await listMarketAgents({ pageSize: 100 })
        if (cancelled) return
        const list = result.list || []
        setAgentOptions(
          list.map((a) => ({
            id: a.id,
            name: a.name,
            avatar: a.avatar,
            description: a.description,
          })),
        )
        const priceMap: Record<number, Agent> = {}
        list.forEach((a) => {
          priceMap[a.id] = a
        })
        setAgentPriceMap(priceMap)
      } catch (err) {
        console.error('[Chat] load agents failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 加载我的知识库 + 官方知识库（知识库挂载选择器用） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [mine, official] = await Promise.all([
          listKnowledgeBases(),
          listOfficialKnowledgeBases({ page: 1, pageSize: 50 }),
        ])
        if (cancelled) return
        const options: KnowledgeBaseOption[] = [
          ...(mine || []).map((k) => ({
            id: k.id,
            name: k.name,
            description: k.description,
          })),
          ...(official?.list || []).map((k) => ({
            id: k.id,
            name: k.industryName ? k.name + ' · ' + k.industryName : k.name,
            description: k.description || '官方知识库',
          })),
        ]
        setKbOptions(options)
      } catch (err) {
        console.error('[Chat] load kb options failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 加载可选模型列表（管理后台上线的启用模型 + 本机自定义大模型） */
  const loadModels = useCallback(async () => {
    setModelLoading(true)
    try {
      const [listResult, customResult] = await Promise.allSettled([
        chatApi.listChatModels(),
        listLlmIntegrations(),
      ])
      if (listResult.status === 'rejected') {
        console.error('[Chat] load backend models failed:', listResult.reason)
      }
      if (customResult.status === 'rejected') {
        console.error('[Chat] load custom integrations failed:', customResult.reason)
      }
      const list = listResult.status === 'fulfilled' && Array.isArray(listResult.value) ? listResult.value : []
      const custom = customResult.status === 'fulfilled' && Array.isArray(customResult.value) ? customResult.value : []
      setModelOptions(list)
      setCustomIntegrations(custom)
      const all = [
        ...(list || []).map((m) => m.id),
        ...(custom || []).flatMap((c) =>
          (c.models || []).map((m) => 'custom/' + c.id + '/' + m.id),
        ),
      ]
      setModelId((prev) => (prev && all.includes(prev) ? prev : all[0] || ''))
    } catch (err) {
      console.error('[Chat] load models failed:', err)
    } finally {
      setModelLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  /** 首选模型同步：当前选择的模型始终作为云端默认对话模型（llm-proxy 解析 OpenClaw 内部模型名时使用）
   * 覆盖首次自动选中、切换会话恢复等未触发 handleModelChange 的场景 */
  useEffect(() => {
    if (!modelId || modelId.startsWith('custom/')) return
    let cancelled = false
    chatApi.setPreferredChatModel(modelId).catch((err) => {
      if (!cancelled) console.error('[Chat] sync preferred model failed:', err)
    })
    // 本地 OpenClaw 新会话默认模型同步（sessions.patch 处理当前会话，这里保证新会话也生效）
    try {
      window.electronAPI?.openclawChat?.setModel(modelId)
    } catch (err) {
      console.error('[Chat] sync local openclaw model failed:', err)
    }
    return () => {
      cancelled = true
    }
  }, [modelId])

  // 窗口重新聚焦时刷新一次模型列表（管理后台新增/上下架模型后无需重启桌面端）
  useEffect(() => {
    const onFocus = () => {
      void loadModels()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadModels])

  /** 挂载恢复：回到对话页自动恢复上次会话 + 草稿/视频完成消费 */
  useEffect(() => {
    // 恢复上次会话（切页不丢）
    try {
      const raw = localStorage.getItem(CHAT_ACTIVE_SESSION_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as ChatSession
        if (saved && saved.id) {
          void handleSelectSession(saved)
        }
      }
    } catch {
      /* 忽略 */
    }

    // 草稿恢复（崩溃/刷新兜底）：上次流式未完成的会话提示用户
    const draft = loadChatDraft()
    if (draft && draft.sessionId) {
      const rawSession = localStorage.getItem(CHAT_ACTIVE_SESSION_KEY)
      let sid: number | null = null
      try {
        sid = rawSession ? (JSON.parse(rawSession) as ChatSession).id : null
      } catch {
        sid = null
      }
      if (sid === draft.sessionId || sid == null) {
        message.info('检测到上次未完成的回复，内容已保留', 3)
      }
      clearChatDraft()
    }

    // 消费视频完成队列：把 ST-Claw 成片插入消息区（仅当前会话）
    const timer = setInterval(() => {
      const pending = consumePendingVideos()
      if (pending.length === 0) return
      const sid = activeSessionIdRef.current
      if (sid == null) return
      setMessages((prev) => {
        let next = prev
        for (const item of pending) {
          const assistantMsg: ChatMessage = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            sessionId: sid,
            userId: 0,
            role: 'assistant',
            content: '🎬 视频生成完成\n' + item.url,
            status: 'done',
            createdAt: new Date(),
          }
          next = [...next, assistantMsg]
          persistMessage(sid, assistantMsg)
        }
        return next
      })
    }, 2000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 完成回填：全局桥 done/error 固化后把助手回复追加进消息区（完成后不消失） */
  const completionTick = chatStream.completionTick
  useEffect(() => {
    if (completionTick === lastCompletionTickRef.current) return
    lastCompletionTickRef.current = completionTick
    const items = consumePendingCompletions()
    if (items.length === 0) return
    const sid = activeSessionIdRef.current
    if (sid == null) return
    for (const item of items) {
      if (item.sessionId !== sid) continue
      const assistantMsg: ChatMessage = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        sessionId: sid,
        userId: 0,
        role: 'assistant',
        content: item.content,
        toolCalls: item.toolCalls,
        status: item.status,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    }
  }, [completionTick])

  /** 切换会话 */
  const handleSelectSession = useCallback(async (session: ChatSession | null) => {
    if (!session) {
      setActiveSession(null)
      setMessages([])
      return
    }
    setActiveSession(session)
    setModelId(session.modelId || '')
    setAgentId(session.agentId)
    setKnowledgeBaseId(session.knowledgeBaseId)
    localStorage.setItem(CHAT_ACTIVE_SESSION_KEY, JSON.stringify(session))
    // 加载历史消息
    try {
      const result = await chatApi.listMessages(session.id, { pageSize: 100 })
      setMessages(result.list || [])
    } catch (err) {
      console.error('[Chat] load messages failed:', err)
      setMessages([])
      message.error('加载历史消息失败')
    }
  }, [])

  /** 发送消息（OpenClaw 本地直达：云端预扣 → 本地 OpenClaw 流式 → 云端结算） */
  const handleSend = useCallback(
    async (content: string, attachments: UploadResult[]) => {
      const session = activeSession
      if (!session) {
        message.warning('请先选择或创建一个对话')
        return
      }
      if (!content.trim() && attachments.length === 0) return

      // 1. 立即追加用户消息到列表
      const userMsg: ChatMessage = {
        id: Date.now(),
        sessionId: session.id,
        userId: 0,
        role: 'user',
        content,
        status: 'sent',
        attachments: attachments.map((a) => ({
          fileId: a.fileId,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          url: a.url,
        })),
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])

      // 持久化用户消息到云端（切换会话/重启后历史仍可恢复）
      void chatApi
        .saveMessage(session.id, {
          role: 'user',
          content,
          attachments: userMsg.attachments,
        })
        .catch((err) => console.error('[Chat] persist user message failed:', err))

      // 标题仍为默认值时，用首条消息前 24 字更新（便于会话列表识别）
      if (session.title === '新对话') {
        const title = content.trim().slice(0, 24) || '新对话'
        void chatApi
          .updateSession(session.id, { title })
          .then(() => {
            const updated = { ...session, title }
            setActiveSession(updated)
            localStorage.setItem(CHAT_ACTIVE_SESSION_KEY, JSON.stringify(updated))
          })
          .catch((err) => console.error('[Chat] update session title failed:', err))
      }

      // officeBridge: 用户发送消息 → 主管深度工作
      officeBridge.onChatMessageSent()

      // 2. 最近上下文（最近 10 条文本消息，消息不出本机）
      const history: OpenClawChatMessage[] = messages
        .filter(
          (m) =>
            m.content &&
            (m.role === 'user' || m.role === 'assistant'),
        )
        .slice(-10)
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }))

      // 3. 交给全局对话流桥发送（IPC 常驻：切页后回复仍会完成并落库；视频任务自动拉起 ST-Claw 并实时回传进度）
      await startChatSend({
        sessionId: session.id,
        content,
        history,
        knowledgeBaseId: knowledgeBaseIdRef.current,
        modelId: modelId || undefined,
      })

      // 自由对话：识别定时任务意图 → 弹窗确认创建（不阻断回复流）
      const intent = detectScheduleIntent(content)
      if (intent) setSchedulePick(intent)
    },
    [activeSession, messages, modelId],
  )

  /** 持久化消息到云端（切换会话/重启后历史仍可恢复） */
  const persistMessage = useCallback((sessionId: number, msg: ChatMessage) => {
    void chatApi
      .saveMessage(sessionId, {
        role: msg.role,
        content: msg.content,
        attachments: msg.attachments,
        toolCalls: msg.toolCalls,
        creditsCost: msg.creditsCost,
      })
      .catch((err) => console.error('[Chat] persist message failed:', err))
  }, [])

  /** 生成完成：以助手媒体消息插入会话（含缩略图/播放器/积分消耗） */
  const handleGenerationComplete = useCallback(
    (job: MediaJob) => {
      const promptText = job.prompt || ''
      const firstUrl = job.resultUrls?.[0] || ''
      const typeLabel = job.type === 'image' ? '文生图' : '文生视频'
      let mediaMarkdown = ''
      if (firstUrl) {
        mediaMarkdown = job.type === 'image'
          ? '![' + promptText + '](' + firstUrl + ')'
          : firstUrl
      }
      const costText = job.creditsCost > 0 ? '（已扣除 ' + job.creditsCost + ' 积分）' : ''
      const assistantMsg: ChatMessage = {
        id: Date.now() + 2,
        sessionId: activeSession?.id ?? 0,
        userId: 0,
        role: 'assistant',
        content: ('✨ ' + typeLabel + '完成' + costText + '\n' + (promptText ? '提示词：' + promptText + '\n' : '') + mediaMarkdown).replace(/\n$/, ''),
        status: 'done',
        creditsCost: job.creditsCost,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (activeSession?.id) persistMessage(activeSession.id, assistantMsg)
      setGenerationOpen(false)
    },
    [activeSession],
  )

  /** 中断 OpenClaw 对话（本地 abort → 云端退款 → done 事件固化消息） */
  const handleAbort = useCallback(() => {
    abortChatSend()
  }, [])

  /** 修改模型时同步到会话 + 云端用户默认模型（OpenClaw llm-proxy 解析用） */
  const handleModelChange = async (newModelId: string) => {
    setModelId(newModelId)
    if (activeSession && activeSession.modelId !== newModelId) {
      try {
        // 自定义模型标识仅本机有效，不写入云端会话（避免其它机器拿到失效的 custom/xxx）
        if (!newModelId.startsWith('custom/')) {
          await chatApi.updateSession(activeSession.id, { modelId: newModelId })
        }
        setActiveSession({ ...activeSession, modelId: newModelId })
      } catch (err) {
        console.error('[Chat] update model failed:', err)
      }
    }
    // 自定义模型仅本机使用，不写入云端默认模型
    if (!newModelId.startsWith('custom/')) {
      try {
        await chatApi.setPreferredChatModel(newModelId)
      } catch (err) {
        console.error('[Chat] set preferred model failed:', err)
      }
      // 本地 OpenClaw 新会话默认模型同步
      try {
        window.electronAPI?.openclawChat?.setModel(newModelId)
      } catch (err) {
        console.error('[Chat] sync local openclaw model failed:', err)
      }
    }
  }

  /** 修改知识库时同步到会话 */
  const handleKnowledgeBaseChange = async (newKbId?: number) => {
    setKnowledgeBaseId(newKbId)
    if (activeSession && activeSession.knowledgeBaseId !== newKbId) {
      try {
        await chatApi.updateSession(activeSession.id, { knowledgeBaseId: newKbId })
        setActiveSession({ ...activeSession, knowledgeBaseId: newKbId })
      } catch (err) {
        console.error('[Chat] update knowledge base failed:', err)
      }
    }
  }

  /** 当前选中的 Agent（用于价格提示） */
  const selectedAgent = agentId != null ? agentPriceMap[agentId] : undefined

  /** Agent 价格提示文案 */
  const agentPriceHint = useMemo(() => {
    if (!selectedAgent) return ''
    const parts: string[] = []
    if (selectedAgent.pricePerCall > 0) {
      parts.push(selectedAgent.pricePerCall + ' 积分/次')
    }
    if (
      selectedAgent.pricePerToken.input > 0 ||
      selectedAgent.pricePerToken.output > 0
    ) {
      parts.push('Token 费用')
    }
    if (parts.length === 0) return '免费'
    return parts.join(' + ')
  }, [selectedAgent])

  /** 模式切换：自由对话/老板/客户，清空历史预填避免串数据 */
  const handleModeChange = (mode: DemandMode) => {
    setDemandMode(mode)
    setHistoryPrefill(null)
    setHistoryPrefillTitle(null)
    setWizardSeq((n) => n + 1)
  }

  /** 使用历史简报：关闭 Modal，向导以简报内容预填，只问差异点 */
  const handleUseHistoryBrief = (brief: BriefItem) => {
    setHistoryOpen(false)
    const targetMode: 'boss' | 'client' = demandMode === 'free' ? 'boss' : demandMode
    setDemandMode(targetMode)
    setHistoryPrefill(briefToAnswers(targetMode, brief))
    setHistoryPrefillTitle(brief.title)
    setWizardSeq((n) => n + 1)
  }

  /** 确认简报 + 轮询拆解结果 + 成功弹窗（直接确认与选团队两条路径共用） */
  const confirmAndFinish = useCallback(
    async (
      briefId: number,
      title: string,
      opts?: { teamId?: number; executeMode?: 'team' | 'auto' | 'agent'; agentId?: number },
    ) => {
      let confirmed = false
      try {
        await confirmBrief(briefId, {
          ...(opts?.teamId != null ? { teamId: opts.teamId } : {}),
          executeMode: opts?.executeMode ?? 'team',
          ...(opts?.agentId != null ? { agentId: opts.agentId } : {}),
        })
        confirmed = true
      } catch (err) {
        console.error('[Chat] confirm brief failed:', err)
      }
      if (confirmed) {
        // 拆解为后台异步派发：轮询直到 done/failed，避免跳转任务中心后无任务可开始
        const latest = await waitDispatchResult(briefId)
        if (!latest) {
          message.info('简报已发布，AI 拆解结果暂时无法获取，可稍后到任务中心查看', 4)
        } else if (latest.dispatchStatus === 'done') {
          Modal.confirm({
            title: '✅ 简报已发布',
            content: '「' + title + '」已创建并确认，AI 已拆解任务，可在任务中心开始执行。',
            okText: '去任务中心',
            cancelText: '继续对话',
            onOk: () => navigate('/task-center'),
          })
        } else if (latest.dispatchStatus === 'failed') {
          message.warning('简报已发布，但 AI 拆解失败，请到「需求单详情」查看并手动派活', 6)
        } else {
          message.info('简报已发布，AI 拆解仍在进行中，可稍后到任务中心查看', 4)
        }
      } else {
        message.warning('简报已创建，但确认失败，请稍后在任务中心重试')
      }
    },
    [navigate],
  )

  /** 团队选择确认：携带所选 teamId 确认派发 */
  const handleTeamPickOk = async () => {
    if (!teamPick) return
    const { briefId, title } = teamPick
    setTeamPick(null)
    setBriefPublishing(true)
    try {
      await confirmAndFinish(briefId, title, {
        executeMode: teamPickMode,
        teamId: teamPickMode === 'team' ? teamPickValue : undefined,
        agentId: teamPickMode === 'agent' ? teamPickAgentId : undefined,
      })
    } finally {
      setBriefPublishing(false)
    }
  }

  /** 发布简报：云端创建 + 确认；失败走三期本地兜底（本地保存 + 离线队列）；停留对话页 */
  const handlePublishBrief = useCallback(
    async (answers: DemandAnswers) => {
      if (!userId) {
        message.warning('请先登录后再发布简报')
        return
      }
      if (!isWizardMode(demandMode)) return
      setBriefPublishing(true)
      try {
        const payload = buildBriefPayload(demandMode, answers, {
          sourceChatSessionId: activeSession?.id ?? null,
          sourceChatSummary: activeSession?.title ?? null,
        })
        const created = await createBriefWithOfflineFallback({ userId, payload })
        if (created.source === 'local') {
          message.success('网络不可用，已保存到本地，联网后自动同步', 4)
          return
        }
        // 有团队 → 先选执行团队再确认派发；无团队 → 直接确认
        let teams: Team[] = []
        try {
          teams = await teamApi.listTeams()
        } catch {
          teams = []
        }
        setTeamOptions(teams)
        if (teams.length > 0) {
          setTeamPickValue(teams[0].id)
        } else {
          setTeamPickValue(undefined)
        }
        // 无论有没有团队都弹窗：可选 指定团队 / Hermes 自动匹配 / 指定单个 Agent
        setTeamPickMode(teams.length > 0 ? 'team' : 'auto')
        setTeamPickAgentId(undefined)
        setTeamPick({ briefId: created.brief.id, title: payload.title })
      } catch (err) {
        console.error('[Chat] publish brief failed:', err)
        message.error('发布简报失败：' + (err as Error).message)
      } finally {
        setBriefPublishing(false)
      }
    },
    [userId, demandMode, activeSession, navigate, confirmAndFinish],
  )

  return (
    <div className={styles.chatContainer}>
      {/* ① 左侧会话列表（沿用现有 SessionList） */}
      <SessionList
        activeSessionId={activeSession?.id ?? null}
        defaultModelId={modelId}
        defaultAgentId={agentId}
        onSelectSession={handleSelectSession}
      />

      {/* 中间消息区 */}
      <div className={styles.messageArea}>
        {/* 顶部头部：会话标题 + 历史简报 / 对话设置（上端入口） */}
        <div className={styles.chatHead}>
          <div className={styles.chatHeadTitle}>
            {activeSession?.title || '和 OpenClaw 对话'}
          </div>
          <div className={styles.chatHeadActions}>
            <Tooltip title="历史简报（调取过往需求，一键带入向导）">
              <Button
                type="text"
                size="small"
                icon={<HistoryOutlined />}
                onClick={() => setHistoryOpen(true)}
              >
                历史简报
              </Button>
            </Tooltip>
            <Tooltip title="模型 / Agent / 知识库 / 素材生成设置">
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
              >
                对话设置
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* ② 需求模式切换 */}
        <DemandModeBar mode={demandMode} onChange={handleModeChange} />

        {/* ③ 自由对话：原有消息区 + 输入（流式 / 素材生成 / 工具调用能力保留） */}
        {demandMode === 'free' ? (
          <>
            {activeSession ? (
              <MessageList
                messages={messages}
                streaming={streaming}
                streamingContent={streamingContent}
                streamingToolCalls={streamingToolCalls}
                agentPhase={agentPhase}
              />
            ) : (
              <div className={styles.messageListContainer}>
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIconWrap}>
                    <RobotOutlined className={styles.emptyStateIcon} />
                  </div>
                  <div className={styles.emptyStateTitle}>和 OpenClaw 对话</div>
                  <div className={styles.emptyStateTip}>
                    对话由本地 OpenClaw 驱动，可自动调用 Hermes / N8N / MCP 帮你完成复杂任务。选择左侧对话开始聊天，或点击「新建对话」。也可以切换到老板模式 / 客户会议模式，按步骤收集需求并发布简报。
                  </div>
                </div>
              </div>
            )}

            <SedimentNotice
              notice={chatStream.sedimentNotice && chatStream.sedimentNotice.sessionId === activeSession?.id ? chatStream.sedimentNotice : null}
              onUndo={undoSedimentNotice}
              onDismiss={dismissSedimentNotice}
            />

            <MessageInput
              onSend={handleSend}
              sending={streaming}
              onAbort={handleAbort}
              onOpenGeneration={(type) => {
                setGenerationType(type)
                setGenerationOpen(true)
              }}
            />
          </>
        ) : (
          /* ③ 需求模式向导（老板 7 键 / 客户 8 键，前端驱动逐步提问） */
          <DemandWizard
            key={demandMode + '-' + wizardSeq}
            mode={demandMode}
            prefillTitle={historyPrefillTitle}
            prefill={historyPrefill}
            publishing={briefPublishing}
            templateVersion={templateVersion}
            onPublish={(answers) => void handlePublishBrief(answers)}
          />
        )}

        {/* 文生图/文生视频弹窗（对话设置抽屉 / 输入区均可打开） */}
        <MediaGenerationModal
          open={generationOpen}
          onClose={() => setGenerationOpen(false)}
          defaultType={generationType}
          onComplete={handleGenerationComplete}
        />

        {/* 定时任务创建（对话识别意图后弹出） */}
        <ScheduleModal
          open={!!schedulePick}
          prefilled={schedulePick ?? { repeatType: 'once' }}
          onClose={() => setSchedulePick(null)}
          onCreated={(title) => console.log('[Chat] 定时任务已创建:', title)}
        />

        {/* 发布简报前选择执行方式 */}
        <Modal
          title="选择执行方式"
          open={!!teamPick}
          okText="确认并派发"
          cancelText="取消"
          confirmLoading={briefPublishing}
          onOk={() => void handleTeamPickOk()}
          onCancel={() => setTeamPick(null)}
          width={440}
        >
          <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            「{teamPick?.title}」发布后由 Hermes 执行，请选择执行方式。
          </div>
          <Radio.Group
            value={teamPickMode}
            onChange={(e) => setTeamPickMode(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}
          >
            <Radio value="team">指定团队：Hermes 按团队成员分工执行</Radio>
            <Radio value="auto">Hermes 自动匹配：自行拆解并派子代理执行</Radio>
            <Radio value="agent">指定单个 Agent：由所选 Agent 独立完成</Radio>
          </Radio.Group>
          {teamPickMode === 'team' && (
            <Select
              style={{ width: '100%' }}
              value={teamPickValue}
              placeholder="选择执行团队"
              options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => setTeamPickValue(v)}
            />
          )}
          {teamPickMode === 'agent' && (
            <Select
              style={{ width: '100%' }}
              value={teamPickAgentId}
              placeholder="选择要执行的 Agent"
              options={agentOptions.map((a) => ({ value: a.id, label: a.name }))}
              onChange={(v) => setTeamPickAgentId(v)}
              showSearch
              optionFilterProp="label"
            />
          )}
          {teamPickMode === 'auto' && (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              无需选择团队或 Agent，Hermes 会根据任务自行拆解并调度子代理执行。
            </div>
          )}
        </Modal>

        {/* ④ 对话设置抽屉（收纳模型选择 / Agent / 知识库 / 素材生成；不含积分余额） */}
        <ConversationSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelId={modelId}
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
          onAgentChange={(id) => setAgentId(id)}
          onKnowledgeBaseChange={(id) => void handleKnowledgeBaseChange(id)}
          onOpenGeneration={(type) => {
            setGenerationType(type)
            setGenerationOpen(true)
          }}
          onOpenDemandTemplate={() => setTemplateOpen(true)}
        />

        {/* ③ 历史简报 Modal（类型/状态筛选 → 详情 → 使用此简报） */}
        <HistoryBriefs
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onUseBrief={handleUseHistoryBrief}
        />

        {/* 需求模板设置（老板模式 / 客户会议模式自定义） */}
        <DemandTemplateEditor
          open={templateOpen}
          onClose={() => setTemplateOpen(false)}
          onSaved={() => setTemplateVersion((v) => v + 1)}
        />
      </div>
    </div>
  )
}
