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
}

export interface ImportJob {
  id: number
  type: ImportAssetType
  repoUrl: string
  branch?: string
  status: ImportJobStatus
  steps?: ImportStep[]
  result?: ImportJobResult
  errorMessage?: string
  createdAt?: string
  updatedAt?: string
}

export type ImportListResult = AdminPaginatedResult<ImportJob>
