// 媒体工具：把后端相对路径解析为可展示的绝对 URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

export function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`
  return url
}

/** 素材物理类型（与 @/api/media-asset-api 的 MediaAssetType 一致，避免 utils → api 的反向依赖） */
export type InferredAssetType = 'image' | 'video' | 'audio' | 'file'

/** 由 MIME 推断素材类型（上传入库时统一口径：image/video/audio 之外一律 file） */
export function inferAssetTypeFromMime(mime: string): InferredAssetType {
  if (!mime) return 'file'
  if (/^image\//.test(mime)) return 'image'
  if (/^video\//.test(mime)) return 'video'
  if (/^audio\//.test(mime)) return 'audio'
  return 'file'
}

export function isImageMime(mime: string): boolean {
  return /^image\//.test(mime || '')
}

export function isVideoMime(mime: string): boolean {
  return /^video\//.test(mime || '')
}

export default { resolveMediaUrl, isImageMime, isVideoMime, inferAssetTypeFromMime }
