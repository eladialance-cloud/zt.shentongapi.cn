// 素材两库（用户输入库 / 生成素材库）Tab 定义与查询映射（纯函数，无 React 依赖）
//
// 两库规则（2026-09-14 定稿）：
//  - 输入库 input ：用户提供的原料（声音/形象/图片/视频/音频/IP 档案/文档）——生成节点从这里取材；
//  - 生成库 output：软件产出的成品（文案/图片/视频/音频）——任务/媒体生成完成自动入库。
// 一级 Tab 选库，二级 Tab 选类别；类别 → 后端查询参数（kind 优先，其次物理 type）在本文件统一映射，
// 避免各页面各写一套过滤口径。
import type { MediaAssetKind, MediaAssetLibrary, MediaAssetSourceType, MediaAssetType } from '@/api/media-asset-api'

/** 素材库：input=用户输入库；output=生成素材库（与 API 层同源，避免两处定义漂移） */
export type AssetLibrary = MediaAssetLibrary

/** 二级 Tab：按库区分（文案只在生成库、声音/形象/IP 档案只在输入库） */
export type AssetLibraryTab =
  | 'all'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'document'
  | 'voice'
  | 'avatar'
  | 'ip_archive'

export interface AssetLibraryTabDef {
  key: AssetLibraryTab
  label: string
}

/** 一级库定义（hint 用于页面顶部说明「谁读 / 谁写」） */
export const ASSET_LIBRARIES: Array<{ key: AssetLibrary; label: string; hint: string }> = [
  {
    key: 'input',
    label: '用户输入库',
    hint: '你提供的原料（声音 / 形象 / 图片 / 视频 / IP 档案）：口播工坊、画中画、发布中心等节点都从这里取材',
  },
  {
    key: 'output',
    label: '生成素材库',
    hint: '软件产出的成品（文案 / 图片 / 视频 / 音频）：官署任务与媒体生成完成后自动入库，不需要手动登记',
  },
]

/** 二级 Tab（按库区分） */
export const LIBRARY_TABS: Record<AssetLibrary, AssetLibraryTabDef[]> = {
  input: [
    { key: 'all', label: '全部' },
    { key: 'image', label: '图片' },
    { key: 'video', label: '视频' },
    { key: 'audio', label: '音频' },
    { key: 'voice', label: '声音' },
    { key: 'avatar', label: '形象' },
    { key: 'ip_archive', label: 'IP 档案' },
    { key: 'document', label: '文档' },
  ],
  output: [
    { key: 'all', label: '全部' },
    { key: 'text', label: '文案' },
    { key: 'image', label: '图片' },
    { key: 'video', label: '视频' },
    { key: 'audio', label: '音频' },
  ],
}

/**
 * 生成库「来源」筛选（2026-09-14）：
 * 替代已删除的「合成视频」入口 —— 口播成片就是打「口播工坊」标签的生成物。
 * 只作用于生成库（输入库的来源只有「用户上传」，没有筛选价值）。
 */
export type OutputSourceKey = 'all' | 'oral' | 'agent' | 'media_job' | 'task'

export interface OutputSourceDef {
  key: OutputSourceKey
  label: string
  hint: string
}

/** 生成库来源筛选项（顺序 = 界面顺序，第一项为默认） */
export const OUTPUT_SOURCES: OutputSourceDef[] = [
  { key: 'all', label: '全部来源', hint: '生成库里的全部成品' },
  { key: 'oral', label: '口播成片', hint: '口播工坊「一键导入产物」进来的成片 / 封面 / 人声轨' },
  { key: 'agent', label: '官署产出', hint: '三省六部（官署）任务完成后自动入库的文案 / 图片 / 视频' },
  { key: 'media_job', label: '媒体生成', hint: '媒体生成任务的产物' },
  { key: 'task', label: '任务输出', hint: '任务中心批量导入的产出' },
]

/**
 * 来源 → 后端查询参数（唯一映射口径）：
 *  - 口播成片：按标签精确匹配（source_type 区分不出来——媒体生成任务同为 media_job）
 *  - 其余：按 source_type
 */
export function outputSourceQuery(source: OutputSourceKey): { sourceType?: MediaAssetSourceType; tag?: string } {
  switch (source) {
    case 'oral':
      return { tag: '口播工坊' }
    case 'agent':
      return { sourceType: 'agent' }
    case 'media_job':
      return { sourceType: 'media_job' }
    case 'task':
      return { sourceType: 'task' }
    case 'all':
    default:
      return {}
  }
}

/** 后端素材查询参数（与 MediaAssetQuery 对齐） */
export interface AssetLibraryQuery {
  library: AssetLibrary
  kind?: MediaAssetKind
  type?: MediaAssetType
  sourceType?: MediaAssetSourceType
  tag?: string
}

/** 类别 → 后端查询参数（kind 优先；文档 = 输入库里的普通文件） */
export function libraryTabQuery(library: AssetLibrary, tab: AssetLibraryTab): AssetLibraryQuery {
  // 该库不存在的 Tab（如输入库的「文案」）直接按整库查询，防止拼出非法 kind 组合
  if (!LIBRARY_TABS[library].some((t) => t.key === tab)) return { library };
  switch (tab) {
    case 'image':
    case 'video':
    case 'audio':
      return { library, kind: tab }
    case 'text':
      return { library, kind: 'copy' }
    case 'voice':
      return { library, kind: 'voice' }
    case 'avatar':
      return { library, kind: 'avatar' }
    case 'ip_archive':
      return { library, kind: 'ip_archive' }
    case 'document':
      return { library, type: 'file', kind: 'file' }
    case 'all':
    default:
      return { library }
  }
}

/** 切库时把当前 Tab 归一到新库的合法 Tab（如「文案」在输入库不存在 → 全部） */
export function normalizeLibraryTab(library: AssetLibrary, tab: AssetLibraryTab): AssetLibraryTab {
  return LIBRARY_TABS[library].some((t) => t.key === tab) ? tab : 'all'
}

/** 素材所属库的中文名（列表/详情打标用） */
export const LIBRARY_LABELS: Record<AssetLibrary, string> = {
  input: '输入库',
  output: '生成库',
}

/** 类别中文名（详情/标签用） */
export const KIND_LABELS: Record<string, string> = {
  voice: '声音',
  avatar: '形象',
  ip_archive: 'IP 档案',
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件',
  copy: '文案',
}
