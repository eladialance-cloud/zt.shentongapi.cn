/**
 * 素材两库定义（唯一真源）—— 用户输入库 / 生成素材库
 *
 * 设计（2026-09-14 定稿）：
 *  - 逻辑上只有两个库：library='input'（用户提供的原料）、library='output'（软件产出的成品）；
 *  - kind 是业务类别，与 library 成对校验（见 LIBRARY_KINDS），避免出现"生成库里的声音"这类越界数据；
 *  - 物理共用 media_assets 一张表（上传/存储/预览/向量化/归档/权限全部复用，引用只需一个 assetId）；
 *  - 判定与接线分离：本文件是纯函数（无 Nest/DB 依赖），迁移回填、登记、导入都调用它，保证口径唯一。
 */
import type { MediaAssetBizType, MediaAssetSourceType, MediaAssetType } from './entities/media-asset.entity';

/** 素材库：input=用户输入库；output=生成素材库 */
export type MediaAssetLibrary = 'input' | 'output';

/**
 * 业务类别：
 *  - 输入库：voice 声音 / avatar 形象 / ip_archive IP 档案 / image 图片 / video 视频 / audio 音频 / file 文件
 *  - 生成库：copy 文案 / image 图片 / video 视频 / audio 音频
 */
export type MediaAssetKind =
  | 'voice'
  | 'avatar'
  | 'ip_archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'copy';

/** library → 允许的 kind（唯一真源，服务端校验用） */
export const LIBRARY_KINDS: Record<MediaAssetLibrary, readonly MediaAssetKind[]> = {
  input: ['voice', 'avatar', 'ip_archive', 'image', 'video', 'audio', 'file'],
  output: ['copy', 'image', 'video', 'audio'],
};

/** 旧列表行为的兼容口径：这三个 kind 属于"业务型资产"，默认不混进素材列表 */
export const BUSINESS_INPUT_KINDS: readonly MediaAssetKind[] = ['voice', 'avatar', 'ip_archive'];

/** 会写入生成库的来源（source_type） */
export const GENERATED_SOURCE_TYPES: readonly MediaAssetSourceType[] = ['task', 'media_job', 'agent', 'flow'];

/** 是否合法：kind 必须属于该 library */
export function isKindInLibrary(library: MediaAssetLibrary, kind: MediaAssetKind): boolean {
  return LIBRARY_KINDS[library].includes(kind);
}

/** 由物理类型（image/video/audio/file）推导业务类别；生成库的 file 一律视为文案（copy） */
export function kindFromAssetType(library: MediaAssetLibrary, assetType: MediaAssetType): MediaAssetKind {
  if (assetType === 'image' || assetType === 'video' || assetType === 'audio') return assetType;
  return library === 'output' ? 'copy' : 'file';
}

/**
 * 历史"手动登记但其实由软件产出"的标记判定 → 精确来源：
 *  - 口播工坊标签 → media_job（口播工坊走媒体生成任务）
 *  - edict:// 占位 url / 三省六部标签 → agent（官署任务产出）
 * 无标记返回 null（=用户上传）。
 */
export function generatedSourceType(input: {
  url?: string | null;
  tags?: string[] | null;
}): MediaAssetSourceType | null {
  const tags = input.tags ?? [];
  if (tags.some((t) => typeof t === 'string' && t.includes('口播工坊'))) return 'media_job';
  const url = String(input.url ?? '');
  if (url.startsWith('edict://')) return 'agent';
  if (tags.some((t) => typeof t === 'string' && t.includes('三省六部'))) return 'agent';
  return null;
}

/** 历史"手动登记但其实由软件产出"的标记（generatedSourceType !== null 的布尔形式） */
export function hasGeneratedMarker(input: { url?: string | null; tags?: string[] | null }): boolean {
  return generatedSourceType(input) !== null;
}

export interface AssetOriginInput {
  bizType?: MediaAssetBizType | string | null;
  sourceType?: MediaAssetSourceType | string | null;
  assetType: MediaAssetType;
  mimeType?: string | null;
  url?: string | null;
  tags?: string[] | null;
}

/**
 * 列表「标签精确过滤」的 SQL 片段与参数（唯一真源，供 TypeORM Raw 使用）。
 *
 * 用途：成片 = 打「口播工坊」标签的生成物。source_type 区分不出来（媒体生成任务同为 media_job），
 * 只能按标签精确匹配。JSON_VALID 兜底历史脏数据：tags 不是合法 JSON 时判 false，
 * 而不是让整条列表查询报错。
 */
export function tagContainsSql(tag: string): { sql: string; params: { tag: string } } {
  return {
    sql: 'JSON_VALID(COALESCE(tags, JSON_ARRAY())) AND JSON_CONTAINS(COALESCE(tags, JSON_ARRAY()), :tag)',
    params: { tag: JSON.stringify(tag) },
  };
}

/** 归一化来源：只认生成类来源，其余（含空值/脏值）一律按用户上传 manual */
function normalizeSourceType(value: string): MediaAssetSourceType {
  return (GENERATED_SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as MediaAssetSourceType)
    : 'manual';
}

export interface AssetOrigin {
  library: MediaAssetLibrary;
  kind: MediaAssetKind;
  sourceType: MediaAssetSourceType;
}

/**
 * 判定一条素材的完整归属：library + kind + sourceType（登记/导入/历史回填共用同一口径）：
 *  1. biz_type=voice_asset → 输入库·声音；biz_type=ip_archive → 输入库·IP 档案；biz_type=avatar → 输入库·形象；
 *  2. source_type ∈ (task|media_job|agent|flow) → 生成库（服务端声明的产出）；
 *  3. 手动登记但带生成标记（edict:// 占位 url、三省六部/口播工坊标签）→ 生成库·精确来源（修历史脏数据）；
 *  4. 其余 → 输入库（用户上传）。
 */
export function resolveAssetOrigin(input: AssetOriginInput): AssetOrigin {
  const sourceType = normalizeSourceType(String(input.sourceType ?? ''));
  if (input.bizType === 'voice_asset') return { library: 'input', kind: 'voice', sourceType };
  if (input.bizType === 'ip_archive') return { library: 'input', kind: 'ip_archive', sourceType };
  if (input.bizType === 'avatar') return { library: 'input', kind: 'avatar', sourceType };
  if ((GENERATED_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return { library: 'output', kind: kindFromAssetType('output', input.assetType), sourceType };
  }
  const marker = generatedSourceType(input);
  if (marker) {
    return { library: 'output', kind: kindFromAssetType('output', input.assetType), sourceType: marker };
  }
  return { library: 'input', kind: kindFromAssetType('input', input.assetType), sourceType };
}
