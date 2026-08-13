// 对话页面（核心）
// 布局：左侧会话列表（可折叠）+ 中间消息区 + 顶部选择器
// 使用 antd Layout + Sider + Content
// 样式：赛博科技深色风格

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Select, Tooltip, message } from 'antd'
import type { SelectProps } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { SessionList } from './components/SessionList'
import { MessageList } from './components/MessageList'
import { MessageInput } from './components/MessageInput'
import { MediaGenerationModal } from './components/MediaGenerationModal'
import type { MediaJob } from '@/api/media-generation-api'
import * as chatApi from '@/api/chat-api'
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
} from '@/store/chat-stream'
import { listMarketAgents } from '@/api/agent-api'
import { listKnowledgeBases, listOfficialKnowledgeBases } from '@/api/knowledge-api'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import type {
  ChatSession,
  ChatMessage,
  UploadResult,
  ModelOption,
  AgentOption,
  KnowledgeBaseOption
} from '@/types/chat'
import type { Agent } from '@/types/agent'
import styles from './styles.module.css'


/** 模型分类分组标签（对话模型下拉） */
const MODEL_TYPE_GROUP_LABEL: Record<string, string> = {
  chat: '文本对话',
  vision: '图片识图',
  reasoning: '推理',
  embedding: '向量',
  audio: '音频'
}

/** 知识库选择器「全局搜索」的固定 value */
const GLOBAL_KB_VALUE = '__global__'

/** 当前会话本地记忆 Key：切页/切窗口后回到对话页自动恢复上次会话 */
const CHAT_ACTIVE_SESSION_KEY = 'chat:active-session'

export default function Chat() {
  // ===== 侧边栏折叠状态 =====
  const [collapsed, setCollapsed] = useState(false)

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

  // ===== 顶部选择器 =====
  const [modelId, setModelId] = useState<string>('')
  const [agentId, setAgentId] = useState<number | undefined>(undefined)
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined)
  useEffect(() => {
    knowledgeBaseIdRef.current = knowledgeBaseId
  }, [knowledgeBaseId])

  // ===== 选项数据 =====
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentPriceMap, setAgentPriceMap] = useState<Record<number, Agent>>({})
  const [kbOptions, setKbOptions] = useState<KnowledgeBaseOption[]>([])

  /** 流式事件由全局对话流桥（store/chat-stream）常驻监听：切页不丢、完成后自动落库。 */

  /** 加载市场 Agent 列表（用于顶部 Agent 选择器 + 价格提示） */
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
            description: a.description
          }))
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

  /** 加载我的知识库 + 官方知识库（顶部知识库挂载选择器用） */
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
            name: k.industryName ? `${k.name} · ${k.industryName}` : k.name,
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

  /** 加载可选模型列表（管理后台上线的启用模型，替代旧的写死列表） */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setModelLoading(true)
      try {
        const list = await chatApi.listChatModels()
        if (cancelled) return
        setModelOptions(list || [])
        if (list && list.length > 0) {
          setModelId((prev) =>
            prev && list.some((m) => m.id === prev) ? prev : list[0].id,
          )
        }
      } catch (err) {
        console.error('[Chat] load models failed:', err)
      } finally {
        if (!cancelled) setModelLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      })
    },
    [activeSession, messages]
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
          ? `![${promptText}](${firstUrl})`
          : `${firstUrl}`
      }
      const costText = job.creditsCost > 0 ? `（已扣除 ${job.creditsCost} 积分）` : ''
      const assistantMsg: ChatMessage = {
        id: Date.now() + 2,
        sessionId: activeSession?.id ?? 0,
        userId: 0,
        role: 'assistant',
        content: `✨ ${typeLabel}完成${costText}\n${promptText ? `提示词：${promptText}\n` : ''}${mediaMarkdown}`.replace(/\n$/,''),
        status: 'done',
        creditsCost: job.creditsCost,
        createdAt: new Date()
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (activeSession?.id) persistMessage(activeSession.id, assistantMsg)
      setGenerationOpen(false)
    },
    [activeSession]
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
        await chatApi.updateSession(activeSession.id, { modelId: newModelId })
        setActiveSession({ ...activeSession, modelId: newModelId })
      } catch (err) {
        console.error('[Chat] update model failed:', err)
      }
    }
    try {
      await chatApi.setPreferredChatModel(newModelId)
    } catch (err) {
      console.error('[Chat] set preferred model failed:', err)
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

  /** 选项数据构造 */
  const modelSelectProps: SelectProps = useMemo(

    () => {
      const renderOption = (m: ModelOption) => ({
        label: (
          <span>
            <ThunderboltOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
            {m.name}
            {m.provider && (
              <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6, fontSize: 11 }}>
                ({m.provider})
              </span>
            )}
            {m.modelType && m.modelType !== 'chat' && (
              <span style={{ color: '#8b5cf6', marginLeft: 6, fontSize: 11 }}>
                [{m.modelType}]
              </span>
            )}
            {(m.inputPricePer1k != null || m.outputPricePer1k != null) && (
              <span style={{ color: '#22d3ee', marginLeft: 6, fontSize: 11 }}>
                {m.inputPricePer1k ?? 0}/{m.outputPricePer1k ?? 0} 积分/千token
              </span>
            )}
          </span>
        ),
        value: m.id
      })
      // 按模型分类分组（chat/vision/reasoning/...），保持后台 sortOrder 顺序
      const groupMap = new Map<string, ReturnType<typeof renderOption>[]>()
      for (const m of modelOptions) {
        const key = m.modelType && m.modelType !== 'chat' ? m.modelType : 'chat'
        if (!groupMap.has(key)) groupMap.set(key, [])
        groupMap.get(key)!.push(renderOption(m))
      }
      const options = Array.from(groupMap.entries()).map(([key, items]) => ({
        label: MODEL_TYPE_GROUP_LABEL[key] || key,
        options: items
      }))
      return {
        options,
        notFoundContent: modelLoading
          ? '加载中...'
          : '管理后台暂未上线模型，请联系管理员',
      }
    },
    [modelOptions, modelLoading]
  )

  /** 当前选中的 Agent（用于价格提示） */
  const selectedAgent = agentId != null ? agentPriceMap[agentId] : undefined

  /** Agent 价格提示文案 */
  const agentPriceHint = useMemo(() => {
    if (!selectedAgent) return ''
    const parts: string[] = []
    if (selectedAgent.pricePerCall > 0) {
      parts.push(`${selectedAgent.pricePerCall} 积分/次`)
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

  const agentSelectProps: SelectProps = useMemo(
    () => ({
      options: agentOptions.map((a) => ({
        label: (
          <span>
            <RobotOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
            {a.name}
          </span>
        ),
        value: a.id
      }))
    }),
    [agentOptions]
  )

  const kbSelectProps: SelectProps = useMemo(
    () => ({
      options: [
        {
          label: (
            <span>
              <GlobalOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
              全局搜索（默认）
            </span>
          ),
          value: GLOBAL_KB_VALUE
        },
        ...kbOptions.map((k) => ({
          label: (
            <span>
              <DatabaseOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
              {k.name}
            </span>
          ),
          value: k.id
        })),
      ],
    }),
    [kbOptions]
  )

  return (
    <div className={styles.chatContainer}>
      {/* 左侧会话列表 */}
      <div className={collapsed ? styles.sessionListCollapsed : ''}>
        {!collapsed && (
          <SessionList
            activeSessionId={activeSession?.id ?? null}
            defaultModelId={modelId}
            defaultAgentId={agentId}
            onSelectSession={handleSelectSession}
          />
        )}
      </div>

      {/* 中间消息区 */}
      <div className={styles.messageArea}>
        {/* 顶部选择器 */}
        <div className={styles.modelSelector}>
          <Tooltip title={collapsed ? '展开会话列表' : '折叠会话列表'}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((v) => !v)}
              className={styles.collapseBtn}
              style={{ color: 'var(--color-text-secondary)' }}
            />
          </Tooltip>
          <span className={styles.selectorLabel}>模型:</span>
          <Select
            {...modelSelectProps}
            value={modelId || undefined}
            onChange={handleModelChange}
            loading={modelLoading}
            placeholder="暂无可用模型"
            className={styles.selectorItem}
            size="small"
            popupMatchSelectWidth={false}
          />
          <span className={styles.selectorLabel}>Agent:</span>
          <Select
            {...agentSelectProps}
            value={agentId}
            onChange={(v) => setAgentId(v)}
            placeholder="选择 Agent（可选）"
            allowClear
            className={styles.selectorItem}
            size="small"
            popupMatchSelectWidth={false}
          />
          {agentId != null && agentPriceHint && (
            <Tooltip title="Agent 调用计费：冻结预估积分 → 结算实际 Token 费用 → 退补差额">
              <span
                style={{
                  fontSize: 11,
                  color: '#22d3ee',
                  background: 'rgba(34, 211, 238, 0.1)',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  padding: '1px 8px',
                  borderRadius: 8,
                  whiteSpace: 'nowrap'
                }}
              >
                {agentPriceHint}
              </span>
            </Tooltip>
          )}
          <span className={styles.selectorLabel}>知识库:</span>
          <Select
            {...kbSelectProps}
            value={knowledgeBaseId ?? GLOBAL_KB_VALUE}
            onChange={(v) =>
              handleKnowledgeBaseChange(
                v === GLOBAL_KB_VALUE ? undefined : (v as number),
              )
            }
            placeholder="全局搜索（默认）"
            allowClear
            className={styles.selectorItem}
            size="small"
            popupMatchSelectWidth={false}
          />
        </div>

        {/* 消息列表 */}
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
              <RobotOutlined className={styles.emptyStateIcon} />
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                和 OpenClaw 对话
              </div>
              <div className={styles.emptyStateTip}>
                对话由本地 OpenClaw 驱动，可自动调用 Hermes / N8N / MCP 帮你完成复杂任务。选择左侧对话开始聊天，或点击「新建对话」。
              </div>
            </div>
          </div>
        )}

        {/* 底部输入区 */}
        <MessageInput
          onSend={handleSend}
          sending={streaming}
          onAbort={handleAbort}
          onOpenGeneration={(type) => {
            setGenerationType(type)
            setGenerationOpen(true)
          }}
        />

        <MediaGenerationModal
          open={generationOpen}
          onClose={() => setGenerationOpen(false)}
          defaultType={generationType}
          onComplete={handleGenerationComplete}
        />
      </div>
    </div>
  )
}
