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
  style: string | null
  targetAudience: string | null
  goal: string | null
  /** 语速（0.5-1.5，用户级覆盖后台默认） */
  voiceSpeechRate: number | null
  /** 人声音量增益（-20~20） */
  voiceLoudnessRate: number | null
  /** 情感（高兴/愤怒/悲伤/害怕/平静/无） */
  voiceEmotion: string | null
  /** BGM URL（后台音乐库或自定义） */
  bgmUrl: string | null
  /** BGM 音量（0-1） */
  bgmVolume: number | null
  /** 画中画素材（P3 D4/E6） */
  pipAssets: PipAsset[] | null
  /** 发布状态：unpublish/publishing/success/failed/partial（F5） */
  publishStatus: string | null
  digitalHumanId: number | null
  voiceId: number | null
  voiceSpeakerId: string | null
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
  /** 数字人生成方式（D6）：auto=自动 / cloud=云端火山 / local=本地 */
  dhGenerationMode: 'auto' | 'cloud' | 'local'
  /** 多镜头（D3）：JSON 数组 [{digitalHumanId, seconds}]，长度>1 时多镜头合成 */
  shots: string | null
  /** 字幕轨开关（E7，默认开） */
  subtitlesEnabled: boolean
  /** BGM 轨开关（E7，默认开） */
  bgmEnabled: boolean
  /** E4：字幕文本覆盖（多行，每行一条；留空=自动分段） */
  subtitlesOverride: string | null
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
  /** 语速（0.5-1.5，默认 0.9） */
  voiceSpeechRate?: number
  /** 人声音量增益（-20~20，默认 0） */
  voiceLoudnessRate?: number
  /** 情感（高兴/愤怒/悲伤/害怕/平静/无） */
  voiceEmotion?: string
  /** BGM（后台音乐库条目 URL 或自定义 URL） */
  bgmUrl?: string
  /** BGM 音量（0-1，默认 0.2） */
  bgmVolume?: number
  /** 画中画素材（P3 D4/E6：叠加到成片的图片/视频） */
  pipAssets?: PipAssetInput[]
  digitalHumanId?: number
  voiceId?: number
  /** 任务级官方音色 speaker_id（管理后台音色池选择，覆盖档位默认音色） */
  speakerId?: string
  /** 配音音质档位：V1=标准 / V2=高清（留空=后台默认） */
  voiceModelVersion?: 'V1' | 'V2'
  /** 数字人清晰度档位：V1=标准 / V2=高清（留空=后台默认） */
  dhModelVersion?: 'V1' | 'V2'
  /** 数字人生成方式（D6）：auto=自动 / cloud=云端火山 / local=本地卡片 */
  dhGenerationMode?: 'auto' | 'cloud' | 'local'
  /** 多镜头（D3）：[{digitalHumanId, seconds}]，长度>1 时多镜头合成 */
  shots?: Array<{ digitalHumanId: number; seconds: number }>
  /** 字幕轨开关（E7，默认开） */
  subtitlesEnabled?: boolean
  /** BGM 轨开关（E7，默认开） */
  bgmEnabled?: boolean
  /** E4：字幕文本覆盖（多行，每行一条字幕；留空=自动分段） */
  subtitlesOverride?: string
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
  /** 克隆试听音频 URL（火山复刻 demo_audio，可播放） */
  demoAudio: string | null
  /** 情感参考音频 URL（C6：复刻时附带的情绪素材） */
  emotionRefAudio: string | null
  status: string
  createdAt: string
}

/** 我的数字人形象（GET/POST /oral-workshop/digital-humans） */
export interface DigitalHumanAsset {
  id: number
  name: string
  /** 形象类型（D2）：cloud=火山形象 ID / video=本地上传真人视频 */
  kind: 'cloud' | 'video'
  cloudId: string
  /** 本地视频形象 URL（D2，kind=video 时使用） */
  videoUrl: string | null
  previewUrl: string | null
  /** 形象描述（D1，添加时填写） */
  description: string | null
  authorized: boolean
  status: string
  createdAt: string
}

/** 发布账号（F4a：GET/POST /oral-workshop/publish-accounts） */
export interface PublishAccount {
  id: number
  /** 平台：douyin/kuaishou/xiaohongshu/bilibili/xigua/wx_channels */
  platform: string
  accountName: string
  avatarUrl?: string | null
  /** 状态：pending=待授权 / active=已绑定 / disabled=停用 */
  status: string
  boundAt?: string | null
  remark?: string | null
  createdAt?: string
  /** 扫码登录后回填 */
  displayName?: string | null
  loginStatus?: 'online' | 'expired' | 'offline' | string
  lastLoginAt?: string | null
}

/** 选题灵感（POST /oral-workshop/topics） */
export interface TopicItem {
  title: string
  persona_angle?: string
  hook?: string
  viral_logic?: string
}

/** 对标账号风格分析（POST /oral-workshop/style-analysis） */
export interface StyleAnalysisResult {
  style_analysis: string
  topics: TopicItem[]
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
  /** 批量统一语速（0.5-1.5） */
  voiceSpeechRate?: number
  /** 批量统一音量增益（-20~20） */
  voiceLoudnessRate?: number
  /** 批量统一情感 */
  voiceEmotion?: string
  /** 批量统一 BGM URL */
  bgmUrl?: string
  /** 批量统一 BGM 音量（0-1） */
  bgmVolume?: number
  /** 批量统一画中画素材（P3 D4/E6） */
  pipAssets?: PipAssetInput[]
  /** 模板矩阵（不传 = 默认模板） */
  templateIds?: number[]
  /** 声音矩阵（不传 = 系统语音） */
  voiceIds?: number[]
  /** 形象矩阵（不传 = 上传视频/卡片兜底） */
  digitalHumanIds?: number[]
  /** 批量统一配音音质档位：V1=标准 / V2=高清（留空=后台默认） */
  voiceModelVersion?: 'V1' | 'V2'
  /** 批量统一数字人清晰度档位：V1=标准 / V2=高清（留空=后台默认） */
  dhModelVersion?: 'V1' | 'V2'
  /** 批量统一数字人生成方式（D6） */
  dhGenerationMode?: 'auto' | 'cloud' | 'local'
  /** 批量统一多镜头（D3） */
  shots?: Array<{ digitalHumanId: number; seconds: number }>
  /** 批量统一字幕轨开关（E7，默认开） */
  subtitlesEnabled?: boolean
  /** 批量统一 BGM 轨开关（E7，默认开） */
  bgmEnabled?: boolean
  /** 批量统一字幕文本覆盖（E4） */
  subtitlesOverride?: string
  /** 批量统一官方音色 speaker_id（音色池选择，覆盖档位默认音色） */
  speakerId?: string
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
  /** 标题垂直偏移（D5：正数向下微调，0-400px） */
  titleOffset?: number
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


/** 画中画素材（P3 D4/E6：位置/缩放/时间段） */
export interface PipAsset {
  url: string
  position: 'tl' | 'tr' | 'bl' | 'br' | 'center'
  scale: number
  startSec?: number
  endSec?: number
}

/** 画中画素材输入（创建任务 DTO） */
export interface PipAssetInput {
  url: string
  position?: 'tl' | 'tr' | 'bl' | 'br' | 'center'
  scale?: number
  startSec?: number
  endSec?: number
}

/** 官方音色池条目（GET /oral-workshop/voice-pool） */
export interface VoicePoolItem {
  speakerId: string
  name?: string
  resourceId?: string
}


/** 人设预设（B1：管理后台维护，桌面端展示为可点选 chip） */
export interface PersonaPreset {
  label: string
  value: string
}

/** BGM 库条目（E3：管理后台维护，桌面端创建任务时选择） */
export interface BgmLibraryItem {
  id: string
  name: string
  url: string
  category?: string
}

/** 最近成片预览（F2：工作台预览提交步骤展示） */
export interface RecentJobPreview {
  id: number
  videoUrl: string | null
  coverUrl: string | null
  status: string
}

/** 工作台元数据（GET /oral-workshop/meta） */
export interface OralWorkshopMeta {
  voicePool: VoicePoolItem[]
  pricing: { baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number }
  personaPresets: PersonaPreset[]
  bgmLibrary: BgmLibraryItem[]
  recentJob: RecentJobPreview | null
}

/** 任务统计（GET /oral-workshop/jobs/stats，F3） */
export interface JobStats {
  total: number
  pending: number
  processing: number
  done: number
  failed: number
  cancelled: number
}

/** 发布平台开关（GET/PUT /oral-workshop/publish-platforms，管理后台配置 + 桌面端读取启用列表） */
export interface PublishPlatformItem {
  platform: string
  displayName: string
  enabled: boolean
  sortOrder: number
  remark?: string | null
}

/** 我的发布账号（G：扫码绑定后 login_status/last_login_at/display_name 回填） */


/** 多账号批量发布结果（POST /jobs/:id/publish） */
export interface PublishJobResult {
  planId: number
  publishStatus: string
  summary: string
  results: Array<{ accountId: number; platform: string; status: string }>
}

/** 发布结果回写条目（POST /jobs/:id/publish-result） */
export interface PublishResultItem {
  accountId: number
  platform: string
  status: 'success' | 'failed'
  message?: string
}

/** AI 发布包（POST /jobs/:id/publish-package，对标 529 一键生成标题+描述） */
export interface PublishPackageAi {
  title: string
  subtitle?: string
  description: string
  tags?: string[]
}

/** AI 混剪建议条目（POST /jobs/:id/mix-suggest） */
export interface MixSuggestItem {
  subtitle: string
  keyword: string
  matched: Array<{ materialId: number; name: string; url: string; type: string; score: number }>
  pipAssets: Array<{ url: string; position: 'tl' | 'tr' | 'bl' | 'br' | 'center'; scale: number }>
}

/** IP 大脑档案（对标 ip-brain：主页 URL → 作品列表 → 风格分析） */
export interface IpArchive {
  id: number
  url: string
  title?: string | null
  styleAnalysis?: string | null
  topics?: string | null
  sourceJson?: string | null
  createdAt: string
}
