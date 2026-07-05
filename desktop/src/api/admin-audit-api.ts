// 管理端内容审核 API
//
// 端点契约：
//   GET    /admin/sensitive-words              敏感词列表
//   POST   /admin/sensitive-words              新增敏感词
//   POST   /admin/sensitive-words/batch        批量导入敏感词
//   DELETE /admin/sensitive-words/:id          删除敏感词
//   GET    /admin/audit/config                 AI 审核配置
//   PUT    /admin/audit/config                 更新 AI 审核配置
//   POST   /admin/audit/test                   AI 审核测试
//   GET    /admin/audit/queue                  审核队列
//   POST   /admin/audit/:id/approve            审核通过
//   POST   /admin/audit/:id/reject             审核驳回
//   POST   /admin/audit/:id/false-positive     标记误报

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AuditConfig,
  AuditQueueItem,
  AuditQueueQuery,
  AuditTestDto,
  AuditTestResult,
  BatchCreateSensitiveWordDto,
  CreateSensitiveWordDto,
  RejectAuditDto,
  SensitiveWord,
  SensitiveWordQuery,
  UpdateAuditConfigDto
} from '@/types/admin-audit'

/** 敏感词列表 */
export async function listSensitiveWords(
  query: SensitiveWordQuery = {}
): Promise<AdminPaginatedResult<SensitiveWord>> {
  return adminRequest<AdminPaginatedResult<SensitiveWord>>(
    'get',
    '/admin/sensitive-words',
    { params: query as Record<string, unknown> }
  )
}

/** 新增敏感词 */
export async function createSensitiveWord(
  dto: CreateSensitiveWordDto
): Promise<SensitiveWord> {
  return adminRequest<SensitiveWord>('post', '/admin/sensitive-words', {
    data: dto
  })
}

/** 批量导入敏感词 */
export async function batchCreateSensitiveWords(
  dto: BatchCreateSensitiveWordDto
): Promise<{ created: number }> {
  return adminRequest<{ created: number }>(
    'post',
    '/admin/sensitive-words/batch',
    { data: dto }
  )
}

/** 删除敏感词 */
export async function deleteSensitiveWord(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/sensitive-words/${id}`)
}

/** 获取 AI 审核配置 */
export async function getAuditConfig(): Promise<AuditConfig> {
  return adminRequest<AuditConfig>('get', '/admin/audit/config')
}

/** 更新 AI 审核配置 */
export async function updateAuditConfig(
  dto: UpdateAuditConfigDto
): Promise<void> {
  await adminRequest<void>('put', '/admin/audit/config', { data: dto })
}

/** AI 审核测试 */
export async function testAudit(
  dto: AuditTestDto
): Promise<AuditTestResult> {
  return adminRequest<AuditTestResult>('post', '/admin/audit/test', {
    data: dto
  })
}

/** 审核队列 */
export async function listAuditQueue(
  query: AuditQueueQuery = {}
): Promise<AdminPaginatedResult<AuditQueueItem>> {
  return adminRequest<AdminPaginatedResult<AuditQueueItem>>(
    'get',
    '/admin/audit/queue',
    { params: query as Record<string, unknown> }
  )
}

/** 审核通过 */
export async function approveAudit(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/audit/${id}/approve`)
}

/** 审核驳回 */
export async function rejectAudit(
  id: number,
  dto: RejectAuditDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/audit/${id}/reject`, {
    data: dto
  })
}

/** 标记误报 */
export async function markAuditFalsePositive(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/audit/${id}/false-positive`)
}

export default {
  listSensitiveWords,
  createSensitiveWord,
  batchCreateSensitiveWords,
  deleteSensitiveWord,
  getAuditConfig,
  updateAuditConfig,
  testAudit,
  listAuditQueue,
  approveAudit,
  rejectAudit,
  markAuditFalsePositive
}
