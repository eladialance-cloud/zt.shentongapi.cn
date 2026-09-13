/**
 * 素材管理 · Tab 定义（纯数据，无 API 依赖，便于测试与复用）
 * 对标 RRClaw 素材管理 5 Tab。
 */
export const MATERIAL_TABS = [
  { key: 'compose', label: '合成视频' },
  { key: 'fusion', label: '融合素材' },
  { key: 'digital', label: '形象视频' },
  { key: 'audio', label: '音频素材' },
  { key: 'knowledge', label: '知识库' },
] as const

export type MaterialTabKey = (typeof MATERIAL_TABS)[number]['key']
