// 管理端官方知识库 / 行业分类类型

export interface IndustryCategory {
  id: number
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateIndustryDto {
  name: string
  sortOrder?: number
}

export type UpdateIndustryDto = Partial<CreateIndustryDto>

export type PublishStatus = 'draft' | 'published' | 'unpublished'

export interface OfficialKnowledgeBase {
  id: number
  name: string
  description?: string
  visibility: 'private' | 'public'
  industryId?: number
  industryName?: string
  documentCount: number
  publishStatus: PublishStatus
  engineKbId?: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateOfficialKnowledgeBaseDto {
  name: string
  description?: string
  industryId?: number
  visibility?: 'private' | 'public'
}

export type UpdateOfficialKnowledgeBaseDto = Partial<CreateOfficialKnowledgeBaseDto>

export interface OfficialKbDocument {
  id: number
  knowledgeBaseId: number
  name: string
  filePath: string
  fileSize: number
  mimeType?: string
  chunkCount: number
  status: 'pending' | 'processing' | 'done' | 'error'
  engineDocumentId?: string
  engineStatus?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface AdminKnowledgeListResult {
  list: OfficialKnowledgeBase[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface KnowledgeEngineStatus {
  configured: boolean
  reachable: boolean
}
