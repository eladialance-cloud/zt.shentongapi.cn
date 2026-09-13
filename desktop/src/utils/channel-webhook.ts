// 渠道回调地址工具：把渠道平台映射到后端真实 Webhook 路由
// 后端路由定义：backend/src/modules/remote/remote.controller.ts
import { channelWebhookPath } from '@/types/channel'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'
/** 后端服务根地址（去掉 /api 后缀），用于拼接回调地址 */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

/** 拼接渠道 Webhook 完整回调地址；该平台无后端路由时返回空串 */
export function resolveChannelWebhookUrl(platform: string): string {
  const p = channelWebhookPath(platform)
  if (!p) return ''
  return `${API_ORIGIN}${p}`
}

export default { API_ORIGIN, resolveChannelWebhookUrl }
