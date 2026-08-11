// 管理端资产导入（GitHub）与 AI 分类类型
import type { AdminPaginatedResult } from '@/types/admin-auth'

export type ImportAssetType = 'agent' | 'workflow' | 'mcp' | 'skill' | 'skill_pack' | 'n8n_mcp'
export type ImportJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type ImportStepStatus = 'pending' | 'running' | 'done' | 'error'

export interface ImportStep {
  key: 'fetch_repo' | 'parse' | 'classify' | 'save'
  label: string
  status: ImportStepStatus
}

export interface ImportJobResult {
  created: Array<{ type: ImportAssetType; id: number; name: string }>
  skipped: number
  /** 技能目录仓库展开统计（仅目录类导入存在） */
  catalog?: ImportJobCatalogStats
}

export interface ImportJobCatalogStats {
  /** 目录中解析到的技能条目总数 */
  totalEntries: number
  /** 实际尝试展开的条目数（受 maxSkills 限制） */
  attempted: number
  /** 成功取到 SKILL.md 并生成草稿的条目数 */
  fetched: number
  /** 拉取失败 / 仓库无 SKILL.md 的条目数 */
  failed: number
}

export interface ImportJob {
  id: number
  type: ImportAssetType
  repoUrl: string
  branch?: string
  /** 导入参数（如技能目录展开数量 maxSkills） */
  params?: { maxSkills?: number }
  status: ImportJobStatus
  steps?: ImportStep[]
  result?: ImportJobResult
  errorMessage?: string
  createdAt?: string
  updatedAt?: string
}

export type ImportListResult = AdminPaginatedResult<ImportJob>
