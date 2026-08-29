// 管理端系统配置模块类型定义
// 数据合同真源：Task 28 - 系统配置

import type { AdminPaginatedResult } from './admin-auth'

/** 系统配置分区 */
export type SystemConfigSection = 'cache' | 'rate_limit' | 'notification' | 'oral_workshop'

/** 缓存层级 */
export type CacheLayer = 'L1' | 'L2' | 'L3'

/** 缓存配置 */
export interface CacheConfig {
  /** L1 TTL(秒) */
  l1Ttl: number
  /** L2 TTL(Redis,秒) */
  l2Ttl: number
  /** L3 TTL(Qdrant,秒) */
  l3Ttl: number
}

/** 限流配置(按等级) */
export interface RateLimitConfig {
  /** 日调用上限(按等级 1-5) */
  dailyCallLimitByLevel: Record<number, number>
  /** 并发上限 */
  concurrencyLimit: number
  /** 月积分上限(按等级 1-5) */
  monthlyCreditsLimitByLevel: Record<number, number>
}

/** 通知配置 */
export interface NotificationConfig {
  /** 邮件 SMTP 配置 */
  smtp: {
    host: string
    port: number
    username: string
    /** AES 加密存储,前端不回显明文 */
    passwordMasked?: string
    from: string
    enabled: boolean
  }
  /** 短信配置 */
  sms: {
    provider: string
    accessKeyId: string
    accessKeySecretMasked?: string
    signName: string
    enabled: boolean
  }
  /** 客户端推送配置 */
  push: {
    appId: string
    appKeyMasked?: string
    enabled: boolean
  }
}

/** 口播工坊引擎配置 + 火山方舟（云端）模型配置（M8-4/M8-5） */
/** 单档配音配置（V1/V2 分别配对模型/音色/积分） */
export interface VoiceTierConfig {
  /** X-Api-Resource-Id：seed-tts-2.0（官方音色） / seed-icl-2.0（复刻音色） */
  resourceId?: 'seed-tts-2.0' | 'seed-icl-2.0'
  /** 可选模型（如 seed-tts-2.0-standard，留空=服务端默认） */
  model?: string
  /** 档位默认音色 ID */
  speakerId?: string
  /** 档位兜底参考音频 URL（无 speakerId 时克隆用） */
  refAudioUrl?: string
  /** 参考音频对应文本（复刻质量关键） */
  refAudioText?: string
  /** 本档配音积分单价 */
  creditsCost?: number
}

export interface OralWorkshopConfig {
  /** 声音克隆引擎 */
  voiceEngine: 'volcano' | 'local'
  /** 数字人合成引擎 */
  digitalHumanEngine: 'volcano' | 'local' | 'heygen'
  /** 免费档水印开关 */
  watermarkEnabled: boolean
  /** 并发任务上限 */
  maxConcurrentJobs: number
  /** 免费档水印文案 */
  watermarkText?: string

  // ===== LLM 云端 AI 算力（火山方舟为主）=====
  /** LLM 算力来源：volcano=火山方舟（默认，云端）/ custom=自定义 OpenAI 兼容端点 / pool=服务端供应商池 */
  llmSource?: 'volcano' | 'custom' | 'pool'
  /** LLM 接入端点（默认火山方舟 https://ark.cn-beijing.volces.com/api/v3） */
  llmBaseUrl?: string
  /** LLM API Key（火山方舟/自定义端点密钥） */
  llmApiKey?: string
  /** 默认兜底模型（各用途未单独配置时使用） */
  llmModel?: string
  /** 爆款选题模型 */
  topicModel?: string
  /** IP口播文案/营销文案模型 */
  scriptModel?: string
  /** 文案改写模型 */
  rewriteModel?: string
  /** 标题/封面 H1/H2 模型 */
  titleModel?: string
  /** 翻译/双语字幕模型 */
  translateModel?: string
  /** 法务审核模型 */
  reviewModel?: string

  // ===== 火山声音克隆 / TTS（云端）=====
  /** 火山方舟统一 API Key（LLM/声音/数字人共用） */
  volcanoApiKey?: string
  /** TTS 合成端点（HTTP unidirectional，默认 openspeech.bytedance.com/api/v3/tts/unidirectional） */
  voiceEndpoint?: string
  /** V1 档音色 ID（speaker，用户任务选 V1 时使用） */
  voiceModelV1?: string
  /** V2 档音色 ID（speaker，用户任务选 V2 时使用） */
  voiceModelV2?: string
  /** 旧版单一 TTS 模型 ID（兼容兜底） */
  voiceModel?: string
  /** 语音技术 X-Api-Key（语音技术控制台获取，独立于方舟 Key） */
  voiceApiKey?: string
  /** X-Api-Resource-Id：seed-tts-2.0=标准音色 / seed-icl-2.0=复刻音色 */
  voiceResourceId?: 'seed-tts-2.0' | 'seed-icl-2.0'
  /** 声音复刻端点 */
  voiceCloneEndpoint?: string
  /** TTS 音频格式：mp3/pcm/ogg_opus/wav */
  voiceFormat?: string
  /** TTS 采样率 */
  voiceSampleRate?: number
  /** TTS 语速 -50..100 */
  voiceSpeechRate?: number
  /** TTS 音量 -50..100 */
  voiceLoudnessRate?: number
  /** TTS 字幕时间戳 */
  voiceEnableSubtitle?: boolean
  /** 默认参考音频 URL（用户未选"我的声音"时兜底） */
  voiceRefAudioUrl?: string
  /** 已训练 speaker_id（优先复用） */
  voiceSpeakerId?: string
  /** 任务基础积分（文案/标题/封面等 LLM 步骤，默认 5） */
  baseCredits?: number
  /** V1 档配音配置（模型/音色/参考音频/积分 独立配对） */
  voiceTierV1?: VoiceTierConfig
  /** V2 档配音配置 */
  voiceTierV2?: VoiceTierConfig
  /** 数字人 V1 档积分 */
  dhTierV1?: { creditsCost?: number }
  /** 数字人 V2 档积分 */
  dhTierV2?: { creditsCost?: number }
  /** 官方音色池（桌面端展示可选，管理员从火山控制台音色库维护） */
  voicePool?: Array<{ speakerId: string; name?: string; resourceId?: string }>
  /** 音色池批量编辑文本（仅表单用：每行 speaker_id|名称|resourceId，保存时解析为 voicePool） */
  voicePoolText?: string
  /** 人设预设（B1：桌面端 IP 大脑可点选；每项 label=展示名 value=人设描述） */
  personaPresets?: Array<{ label: string; value: string }>
  /** 人设预设批量编辑文本（仅表单用：每行 label|value，保存时解析为 personaPresets） */
  personaPresetsText?: string
  /** BGM 库（E3：桌面端创建任务可选背景音乐） */
  bgmLibrary?: Array<{ id: string; name: string; url: string; category?: string }>
  /** BGM 库批量编辑文本（仅表单用：每行 name|url|category，保存时解析为 bgmLibrary） */
  bgmLibraryText?: string

  // ===== 火山数字人（云端）=====
  /** 数字人服务端点 */
  dhEndpoint?: string
  /** 数字人提交任务路径 */
  dhSubmitPath?: string
  /** 数字人查询任务路径 */
  dhQueryPath?: string
  /** 数字人模型版本：V1=标准 / V2=高清 */
  dhModelVersion?: 'V1' | 'V2'
  /** 默认数字人形象 ID */
  dhDefaultImageId?: string

  // ===== HeyGen 数字人（M4+，替换火山）=====
  /** HeyGen API Key（X-Api-Key，https://app.heygen.com/settings API 获取） */
  heygenApiKey?: string
  /** HeyGen API 端点（默认 https://api.heygen.com） */
  heygenEndpoint?: string
  /** HeyGen 生成质量：720 / 1080（默认 1080） */
  heygenQuality?: '720' | '1080'
  /** HeyGen 默认预置形象 ID（用户未选形象时兜底） */
  heygenDefaultAvatarId?: string

  // ===== 语音识别 / 向量检索 =====
  /** 语音识别引擎：openai=whisper（默认）/ volcano=火山 ASR */
  sttProvider?: 'openai' | 'volcano'
  /** 语音识别模型（默认 whisper-1） */
  sttModel?: string
  /** 向量 embedding 供应商 */
  embeddingProvider?: 'qwen' | 'openai' | 'doubao'
  /** 语音识别接入端点（volcano ASR 用；openai whisper 留空走默认） */
  sttEndpoint?: string
  /** 语音识别 API Key（volcano ASR 专用） */
  sttApiKey?: string
  /** 向量 embedding 接入端点（留空=按供应商默认：doubao 火山方舟/qwen 通义/openai） */
  embeddingEndpoint?: string
  /** 向量 embedding API Key（留空=用 llmApiKey/volcanoApiKey 兜底） */
  embeddingApiKey?: string
  /** 向量 embedding 模型（默认 doubao-embedding-text-240715） */
  embeddingModel?: string
}

/** 系统配置(联合) */
export type SystemConfig = CacheConfig | RateLimitConfig | NotificationConfig | OralWorkshopConfig

/** 清空缓存 DTO */
export interface ClearCacheDto {
  layer: CacheLayer
}

/** 更新系统配置 DTO */
export interface UpdateSystemConfigDto {
  section: SystemConfigSection
  config: Record<string, unknown>
}

/** 租户状态 */
export type TenantStatus = 'active' | 'suspended'

/** 租户条目 */
export interface Tenant {
  id: number
  name: string
  /** 配额 */
  quota: {
    /** 用户数上限 */
    users: number
    /** 调用量上限 */
    calls: number
    /** 存储上限(MB) */
    storage: number
  }
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

/** 新增租户 DTO */
export interface CreateTenantDto {
  name: string
  quota: {
    users: number
    calls: number
    storage: number
  }
}

/** 更新租户 DTO */
export interface UpdateTenantDto {
  name?: string
  quota?: {
    users: number
    calls: number
    storage: number
  }
}

/** 公告类型 */
export type AnnouncementType = 'info' | 'warning' | 'critical'

/** 公告发布范围 */
export type AnnouncementScope = 'all' | 'level_specific'

/** 公告状态 */
export type AnnouncementStatus = 'draft' | 'published'

/** 公告条目 */
export interface Announcement {
  id: number
  title: string
  content: string
  type: AnnouncementType
  /** 发布范围 */
  scope: AnnouncementScope
  /** 指定用户等级(scope=level_specific 时生效,1-5) */
  targetLevel?: number
  /** 是否启用 */
  isActive: boolean
  status: AnnouncementStatus
  /** 发布时间 ISO 8601 */
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

/** 新增公告 DTO */
export interface CreateAnnouncementDto {
  title: string
  content: string
  type: AnnouncementType
  scope: AnnouncementScope
  targetLevel?: number
  isActive: boolean
}

/** 更新公告 DTO */
export interface UpdateAnnouncementDto {
  title?: string
  content?: string
  type?: AnnouncementType
  scope?: AnnouncementScope
  targetLevel?: number
  isActive?: boolean
}

/** 公告查询参数 */
export interface AnnouncementQuery {
  status?: AnnouncementStatus
  page?: number
  pageSize?: number
}

/** 复用通用分页结果 */
/** 口播工坊发布平台开关项（GET/PUT /admin/system/oral-workshop/publish-platforms） */
export interface PublishPlatformItem {
  /** 平台标识（douyin/kuaishou/xiaohongshu/bilibili/xigua/wx_channels） */
  platform: string
  /** 平台显示名 */
  displayName: string
  /** 是否开放给用户扫码绑定 */
  enabled: boolean
  /** 排序（小在前） */
  sortOrder: number
  /** 备注（只读展示） */
  remark?: string | null
}
export type { AdminPaginatedResult }
