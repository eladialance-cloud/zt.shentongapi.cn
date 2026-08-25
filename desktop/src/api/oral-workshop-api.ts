// 口播工坊 API
//
// 端点契约（与后端 src/modules/oral-workshop 一致）：
//   POST   /oral-workshop/jobs            创建任务（预扣 Credits，幂等 clientTxnId）
//   GET    /oral-workshop/jobs            我的任务列表（分页 + 状态筛选）
//   GET    /oral-workshop/jobs/:id        任务详情（含 7 步状态）
//   POST   /oral-workshop/jobs/:id/cancel 取消任务（退还预扣 Credits）
//   POST   /oral-workshop/jobs/:id/export 导出发布包（生成 publish_plans，幂等）
//   GET    /oral-workshop/templates       可用模板列表
//   GET/POST/DELETE /oral-workshop/voices  我的声音资产（参考音频 → 火山克隆）
//   GET/POST/DELETE /oral-workshop/digital-humans  我的数字人形象
//   POST   /oral-workshop/topics           选题灵感（关键词 → 5 个选题）
import { httpClient } from './http-client'
import type {
  BatchCreateOralWorkshopJobsDto,
  BatchCreateResult,
  CreateOralWorkshopJobDto,
  OralWorkshopJob,
  OralWorkshopJobListResult,
  OralWorkshopJobQuery,
  OralWorkshopTemplateMeta,
  PublishPackage,
  TopicItem,
  VoiceAsset,
  DigitalHumanAsset,
  VoicePoolItem,
} from '@/types/oral-workshop'

/**
 * 学习对标：从对标视频 URL 提取口播文案
 * POST /oral-workshop/extract-script  body: { videoUrl }
 */
export async function extractScriptFromVideo(videoUrl: string): Promise<{ text: string }> {
  return httpClient.post<{ text: string }>('/oral-workshop/extract-script', { videoUrl })
}

/**
 * 生成封面标题（主标题+副标题）
 * POST /oral-workshop/jobs/:id/title
 */
export async function generateCoverTitle(jobId: number): Promise<{ h1: string; h2: string }> {
  return httpClient.post<{ h1: string; h2: string }>(`/oral-workshop/jobs/${jobId}/title`)
}

/**
 * 保存封面设计（封面图 URL + 主/副标题 + 配置）
 * POST /oral-workshop/jobs/:id/cover  body: { coverUrl, coverH1?, coverH2?, coverConfig? }
 */
export async function saveJobCover(
  jobId: number,
  payload: { coverUrl: string; coverH1?: string; coverH2?: string; coverConfig?: string }
): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${jobId}/cover`, payload)
}
/** 单条任务预估 Credits（与后端 DEFAULT_ESTIMATED_CREDITS 一致，提交前展示） */
export const ORAL_WORKSHOP_ESTIMATED_CREDITS = 21

/**
 * 创建口播工坊任务
 * POST /oral-workshop/jobs  body: CreateOralWorkshopJobDto
 */
export async function createOralWorkshopJob(
  dto: CreateOralWorkshopJobDto
): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>('/oral-workshop/jobs', dto)
}

/**
 * 我的任务列表
 * GET /oral-workshop/jobs?page=&pageSize=&status=
 */
export async function listOralWorkshopJobs(
  query: OralWorkshopJobQuery = {}
): Promise<OralWorkshopJobListResult> {
  return httpClient.get<OralWorkshopJobListResult>('/oral-workshop/jobs', { params: query })
}

/**
 * 任务详情（含 7 步状态）
 * GET /oral-workshop/jobs/:id
 */
export async function getOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.get<OralWorkshopJob>(`/oral-workshop/jobs/${id}`)
}

/**
 * 手动/单步模式：执行下一步（放行暂停任务）
 * POST /oral-workshop/jobs/:id/advance
 */
export async function advanceOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${id}/advance`)
}

/**
 * 取消任务（退还预扣 Credits）
 * POST /oral-workshop/jobs/:id/cancel
 */
export async function cancelOralWorkshopJob(id: number): Promise<OralWorkshopJob> {
  return httpClient.post<OralWorkshopJob>(`/oral-workshop/jobs/${id}/cancel`)
}

/**
 * 导出发布包（幂等，生成 publish_plans 记录）
 * POST /oral-workshop/jobs/:id/export
 */
export async function exportOralWorkshopPackage(id: number): Promise<PublishPackage> {
  return httpClient.post<PublishPackage>(`/oral-workshop/jobs/${id}/export`)
}

/**
 * 可用模板列表
 * GET /oral-workshop/templates
 */
export async function listOralWorkshopTemplates(): Promise<OralWorkshopTemplateMeta[]> {
  return httpClient.get<OralWorkshopTemplateMeta[]>('/oral-workshop/templates')
}

/**
 * 我的声音列表
 * GET /oral-workshop/voices
 */
/**
 * 官方音色池（管理后台维护，seed-tts-2.0 官方音色）
 * GET /oral-workshop/voice-pool
 */
/**
 * 工作台元数据：官方音色池 + 档位积分定价
 * GET /oral-workshop/meta
 */
export async function getOralWorkshopMeta(): Promise<{
  voicePool: VoicePoolItem[]
  pricing: { baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number }
}> {
  return httpClient.get<{
    voicePool: VoicePoolItem[]
    pricing: { baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number }
  }>('/oral-workshop/meta')
}

export async function getVoicePool(): Promise<VoicePoolItem[]> {
  return httpClient.get<VoicePoolItem[]>('/oral-workshop/voice-pool')
}

export async function listMyVoices(): Promise<VoiceAsset[]> {
  return httpClient.get<VoiceAsset[]>('/oral-workshop/voices')
}

/**
 * 新增声音（参考音频 URL）
 * POST /oral-workshop/voices  body: { name, refAudioUrl }
 */
export async function createMyVoice(payload: { name: string; refAudioUrl: string }): Promise<VoiceAsset> {
  return httpClient.post<VoiceAsset>('/oral-workshop/voices', payload)
}

/**
 * 删除声音
 * DELETE /oral-workshop/voices/:id
 */
export async function deleteMyVoice(id: number): Promise<void> {
  return httpClient.delete<void>('/oral-workshop/voices/' + id)
}

/**
 * 我的数字人形象列表
 * GET /oral-workshop/digital-humans
 */
export async function listMyDigitalHumans(): Promise<DigitalHumanAsset[]> {
  return httpClient.get<DigitalHumanAsset[]>('/oral-workshop/digital-humans')
}

/**
 * 新增数字人形象（火山形象 ID）
 * POST /oral-workshop/digital-humans  body: { name, cloudId }
 */
export async function createMyDigitalHuman(payload: { name: string; cloudId: string }): Promise<DigitalHumanAsset> {
  return httpClient.post<DigitalHumanAsset>('/oral-workshop/digital-humans', payload)
}

/**
 * 删除数字人形象
 * DELETE /oral-workshop/digital-humans/:id
 */
export async function deleteMyDigitalHuman(id: number): Promise<void> {
  return httpClient.delete<void>('/oral-workshop/digital-humans/' + id)
}

/**
 * 选题灵感：关键词 + 人设 → 5 个选题
 * POST /oral-workshop/topics  body: { keywords, persona?, count? }
 */
export async function generateTopics(payload: { keywords: string; persona?: string; count?: number }): Promise<TopicItem[]> {
  return httpClient.post<TopicItem[]>('/oral-workshop/topics', payload)
}

/**
 * 选题 → 口播文案生成：选题灵感选中后自动扩写完整口播文案
 * POST /oral-workshop/script  body: { topic, persona?, reference? }
 */
export async function generateScript(payload: { topic: string; persona?: string; reference?: string }): Promise<{ text: string }> {
  return httpClient.post<{ text: string }>('/oral-workshop/script', payload)
}

/**
 * 批量矩阵化建单（文案 × 模板 × 声音 × 形象，逐单预扣 Credits）
 * POST /oral-workshop/jobs/batch  body: BatchCreateOralWorkshopJobsDto
 */
export async function batchCreateOralWorkshopJobs(dto: BatchCreateOralWorkshopJobsDto): Promise<BatchCreateResult> {
  return httpClient.post<BatchCreateResult>('/oral-workshop/jobs/batch', dto)
}

export default {
  createOralWorkshopJob,
  batchCreateOralWorkshopJobs,
  listOralWorkshopJobs,
  getOralWorkshopJob,
  cancelOralWorkshopJob,
  exportOralWorkshopPackage,
  listOralWorkshopTemplates,
  listMyVoices,
  createMyVoice,
  deleteMyVoice,
  listMyDigitalHumans,
  createMyDigitalHuman,
  deleteMyDigitalHuman,
  generateTopics,
  generateScript,
}
