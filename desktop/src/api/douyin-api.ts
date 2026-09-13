// 抖音采集/转写前端封装：调用本地 douyin 服务 HTTP API。
// 骨架阶段只读流水线返回 PIPELINE_NOT_READY，发布/评论/私信硬关闭返回 DISABLED。
const DOUYIN_BASE = 'http://127.0.0.1:9030'

export type DouyinResult<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  ok: boolean
  code?: string
  detail?: string
}

export interface DouyinCapabilityMeta {
  title: string
  risk: 'readonly' | 'high'
  stage: string
  params: Record<string, string>
}

export type DouyinCapabilityKey =
  | 'status'
  | 'collect'
  | 'download'
  | 'extract'
  | 'transcribe'
  | 'ingest'
  | 'publish'
  | 'comment'
  | 'dm'

interface RequestInitLike {
  method?: string
  headers?: Record<string, string>
  body?: string
}

async function request<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  init?: RequestInitLike,
): Promise<DouyinResult<T>> {
  try {
    const res = await window.fetch(`${DOUYIN_BASE}${path}`, {
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      method: init?.method,
      body: init?.body,
    })
    if (!res.ok) return { ok: false, code: 'HTTP_ERROR', detail: `HTTP ${res.status}` } as DouyinResult<T>
    return (await res.json()) as DouyinResult<T>
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', detail: err instanceof Error ? err.message : String(err) } as DouyinResult<T>
  }
}

export function douyinHealth(): Promise<DouyinResult<{ service: string; mode: string }>> {
  return request<{ service: string; mode: string }>('/api/health')
}

export function douyinCapabilities(): Promise<DouyinResult<{ capabilities: Record<string, DouyinCapabilityMeta> }>> {
  return request<{ capabilities: Record<string, DouyinCapabilityMeta> }>('/api/douyin/capabilities')
}

export function douyinStatus(): Promise<DouyinResult<{ ready: boolean; login: string }>> {
  return request<{ ready: boolean; login: string }>('/api/douyin/status')
}

export function douyinCollect(payload: Record<string, unknown>): Promise<DouyinResult> {
  return request('/api/douyin/collect', { method: 'POST', body: JSON.stringify(payload) })
}

export function douyinTranscribe(payload: Record<string, unknown>): Promise<DouyinResult> {
  return request('/api/douyin/transcribe', { method: 'POST', body: JSON.stringify(payload) })
}

export function douyinIngest(payload: Record<string, unknown>): Promise<DouyinResult> {
  return request('/api/douyin/ingest', { method: 'POST', body: JSON.stringify(payload) })
}

/** 通用能力调用：按能力名动态访问 /api/douyin/<cap>。 */
export function douyinCall(cap: DouyinCapabilityKey, payload: Record<string, unknown>): Promise<DouyinResult> {
  return request(`/api/douyin/${cap}`, { method: 'POST', body: JSON.stringify(payload) })
}