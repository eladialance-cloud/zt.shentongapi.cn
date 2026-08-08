// 对话页面（核心）
// 布局：左侧会话列表（可折叠）+ 中间消息区 + 顶部选择器
// 使用 antd Layout + Sider + Content
// 样式：赛博科技深色风格

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select, Tooltip, message } from 'antd'
import type { SelectProps } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import { SessionList } from './components/SessionList'
import { MessageList } from './components/MessageList'
import { MessageInput } from './components/MessageInput'
import { MediaGenerationModal } from './components/MediaGenerationModal'
import type { MediaJob } from '@/api/media-generation-api'
import * as chatApi from '@/api/chat-api'
import { createOpenClawChat, type OpenClawChatHandle } from '@/api/openclaw-chat-api'
import type { OpenClawChatMessage } from '@shared/types'
import { listMarketAgents } from '@/api/agent-api'
import { listKnowledgeBases, listOfficialKnowledgeBases } from '@/api/knowledge-api'
import { officeBridge, isRetrieveTool } from '@/pages/Office/services/officeBridge'
import type {
  ChatSession,
  ChatMessage,
  ToolCallInfo,
  UploadResult,
  ModelOption,
  AgentOption,
  KnowledgeBaseOption
} from '@/types/chat'
import type { Agent } from '@/types/agent'
import styles from './styles.module.css'


export default function Chat() {
  // ===== 侧边栏折叠状态 =====
  const [collapsed, setCollapsed] = useState(false)

  // ===== 当前会话与消息 =====
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // ===== 文生图/文生视频弹窗 =====
  const [generationOpen, setGenerationOpen] = useState(false)
  const [generationType, setGenerationType] = useState<'image' | 'video'>('image')

  // ===== 流式状态 =====
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallInfo[]>([])

  // 用 ref 保存流式期间的最新值，避免回调闭包 stale 问题
  const streamingContentRef = useRef('')
  const streamingToolCallsRef = useRef<ToolCallInfo[]>([])
  // OpenClaw 本地直达对话句柄 + 中断标记（扣费由云端 llm-proxy 完成）
  const openClawChatRef = useRef<OpenClawChatHandle | null>(null)
  const abortRequestedRef = useRef(false)
  const replyGeneratedRef = useRef(false)
  const activeSessionRef = useRef<ChatSession | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])

  // 同步 ref 与 state
  useEffect(() => {
    streamingContentRef.current = streamingContent
  }, [streamingContent])
  useEffect(() => {
    streamingToolCallsRef.current = streamingToolCalls
  }, [streamingToolCalls])

  // ===== 顶部选择器 =====
  const [modelId, setModelId] = useState<string>('')
  const [agentId, setAgentId] = useState<number | undefined>(undefined)
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined)

  // ===== 选项数据 =====
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentPriceMap, setAgentPriceMap] = useState<Record<number, Agent>>({})
  const [kbOptions, setKbOptions] = useState<KnowledgeBaseOption[]>([])

  /** 挂载时创建 OpenClaw 对话通道（IPC），流式事件在此监听（渲染进程不直接碰本地/云端） */
  useEffect(() => {
    let handle: OpenClawChatHandle
    try {
      handle = createOpenClawChat()
    } catch (err) {
      console.error('[Chat] openclaw chat unavailable:', err)
      return
    }
    openClawChatRef.current = handle

    const offMessage = handle.onMessage((chunk) => {
      streamingContentRef.current = streamingContentRef.current + chunk
      setStreamingContent(streamingContentRef.current)
      if (!replyGeneratedRef.current) {
        replyGeneratedRef.current = true
        officeBridge.onReplyGenerated()
      }
    })

    const offToolCall = handle.onToolCall((toolCall) => {
      const prev = streamingToolCallsRef.current
      const idx = prev.findIndex((t) => t.id === toolCall.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = toolCall as unknown as ToolCallInfo
        streamingToolCallsRef.current = next
      } else {
        streamingToolCallsRef.current = [
          ...prev,
          toolCall as unknown as ToolCallInfo,
        ]
      }
      setStreamingToolCalls(streamingToolCallsRef.current)
      // officeBridge: 工具调用 → 市场员去技能墙
      officeBridge.onToolCall(toolCall.name)
      if (isRetrieveTool(toolCall.name)) {
        officeBridge.onAgentRetrieve()
      }
    })

    const offDone = handle.onDone(() => {
      const session = activeSessionRef.current
      const content =
        streamingContentRef.current +
        (abortRequestedRef.current ? '\n\n[已停止]' : '')
      const toolCalls =
        streamingToolCallsRef.current.length > 0
          ? streamingToolCallsRef.current
          : undefined
      // 没有任何生成内容时不再追加空助手消息
      if (session && (content.trim() || (toolCalls && toolCalls.length > 0))) {
        const assistantMsg: ChatMessage = {
          id: Date.now() + 1,
          sessionId: session.id,
          userId: 0,
          role: 'assistant',
          content,
          toolCalls,
          status: 'done',
          createdAt: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      }
      setStreaming(false)
      setStreamingContent('')
      setStreamingToolCalls([])
      streamingContentRef.current = ''
      streamingToolCallsRef.current = []
      abortRequestedRef.current = false
      // officeBridge: 回复完成 → 审核员审核 → 所有人切 IDLE
      officeBridge.onReview()
      setTimeout(() => officeBridge.onTaskComplete(), 1500)
    })

    const offError = handle.onError((err) => {
      // 用户主动停止时忽略错误（等待 done 事件固化）
      if (abortRequestedRef.current) return
      console.error('[Chat] openclaw error:', err)
      message.error('生成失败: ' + err.message)
      // officeBridge: 系统错误 → 主管弹出错误气泡
      officeBridge.onSystemError(err.message)
      if (streamingContentRef.current) {
        const session = activeSessionRef.current
        if (session) {
          const assistantMsg: ChatMessage = {
            id: Date.now() + 1,
            sessionId: session.id,
            userId: 0,
            role: 'assistant',
            content: streamingContentRef.current + '\n\n[生成中断]',
            toolCalls:
              streamingToolCallsRef.current.length > 0
                ? streamingToolCallsRef.current
                : undefined,
            status: 'error',
            createdAt: new Date(),
          }
          setMessages((prev) => [...prev, assistantMsg])
        }
      }
      setStreaming(false)
      setStreamingContent('')
      setStreamingToolCalls([])
      streamingContentRef.current = ''
      streamingToolCallsRef.current = []
      abortRequestedRef.current = false
    })

    return () => {
      offMessage()
      offToolCall()
      offDone()
      offError()
      openClawChatRef.current = null
    }
  }, [])

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
      const session = activeSessionRef.current
      if (!session) {
        message.warning('请先选择或创建一个对话')
        return
      }
      if (!content.trim() && attachments.length === 0) return
      const handle = openClawChatRef.current
      if (!handle) {
        message.error('OpenClaw 对话通道不可用，请升级桌面端版本')
        return
      }

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

      // 2. 重置流式状态
      setStreaming(true)
      setStreamingContent('')
      setStreamingToolCalls([])
      streamingContentRef.current = ''
      streamingToolCallsRef.current = []
      abortRequestedRef.current = false
      replyGeneratedRef.current = false

      // officeBridge: 用户发送消息 → 主管深度工作
      officeBridge.onChatMessageSent()

      // 3. 最近上下文（最近 10 条文本消息，消息不出本机）
      const history: OpenClawChatMessage[] = messagesRef.current
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

      // 4. 发送（本地 OpenClaw 未配置/未登录 → 抛错并推 error 事件；扣费由云端 llm-proxy 完成）
      try {
        await handle.send(content, history)
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err)
        message.error('生成失败: ' + messageText)
        officeBridge.onSystemError(messageText)
        if (streamingContentRef.current) {
          const assistantMsg: ChatMessage = {
            id: Date.now() + 1,
            sessionId: session.id,
            userId: 0,
            role: 'assistant',
            content: streamingContentRef.current + '\n\n[生成中断]',
            toolCalls:
              streamingToolCallsRef.current.length > 0
                ? streamingToolCallsRef.current
                : undefined,
            status: 'error',
            createdAt: new Date(),
          }
          setMessages((prev) => [...prev, assistantMsg])
        }
        setStreaming(false)
        setStreamingContent('')
        setStreamingToolCalls([])
        streamingContentRef.current = ''
        streamingToolCallsRef.current = []
      }
    },
    []
  )

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
      setGenerationOpen(false)
    },
    [activeSession]
  )

  /** 中断 OpenClaw 对话（本地 abort → 云端退款 → done 事件固化消息） */
  const handleAbort = useCallback(() => {
    abortRequestedRef.current = true
    openClawChatRef.current?.abort()
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

    () => ({
      options: modelOptions.map((m) => ({
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
      })),
      notFoundContent: modelLoading
        ? '加载中...'
        : '管理后台暂未上线模型，请联系管理员',
    }),
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
      options: kbOptions.map((k) => ({
        label: (
          <span>
            <DatabaseOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
            {k.name}
          </span>
        ),
        value: k.id
      }))
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
            value={knowledgeBaseId}
            onChange={(v) => handleKnowledgeBaseChange(v)}
            placeholder="选择知识库（可选）"
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
