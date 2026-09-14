// 媒体资产 API（二期：云端 media-assets，Bearer JWT）
//
// 端点契约:
//   GET    /media-assets              资产列表（分页 + type/archived 过滤）
//   POST   /media-assets              创建资产 body: { title, url, assetType?, mimeType?, fileSize?, tags? }
//   POST   /media-assets/import       导入资产 body: { taskId?, mediaJobId? }（二选一）
//   PATCH  /media-assets/:id          更新资产 body: { title?, tags?, archived?, description? }
//   GET    /media-assets/:id          资产详情
//   GET    /media-assets/search       语义检索 query: { q, type?, topK? }（Qdrant 优先，LIKE 降级）
//   POST   /media-assets/:id/vectorize  向量化素材（写入语义检索索引）
import { httpClient } from './http-client'

export type MediaAssetSourceType = 'task' | 'media_job' | 'manual' | 'agent' | 'flow'
export type MediaAssetType = 'image' | 'video' | 'audio' | 'file'
export type MediaAssetUsage = 'in_use' | 'selected' | 'unused'
/** 素材库：input=用户输入库（原料）；output=生成素材库（成品） */
export type MediaAssetLibrary = 'input' | 'output'
/** 业务类别（与 library 成对：声音/形象/IP 档案只在输入库，文案只在生成库） */
export type MediaAssetKind =
  | 'voice'
  | 'avatar'
  | 'ip_archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'copy'

export interface MediaAsset {
  id: number
  userId: number
  sourceType: MediaAssetSourceType
  sourceId?: number | null
  title: string
  assetType: MediaAssetType
  url: string
  mimeType?: string | null
  fileSize?: number | null
  tags?: string[] | null
  /** 素材描述（参与语义检索） */
  description?: string | null
  /** 向量化状态 none|pending|ready|failed（后端列 NOT NULL，恒有值） */
  vectorStatus: 'none' | 'pending' | 'ready' | 'failed'
  /** 扩展元数据（时长/分辨率/封面/字幕摘要） */
  meta?: Record<string, unknown> | null
  /** 素材库（input=用户输入库 / output=生成素材库） */
  library?: MediaAssetLibrary
  /** 业务类别 */
  kind?: MediaAssetKind
  archived: boolean
  /** 素材使用状态：in_use=被执行/已发布计划引用；selected=被草稿/待审计划引用；unused=无引用 */
  usage?: MediaAssetUsage
  createdAt: string
  updatedAt: string
}

export interface CreateMediaAssetPayload {
  title: string
  url: string
  assetType?: MediaAssetType
  mimeType?: string
  fileSize?: number
  tags?: string[]
  description?: string
  meta?: Record<string, unknown>
}

export interface UpdateMediaAssetPayload {
  title?: string
  tags?: string[]
  archived?: boolean
  description?: string
}

export interface ImportMediaAssetsPayload {
  taskId?: number
  mediaJobId?: number
}

export interface ImportMediaAssetsResult {
  imported: number
  skipped: number
}

export interface MediaAssetListResult {
  list: MediaAsset[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 资产列表 GET /media-assets?library=&kind=&type=&archived=&page=&pageSize= */
export function listMediaAssets(
  query: {
    /** 素材库过滤（两库规则：不传=兼容旧行为，排除声音/形象/IP 档案） */
    library?: MediaAssetLibrary
    /** 业务类别过滤（优先于 type） */
    kind?: MediaAssetKind
    type?: MediaAssetType
    sourceType?: MediaAssetSourceType
    archived?: boolean
    page?: number
    pageSize?: number
  } = {},
): Promise<MediaAssetListResult> {
  return httpClient.get<MediaAssetListResult>('/media-assets', { params: query })
}

/** 创建资产 POST /media-assets */
export function createMediaAsset(payload: CreateMediaAssetPayload): Promise<MediaAsset> {
  return httpClient.post<MediaAsset>('/media-assets', payload)
}

/** 导入资产 POST /media-assets/import */
export function importMediaAssets(payload: ImportMediaAssetsPayload): Promise<ImportMediaAssetsResult> {
  return httpClient.post<ImportMediaAssetsResult>('/media-assets/import', payload)
}

/** 更新资产 PATCH /media-assets/:id */
export function updateMediaAsset(id: number, payload: UpdateMediaAssetPayload): Promise<MediaAsset> {
  return httpClient.patch<MediaAsset>('/media-assets/' + id, payload)
}

/** 资产详情 GET /media-assets/:id */
export function getMediaAsset(id: number): Promise<MediaAsset> {
  return httpClient.get<MediaAsset>('/media-assets/' + id)
}

export default {
  listMediaAssets,
  createMediaAsset,
  importMediaAssets,
  updateMediaAsset,
  getMediaAsset,
}

/** 素材语义检索 GET /media-assets/search?q=&library=&kind=&type=&topK=（Qdrant 优先，LIKE 降级） */
export function searchMediaAssets(
  query: { q: string; library?: MediaAssetLibrary; kind?: MediaAssetKind; type?: MediaAssetType; topK?: number },
): Promise<Array<{ asset: MediaAsset; score: number }>> {
  return httpClient.get<Array<{ asset: MediaAsset; score: number }>>('/media-assets/search', { params: query })
}

/** 向量化素材 POST /media-assets/:id/vectorize（写入语义检索索引） */
export function vectorizeMediaAsset(id: number): Promise<MediaAsset> {
  return httpClient.post<MediaAsset>('/media-assets/' + id + '/vectorize')
}

/** 素材语义检索 GET /media-assets/search?q=&type=&topK=（Qdrant 优先，LIKE 降级） */
