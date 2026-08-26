// 素材库 API（对标参考软件「素材管理」；后端 media-assets 模块）
// 端点契约：
//   GET    /media-assets          素材列表（分页 + type/archived 过滤）
//   POST   /media-assets          登记素材（manual：标题 + URL + 描述/标签 → 自动向量化）
//   POST   /media-assets/:id/vectorize  向量化素材（Qdrant 语义索引）
//   PATCH  /media-assets/:id      更新素材（title/tags/description/archived）
//   GET    /media-assets/search   语义检索（Qdrant 优先，LIKE 降级）

import { httpClient } from './http-client'

export interface MediaAssetItem {
  id: number
  title: string
  assetType: 'image' | 'video' | 'audio' | 'file'
  url: string
  mimeType?: string | null
  fileSize?: number | null
  tags?: string[] | null
  description?: string | null
  vectorStatus: 'none' | 'pending' | 'ready' | 'failed'
  archived: boolean
  createdAt: string
}

export interface MediaAssetListResult {
  list: MediaAssetItem[]
  total: number
  page: number
  pageSize: number
}

export interface MediaAssetQuery {
  type?: 'image' | 'video' | 'audio' | 'file'
  archived?: string
  page?: number
  pageSize?: number
}

/** 素材列表 */
export async function listMediaAssets(query: MediaAssetQuery = {}): Promise<MediaAssetListResult> {
  return httpClient.get<MediaAssetListResult>('/media-assets', { params: query })
}

/** 登记素材（URL 方式，自动向量化） */
export async function createMediaAsset(payload: {
  title: string
  url: string
  assetType?: 'image' | 'video' | 'audio' | 'file'
  tags?: string[]
  description?: string
}): Promise<MediaAssetItem> {
  return httpClient.post<MediaAssetItem>('/media-assets', payload)
}

/** 向量化素材 */
export async function vectorizeMediaAsset(id: number): Promise<MediaAssetItem> {
  return httpClient.post<MediaAssetItem>('/media-assets/' + id + '/vectorize', {})
}

/** 更新素材（归档/标题/标签/描述） */
export async function updateMediaAsset(
  id: number,
  payload: { title?: string; tags?: string[]; description?: string; archived?: boolean },
): Promise<MediaAssetItem> {
  return httpClient.patch<MediaAssetItem>('/media-assets/' + id, payload)
}

/** 语义检索素材（AI 混剪建议等） */
export async function searchMediaAssets(q: string, topK = 10): Promise<MediaAssetItem[]> {
  return httpClient.get<MediaAssetItem[]>('/media-assets/search', { params: { q, topK } })
}

export default {
  listMediaAssets,
  createMediaAsset,
  vectorizeMediaAsset,
  updateMediaAsset,
  searchMediaAssets,
}