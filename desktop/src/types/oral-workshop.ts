// 口播工坊模块类型定义
// 数据合同真源：backend/src/modules/oral-workshop（controller/dto/service）

/** 任务步骤状态 */
export type OralWorkshopStepStatus = 'pending' | 'running' | 'done' | 'failed'

/** 任务状态 */
export type OralWorkshopJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'

/** 步骤明细（与后端 OralWorkshopJobItem.steps 一致） */
export interface OralWorkshopStepItem {
  step: string
  stepOrder: number
  status: OralWorkshopStepStatus
  resultJson: Record<string, unknown> | null
  error: string | null
  retryCount: number
  startedAt: string | null
  finishedAt: string | null
}

/** 口播工坊任务 */
export interface OralWorkshopJob {
  id: number
  status: OralWorkshopJobStatus
  currentStep: string | null
  scriptInput: string | null
  rewrittenScript: string | null
  persona: string | null
  digitalHumanId: number | null
  voiceId: number | null
  templateId: number | null
  videoUrl: string | null
  audioUrl: string | null
  coverUrl: string | null
  coverH1: string | null
  coverH2: string | null
  coverConfig: string | null
  creditsCost: number
  bilingual: boolean
  targetLang: string | null
  /** 执行模式：auto=自动流水线 / manual=手动逐步 / single=单步执行 */
  executionMode: 'auto' | 'manual' | 'single'
  /** 手动/单步模式下等待用户放行的步骤（null=已放行/自动模式） */
  waitingStep: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  steps: OralWorkshopStepItem[]
}

/** 模板元数据（GET /oral-workshop/templates） */
export interface OralWorkshopTemplateMeta {
  template_id: string
  name: string
  version: string
  description?: string
  preview_video_url?: string
  cover_image_url?: string
  width: number
  height: number
  duration: number
}

/** 创建任务 DTO（与后端 CreateOralWorkshopJobDto 一致） */
export interface CreateOralWorkshopJobDto {
  scriptInput: string
  goal?: string
  targetAudience?: string
  platforms?: string[]
  style?: string
  persona?: string
  digitalHumanId?: number
  voiceId?: number
  templateId?: number
  /** 用户提供的成音（OSS URL 或服务器路径）：有值时 voiceClone 直接采用，不调 TTS */
  audioUrl?: string
  /** 用户提供的数字人/绿幕视频：有值时 digitalHuman 直接采用 */
  videoUrl?: string
  /** 双语字幕：true 时字幕渲染中英双行（LLM 翻译） */
  bilingual?: boolean
  /** 字幕目标语言：zh/留空=纯中文；en 等国际语言或 zh-xx 方言=双语对照字幕（优先级高于 bilingual） */
  targetLang?: string
  /** 执行模式：auto=自动流水线（默认）/ manual=手动逐步 / single=单步执行 */
  executionMode?: 'auto' | 'manual' | 'single'
  clientTxnId?: string
}

/** 任务列表查询 */
export interface OralWorkshopJobQuery {
  page?: number
  pageSize?: number
  status?: OralWorkshopJobStatus
}

/** 任务列表结果 */
export interface OralWorkshopJobListResult {
  list: OralWorkshopJob[]
  total: number
  page: number
  pageSize: number
}

/** 发布包（POST /oral-workshop/jobs/:id/export） */
export interface PublishPackage {
  job_id: number
  video_url: string
  title: string
  subtitle: string
  description: string
  topic_tags: string[]
  cover_url?: string
  suggested_time: string
  target_platforms: string[]
  plan_id?: number
}

/** 我的声音资产（GET/POST /oral-workshop/voices） */
export interface VoiceAsset {
  id: number
  name: string
  refAudioUrl: string
  speakerId: string | null
  status: string
  createdAt: string
}

/** 我的数字人形象（GET/POST /oral-workshop/digital-humans） */
export interface DigitalHumanAsset {
  id: number
  name: string
  cloudId: string
  previewUrl: string | null
  authorized: boolean
  status: string
  createdAt: string
}

/** 选题灵感（POST /oral-workshop/topics） */
export interface TopicItem {
  title: string
  persona_angle?: string
  hook?: string
  viral_logic?: string
}

/** 批量矩阵化建单 DTO（POST /oral-workshop/jobs/batch，与后端 BatchCreateOralWorkshopJobsDto 一致） */
export interface BatchCreateOralWorkshopJobsDto {
  /** 文案/选题列表（每行一条，最多 50 条） */
  topics: string[]
  goal?: string
  targetAudience?: string
  platforms?: string[]
  style?: string
  persona?: string
  /** 模板矩阵（不传 = 默认模板） */
  templateIds?: number[]
  /** 声音矩阵（不传 = 系统语音） */
  voiceIds?: number[]
  /** 形象矩阵（不传 = 上传视频/卡片兜底） */
  digitalHumanIds?: number[]
  audioUrl?: string
  videoUrl?: string
  /** 双语字幕：true 时每个任务字幕渲染中英双行 */
  bilingual?: boolean
  /** 字幕目标语言（批量任务统一生效，优先级高于 bilingual） */
  targetLang?: string
  /** 执行模式（批量任务统一生效） */
  executionMode?: 'auto' | 'manual' | 'single'
  batchTxnId?: string
}

/** 批量建单结果 */
export interface BatchCreateResult {
  total: number
  created: OralWorkshopJob[]
  skipped: number
  errors: Array<{ topic: string; reason: string }>
}

/** 封面设计器配置（与 CoverDesigner 保存的 cover_config JSON 一致） */
export interface CoverDesignConfig {
  templateId: string
  background: 'video-frame' | 'image' | 'color'
  backgroundValue: string
  bgColor: string
  h1: string
  h2: string
  tag?: string
  fontSizeH1: number
  fontSizeH2: number
  h1Color: string
  h2Color: string
  strokeColor: string
  strokeWidth: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  position: 'top' | 'middle' | 'bottom'
}

/** 字幕目标语言目录（与后端 TARGET_LANGS 一致：30 种国际语言 + 9 种中文方言） */
export const SUBTITLE_LANGS: Record<string, string> = {
  // 中文方言（zh-xx 方言双语字幕）
  'zh-SC': '四川话',
  'zh-HK': '粤语',
  'zh-WU': '吴语',
  'zh-DB': '东北话',
  'zh-HA': '河南话',
  'zh-SX': '陕西话',
  'zh-SD': '山东话',
  'zh-TJ': '天津话',
  'zh-MN': '闽南话',
  // 国际语言
  en: '英语',
  ar: '阿拉伯语',
  my: '缅甸语',
  da: '丹麦语',
  nl: '荷兰语',
  fi: '芬兰语',
  fr: '法语',
  de: '德语',
  el: '希腊语',
  he: '希伯来语',
  hi: '印地语',
  id: '印尼语',
  it: '意大利语',
  ja: '日语',
  km: '高棉语',
  ko: '韩语',
  lo: '老挝语',
  ms: '马来语',
  no: '挪威语',
  pl: '波兰语',
  pt: '葡萄牙语',
  ru: '俄语',
  es: '西班牙语',
  sw: '斯瓦希里语',
  sv: '瑞典语',
  tl: '菲律宾语',
  th: '泰语',
  tr: '土耳其语',
  vi: '越南语',
}

/** 字幕语言下拉选项（含"仅中文"前置项） */
export const SUBTITLE_LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'zh', label: '仅中文（默认）' },
  ...Object.entries(SUBTITLE_LANGS).map(([value, label]) => ({ value, label })),
]

/** 字幕语言代码 → 展示名（未收录回退代码本身） */
export function subtitleLangLabel(code: string | null | undefined): string {
  if (!code || code === 'zh') return '仅中文'
  return SUBTITLE_LANGS[code] ?? code
}
