// 媒体工具：把后端相对路径解析为可展示的绝对 URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

export function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`
  return url
}

export function isImageMime(mime: string): boolean {
  return /^image\//.test(mime || '')
}

export function isVideoMime(mime: string): boolean {
  return /^video\//.test(mime || '')
}

export default { resolveMediaUrl, isImageMime, isVideoMime }
