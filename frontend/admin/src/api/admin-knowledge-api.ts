// 管理端官方知识库 / 行业分类 API
import { adminRequest } from './admin-auth-api'
import type {
  AdminKnowledgeListResult,
  CreateIndustryDto,
  CreateOfficialKnowledgeBaseDto,
  IndustryCategory,
  KnowledgeEngineStatus,
  OfficialKbDocument,
  OfficialKnowledgeBase,
  UpdateIndustryDto,
  UpdateOfficialKnowledgeBaseDto
} from '@/types/admin-knowledge'

const KB_BASE = '/admin/knowledge-bases'
const INDUSTRY_BASE = '/admin/industries'

// ===== 行业分类 =====
export async function listIndustries(): Promise<IndustryCategory[]> {
  return adminRequest<IndustryCategory[]>('get', INDUSTRY_BASE)
}

export async function createIndustry(dto: CreateIndustryDto): Promise<IndustryCategory> {
  return adminRequest<IndustryCategory>('post', INDUSTRY_BASE, { data: dto })
}

export async function updateIndustry(id: number, dto: UpdateIndustryDto): Promise<void> {
  await adminRequest('patch', `${INDUSTRY_BASE}/${id}`, { data: dto })
}

export async function deleteIndustry(id: number): Promise<void> {
  await adminRequest('delete', `${INDUSTRY_BASE}/${id}`)
}

// ===== 官方知识库 =====
export async function listOfficialKnowledgeBases(params: {
  page?: number
  pageSize?: number
  keyword?: string
  industryId?: number
  publishStatus?: string
}): Promise<AdminKnowledgeListResult> {
  return adminRequest<AdminKnowledgeListResult>('get', KB_BASE, { params })
}

export async function createOfficialKnowledgeBase(
  dto: CreateOfficialKnowledgeBaseDto
): Promise<OfficialKnowledgeBase> {
  return adminRequest<OfficialKnowledgeBase>('post', KB_BASE, { data: dto })
}

export async function updateOfficialKnowledgeBase(
  id: number,
  dto: UpdateOfficialKnowledgeBaseDto
): Promise<void> {
  await adminRequest('patch', `${KB_BASE}/${id}`, { data: dto })
}

export async function publishOfficialKnowledgeBase(id: number): Promise<void> {
  await adminRequest('post', `${KB_BASE}/${id}/publish`)
}

export async function unpublishOfficialKnowledgeBase(id: number): Promise<void> {
  await adminRequest('post', `${KB_BASE}/${id}/unpublish`)
}

export async function deleteOfficialKnowledgeBase(id: number): Promise<void> {
  await adminRequest('delete', `${KB_BASE}/${id}`)
}

export async function getKnowledgeEngineStatus(): Promise<KnowledgeEngineStatus> {
  return adminRequest<KnowledgeEngineStatus>('get', `${KB_BASE}/engine-status`)
}

// ===== 官方知识库文档 =====
export async function listOfficialKbDocuments(kbId: number): Promise<OfficialKbDocument[]> {
  return adminRequest<OfficialKbDocument[]>('get', `${KB_BASE}/${kbId}/documents`)
}

export async function uploadOfficialKbDocument(kbId: number, file: File): Promise<OfficialKbDocument> {
  const form = new FormData()
  form.append('file', file)
  return adminRequest<OfficialKbDocument>('post', `${KB_BASE}/${kbId}/documents`, { data: form })
}

export async function deleteOfficialKbDocument(kbId: number, docId: number): Promise<void> {
  await adminRequest('delete', `${KB_BASE}/${kbId}/documents/${docId}`)
}
