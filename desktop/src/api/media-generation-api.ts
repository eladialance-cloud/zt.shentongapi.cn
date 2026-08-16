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

// ===== llm-proxy 多模态网关（统一静态 Key 与账单） =====
// 桌面端媒体生成改走网关：与 OpenClaw/Hermes/N8N 同一套鉴权与计费（按后台分类模型定价扣费）。

/** llm-proxy 网关基础地址（与 httpClient 同源） */
const LLM_PROXY_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

/** 网关请求（Bearer 静态 Key；网关响应为 OpenAI 兼容原始 JSON，不走 httpClient 解包） */
async function gatewayFetch(path: string, init: RequestInit & { key: string }): Promise<Response> {
  const { key, ...rest } = init
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((rest.headers as Record<string, string> | undefined) || {}),
    Authorization: 'Bearer ' + key
  }
  return fetch(LLM_PROXY_BASE + path, { ...rest, headers })
}

/** 解析网关响应：非 2xx 时抛出带后端 message 的错误 */
async function parseGatewayResponse(resp: Response, fallback: string): Promise<unknown> {
  const text = await resp.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    // 非 JSON（如二进制），保留原文
  }
  if (!resp.ok) {
    const msg = (() => {
      if (json && typeof json === 'object' && 'message' in json) {
        const m = (json as { message?: unknown }).message
        return Array.isArray(m) ? m.join('；') : String(m)
      }
      return text.slice(0, 300)
    })()
    throw new Error(fallback + '(' + resp.status + '): ' + msg)
  }
  // 网关成功响应同样包了平台全局信封 {code:0,data:...}，解包到 data（失败分支不走到这里）
  if (json && typeof json === 'object' && 'data' in json) {
    const env = json as { code?: number; data?: unknown }
    if (typeof env.code === 'number') json = env.data
  }
  return json
}

/** 文生图/图生图（网关 POST /v1/images/generations，同步） */
export interface GatewayImageResult {
  created: number
  data: Array<{ url?: string; b64_json?: string }>
}

export async function generateImageViaGateway(
  key: string,
  data: { model?: string; prompt: string; size?: string; n?: number },
): Promise<GatewayImageResult> {
  const resp = await gatewayFetch('/llm-proxy/v1/images/generations', {
    key,
    method: 'POST',
    body: JSON.stringify({ model: data.model, prompt: data.prompt, size: data.size, n: data.n ?? 1 }),
    signal: AbortSignal.timeout(180000)
  })
  return (await parseGatewayResponse(resp, '文生图失败')) as GatewayImageResult
}

/** 文生视频（网关 POST /v1/videos/generations，异步任务，返回 MediaJob） */
export async function generateVideoViaGateway(
  key: string,
  data: { model?: string; prompt: string; resolution?: string; duration?: number; fps?: number; inputImages?: string[] },
): Promise<MediaJob> {
  const resp = await gatewayFetch('/llm-proxy/v1/videos/generations', {
    key,
    method: 'POST',
    body: JSON.stringify({
      model: data.model,
      prompt: data.prompt,
      resolution: data.resolution,
      duration: data.duration,
      fps: data.fps,
      inputImages: data.inputImages
    })
  })
  return (await parseGatewayResponse(resp, '文生视频失败')) as MediaJob
}

/** 视频任务查询（网关 GET /v1/videos/generations/:id） */
export async function getVideoJobViaGateway(key: string, id: number): Promise<MediaJob> {
  const resp = await gatewayFetch('/llm-proxy/v1/videos/generations/' + id, { key })
  return (await parseGatewayResponse(resp, '查询视频任务失败')) as MediaJob
}

export default {
  listGenerationModels,
  generateImage,
  generateVideo,
  getMediaJob,
  listMediaJobs,
  generateImageViaGateway,
  generateVideoViaGateway,
  getVideoJobViaGateway,
}
