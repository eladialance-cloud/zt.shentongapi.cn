// 知识库模块类型定义
// 数据合同真源：Task 11 知识库功能模块

/** 知识库 */
export interface KnowledgeBase {
  id: number
  name: string
  description: string
  documentCount: number
  createdAt: Date
  updatedAt?: Date
}

/** 知识库文档分块状态 */
export type ChunkStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** 知识库文档 */
export interface KnowledgeDocument {
  id: number
  knowledgeBaseId: number
  fileName: string
  fileSize: number
  mimeType: string
  chunkStatus: ChunkStatus
  chunkCount: number
  /** 分块错误信息（chunkStatus=failed 时存在） */
  errorMessage?: string
  createdAt: Date
  updatedAt?: Date
}

/** 检索结果片段 */
export interface SearchResult {
  id: string
  content: string
  /** 相似度分数（0-1） */
  score: number
  documentId: number
  documentName: string
  /** 元数据（页码、分块位置等） */
  metadata?: unknown
}

/** 创建知识库 DTO */
export interface CreateKnowledgeBaseDto {
  name: string
  description?: string
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
