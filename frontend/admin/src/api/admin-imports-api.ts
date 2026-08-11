// 管理端资产导入 API
import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type { ImportAssetType, ImportJob } from '@/types/admin-imports'

export const IMPORT_TYPE_LABEL: Record<ImportAssetType, string> = {
  agent: '智能体',
  workflow: '工作流',
  mcp: '插件/MCP',
  skill: '技能',
  skill_pack: '技能包',
  n8n_mcp: 'N8N MCP'
}

/** 提交 GitHub 导入任务 */
export async function createImport(
  dto: { type: ImportAssetType; repoUrl: string; branch?: string; maxSkills?: number }
): Promise<ImportJob> {
  return adminRequest<ImportJob>('post', '/admin/imports', { data: dto })
}

/** 导入任务列表 */
export async function listImports(
  query: { page?: number; pageSize?: number; type?: string; status?: string } = {}
): Promise<AdminPaginatedResult<ImportJob>> {
  return adminRequest<AdminPaginatedResult<ImportJob>>('get', '/admin/imports', { params: query as Record<string, unknown> })
}

/** 导入任务详情（前端轮询进度） */
export async function getImport(id: number): Promise<ImportJob> {
  return adminRequest<ImportJob>('get', `/admin/imports/${id}`)
}

/** 重试失败的导入任务 */
export async function retryImport(id: number): Promise<ImportJob> {
  return adminRequest<ImportJob>('post', `/admin/imports/${id}/retry`)
}

/** 删除导入任务（withDrafts=true 时连带删除该任务导入的草稿资产，已发布/已上架自动跳过） */
export async function deleteImport(
  id: number,
  withDrafts: boolean
): Promise<{ removedDrafts: number; skipped: number }> {
  return adminRequest<{ removedDrafts: number; skipped: number }>('delete', `/admin/imports/${id}`, {
    params: withDrafts ? { withDrafts: 'true' } : undefined
  })
}
