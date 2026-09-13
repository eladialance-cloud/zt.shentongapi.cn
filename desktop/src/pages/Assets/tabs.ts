/**
 * 素材库 · 顶部 Tab 定义（纯数据，无 API 依赖，便于测试与复用）
 *
 * 2026-09-13 合并：原「素材管理」页的 4 个面板并入素材库；
 * 其中的「融合素材」面板与素材库本体重复，已删除（素材库本体即该能力）。
 */
export const ASSET_LIBRARY_TABS = [
  { key: 'library', label: '素材库' },
  { key: 'compose', label: '合成视频' },
  { key: 'digital', label: '形象视频' },
  { key: 'audio', label: '音频素材' },
  { key: 'knowledge', label: '知识库' },
] as const

export type AssetLibraryTabKey = (typeof ASSET_LIBRARY_TABS)[number]['key']