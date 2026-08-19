// 素材分组纯函数：类型 Tab（全部/图片/文案/视频/文档）分组逻辑
// 文案 = assetType file 且 mimeType 以 text/ 开头；文档 = assetType file 且 mimeType 非 text/*（或为空）；
// 音频/未知 → other（只在「全部」Tab 出现）
import type { MediaAsset } from '@/api/media-asset-api'

/** 素材分组 */
export type AssetGroup = 'image' | 'text' | 'video' | 'document' | 'other'

/** 素材库类型 Tab（全部/图片/文案/视频/文档） */
export type AssetTab = 'all' | 'image' | 'text' | 'video' | 'document'

/** 分组所需的最小素材字段 */
export type AssetGroupInput = Pick<MediaAsset, 'assetType' | 'mimeType'>

/**
 * 计算素材所属分组
 * - image / video 按 assetType 直接归组
 * - file + text/* mimeType → 文案；file + 其余 mimeType（或为空）→ 文档
 * - audio 或未知类型 → other（无独立 Tab，仅出现在「全部」）
 */
export function assetGroup(asset: AssetGroupInput): AssetGroup {
  if (asset.assetType === 'image') return 'image'
  if (asset.assetType === 'video') return 'video'
  if (asset.assetType === 'audio') return 'other'
  if (asset.assetType === 'file') {
    const mime = asset.mimeType?.trim().toLowerCase() ?? ''
    if (mime.startsWith('text/')) return 'text'
    return 'document'
  }
  return 'other'
}

/** 素材是否命中指定 Tab（other 分组仅命中 all） */
export function matchAssetTab(asset: AssetGroupInput, tab: AssetTab): boolean {
  if (tab === 'all') return true
  return assetGroup(asset) === tab
}

/** 按 Tab 在客户端二次过滤素材列表 */
export function filterAssetsByTab(assets: MediaAsset[], tab: AssetTab): MediaAsset[] {
  return assets.filter((a) => matchAssetTab(a, tab))
}

/** 本地分组分页结果 */
export interface AssetPageResult {
  list: MediaAsset[]
  total: number
  page: number
}

/**
 * 过滤 + 本地分页：先按 Tab 过滤，再按 page/pageSize 切片。
 * 供文案/文档等无法走后端 type 过滤的 Tab 使用（先翻页聚合拉取，再本地分组分页）。
 */
export function paginateFiltered(
  assets: MediaAsset[],
  tab: AssetTab,
  page: number,
  pageSize: number,
): AssetPageResult {
  const matched = filterAssetsByTab(assets, tab)
  const currentPage = Math.max(1, page)
  const size = Math.max(1, pageSize)
  const start = (currentPage - 1) * size
  return {
    list: matched.slice(start, start + size),
    total: matched.length,
    page: currentPage,
  }
}
