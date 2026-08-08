// 管理端技能商店 API
import { adminRequest } from './admin-auth-api'

export interface SkillBatchDeleteResult {
  total: number
  deleted: number
  failed: number
  errors: string[]
}
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminSkillSource,
  AdminSkillPackage,
  CreateSkillSourceDto,
  UpdateSkillPackageDto,
  SkillSourceQuery,
  SkillPackageQuery,
  RejectSkillPackageDto,
  HealthCheckResult,
  AnalyzeTriggerResult
} from '@/types/admin-skill-store'

/** 技能源列表 */
export async function listSkillSources(query: SkillSourceQuery = {}): Promise<AdminPaginatedResult<AdminSkillSource>> {
  return adminRequest<AdminPaginatedResult<AdminSkillSource>>('get', '/admin/skill-store/sources', { params: query as Record<string, unknown> })
}

/** 创建技能源 */
export async function createSkillSource(dto: CreateSkillSourceDto): Promise<AdminSkillSource> {
  return adminRequest<AdminSkillSource>('post', '/admin/skill-store/sources', { data: dto })
}

/** 触发解析（异步） */
export async function analyzeSkillSource(id: number): Promise<AnalyzeTriggerResult> {
  return adminRequest<AnalyzeTriggerResult>('post', `/admin/skill-store/sources/${id}/analyze`)
}

/** 删除技能源 */
export async function removeSkillSource(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/skill-store/sources/${id}`)
}

/** 本地上传 zip 技能源 */
export async function uploadSkillSource(
  file: File,
  dto: { skillName: string; skillDesc: string; skillType: 'skill' | 'workflow' }
): Promise<AdminSkillSource> {
  const form = new FormData()
  form.append('file', file)
  form.append('skillName', dto.skillName)
  form.append('skillDesc', dto.skillDesc)
  form.append('skillType', dto.skillType)
  return adminRequest<AdminSkillSource>('post', '/admin/skill-store/sources/upload', { data: form })
}

/** 批量删除技能包 */
export async function batchDeleteSkillPackages(
  ids: number[]
): Promise<SkillBatchDeleteResult> {
  return adminRequest<SkillBatchDeleteResult>('post', '/admin/skill-store/packages/batch-delete', { data: { ids } })
}

/** 技能包列表 */
/** 技能包列表 */
export async function listSkillPackages(query: SkillPackageQuery = {}): Promise<AdminPaginatedResult<AdminSkillPackage>> {
  return adminRequest<AdminPaginatedResult<AdminSkillPackage>>('get', '/admin/skill-store/packages', { params: query as Record<string, unknown> })
}

/** 技能包详情 */
export async function getSkillPackageDetail(id: number): Promise<AdminSkillPackage> {
  return adminRequest<AdminSkillPackage>('get', `/admin/skill-store/packages/${id}`)
}

/** 编辑技能包 */
export async function updateSkillPackage(id: number, dto: UpdateSkillPackageDto): Promise<void> {
  await adminRequest<void>('patch', `/admin/skill-store/packages/${id}`, { data: dto })
}

/** 删除技能包 */
export async function removeSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/skill-store/packages/${id}`)
}

/** 提交审核 */
export async function submitReviewSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/submit-review`)
}

/** 审核通过 */
export async function approveSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/approve`)
}

/** 审核驳回 */
export async function rejectSkillPackage(id: number, dto: RejectSkillPackageDto): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/reject`, { data: dto })
}

/** 上架 */
export async function publishSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/publish`)
}

/** 下架 */
export async function unpublishSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/unpublish`)
}

/** 健康检查 */
export async function healthCheckSkillPackage(id: number): Promise<HealthCheckResult> {
  return adminRequest<HealthCheckResult>('post', `/admin/skill-store/packages/${id}/health-check`)
}

export default {
  listSkillSources,
  createSkillSource,
  analyzeSkillSource,
  removeSkillSource,
  listSkillPackages,
  getSkillPackageDetail,
  updateSkillPackage,
  removeSkillPackage,
  submitReviewSkillPackage,
  approveSkillPackage,
  rejectSkillPackage,
  publishSkillPackage,
  unpublishSkillPackage,
  healthCheckSkillPackage
}
