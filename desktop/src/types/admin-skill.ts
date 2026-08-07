// 管理端技能商店模块类型定义
// 数据合同真源：Task 5 - 管理端技能商店 (admin/skill-store)

import type { AdminPaginatedResult } from './admin-auth'

/** 技能类型 */
export type SkillType = 'skill' | 'workflow'

/** 技能源状态 */
export type SkillSourceStatus = 'pending' | 'analyzing' | 'analyzed' | 'failed'

/** 技能包状态 */
export type SkillPackageStatus =
  | 'draft'
  | 'reviewing'
  | 'approved'
  | 'published'
  | 'unpublished'
  | 'failed'

/** 技能包审核状态 */
export type SkillReviewStatus = 'pending' | 'approved' | 'rejected'

/** 技能源项 */
export interface AdminSkillSource {
  id: number
  sourceUrl: string
  sourceType: 'github' | 'npm' | 'zip' | 'url'
  skillName: string
  skillDesc: string
  skillType: SkillType
  autoDetectedType?: string
  status: SkillSourceStatus
  analyzeResult?: Record<string, unknown>
  errorMessage?: string
  packageId?: number
  createdAt: string
  updatedAt: string
}

/** 技能包项 */
export interface AdminSkillPackage {
  id: number
  name: string
  displayName: string
  description: string
  skillType: SkillType
  runtimeType: string
  category?: string
  sourceUrl: string
  installPath?: string
  skillMdPath?: string
  entryPoint?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  triggerKeywords?: string[]
  examples?: Record<string, unknown>[]
  uiConfig?: Record<string, unknown>
  opcAgentConfig?: Record<string, unknown>
  status: SkillPackageStatus
  reviewStatus: SkillReviewStatus
  reviewNote?: string
  isOfficial: boolean
  callCount: number
  avgRating: number
  version: string
  createdAt: string
  updatedAt: string
}

/** 技能源查询参数 */
export interface SkillSourceQuery {
  page?: number
  pageSize?: number
  status?: SkillSourceStatus | ''
  skillType?: SkillType | ''
}

/** 技能包查询参数 */
export interface SkillPackageQuery {
  page?: number
  pageSize?: number
  status?: SkillPackageStatus | ''
  skillType?: SkillType | ''
  category?: string
  reviewStatus?: SkillReviewStatus | ''
}

/** 新增技能源 DTO */
export interface CreateSkillSourceDto {
  sourceUrl: string
  sourceType: 'github'
  skillName: string
  skillDesc: string
  skillType: SkillType
}

/** 编辑技能包 DTO */
export interface UpdateSkillPackageDto {
  displayName?: string
  description?: string
  category?: string
  triggerKeywords?: string[]
  examples?: Record<string, unknown>[]
  uiConfig?: { icon?: string; color?: string; [key: string]: unknown }
  opcAgentConfig?: Record<string, unknown>
}

/** 技能包分页结果 */
export type AdminSkillPackagePage = AdminPaginatedResult<AdminSkillPackage>
/** 技能源分页结果 */
export type AdminSkillSourcePage = AdminPaginatedResult<AdminSkillSource>
