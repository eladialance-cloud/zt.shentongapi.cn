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
  BookOutlined
} from '@ant-design/icons'
import { SessionList } from './components/SessionList'
import { MessageList } from './components/MessageList'
import { MessageInput } from './components/MessageInput'
import * as chatApi from '@/api/chat-api'
import { listMarketAgents } from '@/api/agent-api'
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

/** 默认模型（占位，实际从 /models 接口加载） */
const DEFAULT_MODEL_ID = 'gpt-4o-mini'

/** 占位模型列表（后续接入 /models 接口） */
const FALLBACK_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' }
]

export default function Chat() {
  // ===== 侧边栏折叠状态 =====
  const [collapsed, setCollapsed] = useState(false)

  // ===== 当前会话与消息 =====
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // ===== 流式状态 =====
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallInfo[]>([])

  // 用 ref 保存流式期间的最新值，避免回调闭包 stale 问题
  const streamingContentRef = useRef('')
  const streamingToolCallsRef = useRef<ToolCallInfo[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  // 同步 ref 与 state
  useEffect(() => {
    streamingContentRef.current = streamingContent
  }, [streamingContent])
  useEffect(() => {
    streamingToolCallsRef.current = streamingToolCalls
  }, [streamingToolCalls])

  // ===== 顶部选择器 =====
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID)
  const [agentId, setAgentId] = useState<number | undefined>(undefined)
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined)

  // ===== 选项数据 =====
  const [modelOptions] = useState<ModelOption[]>(FALLBACK_MODELS)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentPriceMap, setAgentPriceMap] = useState<Record<number, Agent>>({})
  const [kbOptions] = useState<KnowledgeBaseOption[]>([])

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

  /** 切换会话 */
  const handleSelectSession = useCallback(async (session: ChatSession | null) => {
    if (!session) {
      setActiveSession(null)
      setMessages([])
      return
    }
    setActiveSession(session)
    setModelId(session.modelId || DEFAULT_MODEL_ID)
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

  /** 发送消息（流式） */
  const handleSend = useCallback(
    async (content: string, attachments: UploadResult[]) => {
      if (!activeSession) {
        message.warning('请先选择或创建一个对话')
        return
      }
      if (!content.trim() && attachments.length === 0) return

      // 1. 立即追加用户消息到列表
      const userMsg: ChatMessage = {
        id: Date.now(),
        sessionId: activeSession.id,
        userId: 0,
        role: 'user',
        content,
        status: 'sent',
        attachments: attachments.map((a) => ({
          fileId: a.fileId,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          url: a.url
        })),
        createdAt: new Date()
      }
      setMessages((prev) => [...prev, userMsg])

      // 2. 重置流式状态
      setStreaming(true)
      setStreamingContent('')
      setStreamingToolCalls([])
      streamingContentRef.current = ''
      streamingToolCallsRef.current = []

      const dto = {
        content,
        attachments: attachments.map((a) => a.fileId)
      }

      const controller = chatApi.streamMessage(activeSession.id, dto, {
        onMessage: (chunk) => {
          streamingContentRef.current = streamingContentRef.current + chunk
          setStreamingContent(streamingContentRef.current)
        },
        onToolCall: (toolCall) => {
          const prev = streamingToolCallsRef.current
          const idx = prev.findIndex((t) => t.id === toolCall.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = toolCall
            streamingToolCallsRef.current = next
          } else {
            streamingToolCallsRef.current = [...prev, toolCall]
          }
          setStreamingToolCalls(streamingToolCallsRef.current)
        },
        onCreditsCost: (cost) => {
          console.log('[Chat] credits cost:', cost)
        },
        onComplete: (usage) => {
          const assistantMsg: ChatMessage = {
            id: Date.now() + 1,
            sessionId: activeSession.id,
            userId: 0,
            role: 'assistant',
            content: streamingContentRef.current,
            toolCalls:
              streamingToolCallsRef.current.length > 0
                ? streamingToolCallsRef.current
                : undefined,
            tokenUsage: usage,
            status: 'done',
            createdAt: new Date()
          }
          setMessages((prev) => [...prev, assistantMsg])
          setStreaming(false)
          setStreamingContent('')
          setStreamingToolCalls([])
          abortControllerRef.current = null
        },
        onError: (error) => {
          console.error('[Chat] stream error:', error)
          message.error(`生成失败: ${error.message}`)
          if (streamingContentRef.current) {
            const assistantMsg: ChatMessage = {
              id: Date.now() + 1,
              sessionId: activeSession.id,
              userId: 0,
              role: 'assistant',
              content: streamingContentRef.current + '\n\n[生成中断]',
              toolCalls:
                streamingToolCallsRef.current.length > 0
                  ? streamingToolCallsRef.current
                  : undefined,
              status: 'error',
              createdAt: new Date()
            }
            setMessages((prev) => [...prev, assistantMsg])
          }
          setStreaming(false)
          setStreamingContent('')
          setStreamingToolCalls([])
          abortControllerRef.current = null
        }
      })

      abortControllerRef.current = controller
    },
    [activeSession]
  )

  /** 中断流式 */
  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    // 固化已生成内容
    if (streamingContentRef.current) {
      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        sessionId: activeSession?.id ?? 0,
        userId: 0,
        role: 'assistant',
        content: streamingContentRef.current + '\n\n[已停止]',
        toolCalls:
          streamingToolCallsRef.current.length > 0
            ? streamingToolCallsRef.current
            : undefined,
        status: 'stopped',
        createdAt: new Date()
      }
      setMessages((prev) => [...prev, assistantMsg])
    }
    setStreaming(false)
    setStreamingContent('')
    setStreamingToolCalls([])
  }, [activeSession])

  /** 修改模型时同步到会话 */
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
  }

  /** 选项数据构造 */
  const modelSelectProps: SelectProps = useMemo(
    () => ({
      options: modelOptions.map((m) => ({
        label: (
          <span>
            <ThunderboltOutlined style={{ color: '#a5b4fc', marginRight: 6 }} />
            {m.name}
            {m.provider && (
              <span style={{ color: '#6e7681', marginLeft: 6, fontSize: 11 }}>
                ({m.provider})
              </span>
            )}
          </span>
        ),
        value: m.id
      }))
    }),
    [modelOptions]
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
            <RobotOutlined style={{ color: '#a5b4fc', marginRight: 6 }} />
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
            <BookOutlined style={{ color: '#a5b4fc', marginRight: 6 }} />
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
              style={{ color: '#a5b4fc' }}
            />
          </Tooltip>
          <span className={styles.selectorLabel}>模型:</span>
          <Select
            {...modelSelectProps}
            value={modelId}
            onChange={handleModelChange}
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
            onChange={(v) => setKnowledgeBaseId(v)}
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
              <div>选择左侧对话开始聊天，或点击「新建对话」</div>
            </div>
          </div>
        )}

        {/* 底部输入区 */}
        <MessageInput onSend={handleSend} sending={streaming} onAbort={handleAbort} />
      </div>
    </div>
  )
}
