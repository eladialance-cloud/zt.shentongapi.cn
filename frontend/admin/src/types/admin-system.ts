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
export interface OralWorkshopConfig {
  /** 声音克隆引擎 */
  voiceEngine: 'volcano' | 'local'
  /** 数字人合成引擎 */
  digitalHumanEngine: 'volcano' | 'local'
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
  /** 声音克隆 TTS 接入端点 */
  voiceEndpoint?: string
  /** TTS 模型 ID */
  voiceModel?: string
  /** 声音克隆模型版本：V1=标准 / V2=高清增强 */
  voiceModelVersion?: 'V1' | 'V2'
  /** 默认参考音频 URL（用户未选"我的声音"时兜底） */
  voiceRefAudioUrl?: string
  /** 已训练 speaker_id（优先复用） */
  voiceSpeakerId?: string

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
export type { AdminPaginatedResult }
