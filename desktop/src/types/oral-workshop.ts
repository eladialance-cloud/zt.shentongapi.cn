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
  creditsCost: number
  bilingual: boolean
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
  batchTxnId?: string
}

/** 批量建单结果 */
export interface BatchCreateResult {
  total: number
  created: OralWorkshopJob[]
  skipped: number
  errors: Array<{ topic: string; reason: string }>
}
