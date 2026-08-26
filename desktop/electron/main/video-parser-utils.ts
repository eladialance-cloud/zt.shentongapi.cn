/**
 * 桌面端本地视频解析器 · 纯工具（对标轻语IP智能体 video-parser）
 * 与 Electron 解耦，便于单元测试：
 *  - extractUrlFromText  从分享文本/口令中提取首个 URL
 *  - detectPlatform      识别平台（douyin/kuaishou/bilibili/xiaohongshu/wx_channels/…）
 *  - validateVideoUrl    校验是否为可解析的 http(s) 链接
 */

export type VideoPlatform =
  | 'direct'
  | 'douyin'
  | 'tiktok'
  | 'kuaishou'
  | 'bilibili'
  | 'xiaohongshu'
  | 'xigua'
  | 'weibo'
  | 'youtube'
  | 'wx_channels'
  | 'unknown'

/** 直链媒体扩展名（对标轻语：^https?:\/\/.*\.(mp4|avi|mov|mkv|wmv|flv|webm)$） */
const DIRECT_MEDIA_EXT = /\.(mp4|avi|mov|mkv|wmv|flv|webm|m4a|mp3|wav|aac)(\?|$)/i

/** 从分享文本/口令中提取第一个 URL */
export function extractUrlFromText(text: string): string | null {
  if (!text) return null
  const t = String(text).trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  const m = t.match(/https?:\/\/[^\s"'<>，。！？；、]+/i)
  return m ? m[0].trim() : null
}

/** 识别链接所属平台（对标轻语平台映射：douyin/kuaishou/bilibili/xiaohongshu/xigua/wx_channels） */
export function detectPlatform(url: string): VideoPlatform {
  const u = String(url || '').toLowerCase()
  if (!u) return 'unknown'
  if (DIRECT_MEDIA_EXT.test(u)) return 'direct'
  if (u.includes('douyin.com')) return 'douyin'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('kuaishou.com')) return 'kuaishou'
  if (u.includes('bilibili.com')) return 'bilibili'
  if (u.includes('xiaohongshu.com')) return 'xiaohongshu'
  if (u.includes('ixigua.com') || u.includes('xigua.com')) return 'xigua'
  if (u.includes('weibo.com')) return 'weibo'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('channels.weixin.qq.com') || u.includes('weixin.qq.com')) return 'wx_channels'
  return 'unknown'
}

/** 校验链接是否可解析：http(s) + 直链或已知平台 */
export function validateVideoUrl(url: string): { ok: boolean; platform: VideoPlatform } {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return { ok: false, platform: 'unknown' }
  const platform = detectPlatform(u)
  if (platform === 'direct' || platform !== 'unknown') return { ok: true, platform }
  return { ok: false, platform }
}

/** 平台展示名（用于错误提示） */
export function platformLabel(platform: VideoPlatform): string {
  const map: Record<VideoPlatform, string> = {
    direct: '视频直链',
    douyin: '抖音',
    tiktok: 'TikTok',
    kuaishou: '快手',
    bilibili: 'B站',
    xiaohongshu: '小红书',
    xigua: '西瓜视频',
    weibo: '微博',
    youtube: 'YouTube',
    wx_channels: '微信视频号',
    unknown: '未知平台',
  }
  return map[platform] || platform
}
