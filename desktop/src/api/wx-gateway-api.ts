// 微信域桥前端封装：调用本地 wx-gateway 服务 HTTP API。
// 后端为开源 wxauto（MIT），服务默认 disabled；未装后端时各能力返回 BACKEND_MISSING 等结构化错误码，此处仅做类型化封装。
const WX_GATEWAY_BASE = 'http://127.0.0.1:9020'

export type WxGatewayResult<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  ok: boolean
  code?: string
  detail?: string
}

export interface WxGatewayCapabilityMeta {
  title: string
  risk: 'readonly' | 'high'
  /** open = 开源后端已实现；unavailable = 开源后端不提供（返回 CAPABILITY_UNAVAILABLE） */
  backend: 'open' | 'unavailable'
  params: Record<string, string>
}

export type WxGatewayCapabilityKey =
  | 'status'
  | 'send'
  | 'friends'
  | 'add_friend'
  | 'moments'
  | 'moments_publish'
  | 'group'
  | 'listen'

interface RequestInitLike {
  method?: string
  headers?: Record<string, string>
  body?: string
}

async function request<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  init?: RequestInitLike,
): Promise<WxGatewayResult<T>> {
  try {
    const res = await window.fetch(`${WX_GATEWAY_BASE}${path}`, {
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      method: init?.method,
      body: init?.body,
    })
    if (!res.ok) return { ok: false, code: 'HTTP_ERROR', detail: `HTTP ${res.status}` } as WxGatewayResult<T>
    return (await res.json()) as WxGatewayResult<T>
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', detail: err instanceof Error ? err.message : String(err) } as WxGatewayResult<T>
  }
}

/** /api/health 响应：服务信息 + 后端自述（backend 缺失也可用）。用 type 而非 interface，以兼容 WxGatewayResult 的 Record 约束。 */
export type WxGatewayHealthInfo = {
  service: string
  backend: string
  backend_license: string
  backend_available: boolean
  backend_reason: string
}

export function wxGatewayHealth(): Promise<WxGatewayResult<WxGatewayHealthInfo>> {
  return request<WxGatewayHealthInfo>('/api/health')
}

export function wxGatewayCapabilities(): Promise<WxGatewayResult<{ capabilities: Record<string, WxGatewayCapabilityMeta> }>> {
  return request<{ capabilities: Record<string, WxGatewayCapabilityMeta> }>('/api/wx/capabilities')
}

export function wxGatewayStatus(): Promise<WxGatewayResult<{ connected: boolean }>> {
  return request<{ connected: boolean }>('/api/wx/status')
}

export function wxGatewaySend(payload: Record<string, unknown>): Promise<WxGatewayResult<{ code?: string }>> {
  return request<{ code?: string }>('/api/wx/send', { method: 'POST', body: JSON.stringify(payload) })
}

export function wxGatewayFriends(payload?: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/friends', payload ? { method: 'POST', body: JSON.stringify(payload) } : undefined)
}

export function wxGatewayAddFriend(payload: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/add_friend', { method: 'POST', body: JSON.stringify(payload) })
}

export function wxGatewayMoments(payload?: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/moments', payload ? { method: 'POST', body: JSON.stringify(payload) } : undefined)
}

export function wxGatewayMomentsPublish(payload: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/moments_publish', { method: 'POST', body: JSON.stringify(payload) })
}

export function wxGatewayGroup(payload: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/group', { method: 'POST', body: JSON.stringify(payload) })
}

export function wxGatewayListen(payload?: Record<string, unknown>): Promise<WxGatewayResult> {
  return request('/api/wx/listen', payload ? { method: 'POST', body: JSON.stringify(payload) } : undefined)
}

/** 通用能力调用：按能力名动态访问 /api/wx/<cap>。 */
export function wxGatewayCall(cap: WxGatewayCapabilityKey, payload: Record<string, unknown>): Promise<WxGatewayResult> {
  return request(`/api/wx/${cap}`, { method: 'POST', body: JSON.stringify(payload) })
}