/**
 * 桌面端本地视频解析器 · 纯工具单元测试（对标轻语 video-parser）
 */
import {
  extractUrlFromText,
  detectPlatform,
  validateVideoUrl,
  platformLabel,
} from '../../electron/main/video-parser-utils'

describe('extractUrlFromText', () => {
  it('直接返回纯 URL', () => {
    expect(extractUrlFromText('https://v.douyin.com/abc123/')).toBe('https://v.douyin.com/abc123/')
  })
  it('从分享口令文本中提取 URL', () => {
    const text = '复制打开抖音，看看大家的视频 https://v.douyin.com/AbCdEf/ 复制此链接'
    expect(extractUrlFromText(text)).toBe('https://v.douyin.com/AbCdEf/')
  })
  it('URL 后跟中文标点也正确截断', () => {
    expect(extractUrlFromText('看看这个视频：https://www.bilibili.com/video/BV1xx，太棒了')).toBe(
      'https://www.bilibili.com/video/BV1xx',
    )
  })
  it('无链接返回 null', () => {
    expect(extractUrlFromText('这是一段没有链接的文本')).toBeNull()
    expect(extractUrlFromText('')).toBeNull()
  })
})

describe('detectPlatform', () => {
  it('识别抖音/短链', () => {
    expect(detectPlatform('https://www.douyin.com/video/123')).toBe('douyin')
    expect(detectPlatform('https://v.douyin.com/abc/')).toBe('douyin')
  })
  it('识别快手/B站/小红书/视频号/西瓜/微博/YouTube', () => {
    expect(detectPlatform('https://v.kuaishou.com/xyz')).toBe('kuaishou')
    expect(detectPlatform('https://www.bilibili.com/video/BV1xx')).toBe('bilibili')
    expect(detectPlatform('https://www.xiaohongshu.com/explore/123')).toBe('xiaohongshu')
    expect(detectPlatform('https://channels.weixin.qq.com/finder-preview/pages/sph?id=xx')).toBe('wx_channels')
    expect(detectPlatform('https://www.ixigua.com/123')).toBe('xigua')
    expect(detectPlatform('https://weibo.com/tv/show/123')).toBe('weibo')
    expect(detectPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
  })
  it('识别视频直链', () => {
    expect(detectPlatform('https://cdn.example.com/a.mp4')).toBe('direct')
    expect(detectPlatform('https://cdn.example.com/a.mp4?sign=1')).toBe('direct')
    expect(detectPlatform('https://cdn.example.com/a.mov')).toBe('direct')
  })
  it('未知平台', () => {
    expect(detectPlatform('https://example.com/page')).toBe('unknown')
  })
})

describe('validateVideoUrl', () => {
  it('直链与已知平台可通过', () => {
    expect(validateVideoUrl('https://cdn.example.com/a.mp4').ok).toBe(true)
    expect(validateVideoUrl('https://v.douyin.com/abc/').ok).toBe(true)
  })
  it('非 http(s) 或未知站点不可通过', () => {
    expect(validateVideoUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateVideoUrl('ftp://x/y.mp4').ok).toBe(false)
    expect(validateVideoUrl('https://example.com/page').ok).toBe(false)
    expect(validateVideoUrl('').ok).toBe(false)
  })
})

describe('platformLabel', () => {
  it('中文展示名', () => {
    expect(platformLabel('douyin')).toBe('抖音')
    expect(platformLabel('wx_channels')).toBe('微信视频号')
    expect(platformLabel('direct')).toBe('视频直链')
  })
})
