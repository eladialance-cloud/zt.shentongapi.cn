// 管理端 AI 分类 API
import { adminRequest } from './admin-auth-api'

export interface ReclassifyResult {
  category: string
  tags: string[]
}

/** 手动重新分类指定资产（AI 分类并写回 category/tags） */
export async function reclassifyAsset(assetType: string, id: number): Promise<ReclassifyResult> {
  return adminRequest<ReclassifyResult>('post', '/admin/classify', { data: { assetType, id } })
}
