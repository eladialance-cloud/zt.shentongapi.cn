// 对话模块类型定义
// 数据合同真源：spec.md - 对话模块 + Task 8 类型定义

/** 聊天会话 */
export interface ChatSession {
  id: number
  userId: number
  title: string
  modelId: string
  agentId?: number
  knowledgeBaseId?: number
  status: string
  pinned: boolean
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

/** 聊天消息 */
export interface ChatMessage {
  id: number
  sessionId: number
  userId: number
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCallInfo[]
  tokenUsage?: TokenUsage
  creditsCost?: number
  status: string
  attachments?: Attachment[]
  createdAt: Date
}

/** 工具调用信息 */
export interface ToolCallInfo {
  id: string
  name: string
  input: unknown
  output: unknown
  duration: number
  creditsCost: number
  status: 'running' | 'success' | 'failed'
}

/** Token 用量 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 积分消耗信息（流式推送） */
export interface CreditsCostInfo {
  amount: number
  balance: number
  frozen: number
}

/** 创建会话 DTO */
export interface CreateSessionDto {
  title?: string
  modelId: string
  agentId?: number
  knowledgeBaseId?: number
}

/** 发送消息 DTO */
export interface SendMessageDto {
  content: string
  attachments?: string[]
}

/** 附件 */
export interface Attachment {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  url: string
}

/** 会话列表查询参数 */
export interface SessionQuery {
  keyword?: string
  page?: number
  pageSize?: number
  pinned?: boolean
}

/** 分页查询参数 */
export interface PaginationQuery {
  page?: number
  pageSize?: number
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** SSE 流式回调 */
export interface StreamCallbacks {
  /** 流式文本块 */
  onMessage: (chunk: string) => void
  /** 工具调用 */
  onToolCall?: (toolCall: ToolCallInfo) => void
  /** 计费信息 */
  onCreditsCost?: (cost: CreditsCostInfo) => void
  /** 完成 */
  onComplete: (usage: TokenUsage) => void
  /** 错误 */
  onError: (error: Error) => void
}

/** 文件上传结果 */
export interface UploadResult {
  fileId: string
  url: string
  fileName: string
  fileSize: number
  mimeType: string
}

/** 模型选项（来自后端 ModelConfigEntity） */
export interface ModelOption {
  id: string
  name: string
  provider?: string
  icon?: string
}

/** Agent 选项 */
export interface AgentOption {
  id: number
  name: string
  avatar?: string
  description?: string
}

/** 知识库选项 */
export interface KnowledgeBaseOption {
  id: number
  name: string
  description?: string
}
