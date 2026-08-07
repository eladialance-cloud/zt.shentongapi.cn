// 管理端技能商店 API
//
// 端点契约：
//   POST   /admin/skill-store/sources                新增技能源
//   GET    /admin/skill-store/sources                技能源列表(分页)
//   POST   /admin/skill-store/sources/:id/analyze    触发解析(异步)
//   DELETE /admin/skill-store/sources/:id            删除技能源
//   GET    /admin/skill-store/packages               技能包列表(分页)
//   GET    /admin/skill-store/packages/:id           技能包详情
//   PATCH  /admin/skill-store/packages/:id           编辑技能包
//   POST   /admin/skill-store/packages/:id/submit-review  提交审核
//   POST   /admin/skill-store/packages/:id/approve        审核通过
//   POST   /admin/skill-store/packages/:id/reject         审核驳回 body: { reason }
//   POST   /admin/skill-store/packages/:id/publish        上架
//   POST   /admin/skill-store/packages/:id/unpublish      下架
//   POST   /admin/skill-store/packages/:id/health-check   健康检查
//   DELETE /admin/skill-store/packages/:id                删除技能包

import { adminRequest, adminUpload } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminSkillPackage,
  AdminSkillSource,
  CreateSkillSourceDto,
  SkillPackageQuery,
  SkillSourceQuery,
  SkillType,
  UpdateSkillPackageDto
} from '@/types/admin-skill'

/** 技能源列表 */
export async function listSkillSources(
  query: SkillSourceQuery = {}
): Promise<AdminPaginatedResult<AdminSkillSource>> {
  return adminRequest<AdminPaginatedResult<AdminSkillSource>>(
    'get',
    '/admin/skill-store/sources',
    { params: query as Record<string, unknown> }
  )
}

/** 新增技能源 */
export async function createSkillSource(
  dto: CreateSkillSourceDto
): Promise<AdminSkillSource> {
  return adminRequest<AdminSkillSource>('post', '/admin/skill-store/sources', {
    data: dto
  })
}

/** 触发技能源解析(异步) */
export async function analyzeSkillSource(
  id: number
): Promise<{ status: string; message: string }> {
  return adminRequest<{ status: string; message: string }>(
    'post',
    `/admin/skill-store/sources/${id}/analyze`
  )
}

/** 删除技能源 */
export async function deleteSkillSource(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/skill-store/sources/${id}`)
}

/** 技能包列表 */
export async function listSkillPackages(
  query: SkillPackageQuery = {}
): Promise<AdminPaginatedResult<AdminSkillPackage>> {
  return adminRequest<AdminPaginatedResult<AdminSkillPackage>>(
    'get',
    '/admin/skill-store/packages',
    { params: query as Record<string, unknown> }
  )
}

/** 技能包详情 */
export async function getSkillPackage(id: number): Promise<AdminSkillPackage> {
  return adminRequest<AdminSkillPackage>(
    'get',
    `/admin/skill-store/packages/${id}`
  )
}

/** 编辑技能包 */
export async function updateSkillPackage(
  id: number,
  dto: UpdateSkillPackageDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/skill-store/packages/${id}`, {
    data: dto
  })
}

/** 提交审核 */
export async function submitSkillPackageReview(id: number): Promise<void> {
  await adminRequest<void>(
    'post',
    `/admin/skill-store/packages/${id}/submit-review`
  )
}

/** 审核通过 */
export async function approveSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/approve`)
}

/** 审核驳回 */
export async function rejectSkillPackage(
  id: number,
  reason: string
): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/reject`, {
    data: { reason }
  })
}

/** 上架 */
export async function publishSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/skill-store/packages/${id}/publish`)
}

/** 下架 */
export async function unpublishSkillPackage(id: number): Promise<void> {
  await adminRequest<void>(
    'post',
    `/admin/skill-store/packages/${id}/unpublish`
  )
}

/** 健康检查 */
export async function healthCheckSkillPackage(
  id: number
): Promise<{ ok: boolean; message?: string; [key: string]: unknown }> {
  return adminRequest<{ ok: boolean; message?: string; [key: string]: unknown }>(
    'post',
    `/admin/skill-store/packages/${id}/health-check`
  )
}

/** 删除技能包 */
export async function deleteSkillPackage(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/skill-store/packages/${id}`)
}

/** 本地上传 zip 技能源 */
export async function uploadSkillSource(
  file: File,
  meta: { skillName: string; skillDesc: string; skillType: SkillType }
): Promise<AdminSkillSource> {
  const form = new FormData();
  form.append('file', file);
  form.append('skillName', meta.skillName);
  form.append('skillDesc', meta.skillDesc);
  form.append('skillType', meta.skillType);
  return adminUpload<AdminSkillSource>('/admin/skill-store/sources/upload', form);
}
