// 文生图/文生视频 API
//
// 端点契约：
//   GET  /media-generation/models        可选生成模型（image/video + 价格 + 参数）
//   POST /media-generation/image        文生图（同步，预扣积分）
//   POST /media-generation/video        文生视频（异步任务）
//   GET  /media-generation/jobs/:id     任务详情（视频轮询）
//   GET  /media-generation/jobs         我的生成记录

import { httpClient } from './http-client'

export type GenerationModelType = 'image' | 'video'

/** 可选生成模型项（后端 GenerationModelItem） */
export interface GenerationModelItem {
  id: string
  name: string
  type: GenerationModelType
  provider: string
  generationParams: GenerationParams
  pricePerImage?: number | null
  videoPrices: Record<string, Record<string, number>>
}

/** 生成参数选项 */
export interface GenerationParams {
  image_sizes?: string[]
  video_resolutions?: string[]
  video_durations?: number[]
  video_fps?: number[]
  [key: string]: unknown
}

export type MediaJobStatus = 'pending' | 'processing' | 'done' | 'failed'

/** 生成任务（后端 MediaJobItem） */
export interface MediaJob {
  id: number
  modelId: string
  type: GenerationModelType
  prompt: string
  params: Record<string, unknown>
  status: MediaJobStatus
  resultUrls: string[]
  creditsCost: number
  error: string | null
  createdAt: string
  updatedAt: string
}

/** 生成模型列表 */
export async function listGenerationModels(): Promise<GenerationModelItem[]> {
  return httpClient.get<GenerationModelItem[]>('/media-generation/models')
}

/** 文生图（同步） */
export async function generateImage(data: {
  modelId: string
  prompt: string
  size?: string
}): Promise<MediaJob> {
  return httpClient.post<MediaJob>('/media-generation/image', data, { timeout: 180000 }) // 上游图片生成可达 120s，避免客户端 30s 超时误判失败后重复扣费
}

/** 文生视频（异步任务） */
export async function generateVideo(data: {
  modelId: string
  prompt: string
  resolution?: string
  duration?: number
  fps?: number
}): Promise<MediaJob> {
  return httpClient.post<MediaJob>('/media-generation/video', data)
}

/** 任务详情 */
export async function getMediaJob(id: number): Promise<MediaJob> {
  return httpClient.get<MediaJob>(`/media-generation/jobs/${id}`)
}

/** 我的生成记录 */
export async function listMediaJobs(query?: {
  page?: number
  pageSize?: number
  type?: GenerationModelType
}): Promise<{ list: MediaJob[]; total: number; page: number; pageSize: number }> {
  return httpClient.get('/media-generation/jobs', { params: query })
}

export default {
  listGenerationModels,
  generateImage,
  generateVideo,
  getMediaJob,
  listMediaJobs,
}
