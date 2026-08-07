import { memo } from 'react'
import { Image } from 'antd'
import { resolveMediaUrl } from '@/utils/media'
import styles from './styles.module.css'

// 识别 markdown 图片 ![alt](url)
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
// 识别裸视频 URL（.mp4/.webm/.mov/.m4v/.ogv）
const VIDEO_URL_RE = /((?:https?:\/\/|\/uploads\/)[^\s)]+\.(?:mp4|webm|mov|m4v|ogv)(?:\?[^\s)]*)?)/gi
// 识别裸图片 URL（.png/.jpg/.jpeg/.gif/.webp/.svg/.avif/.bmp）
const IMAGE_URL_RE = /(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:\?[^\s)]*)?)/gi

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; alt: string; url: string }
  | { kind: 'video'; url: string }

/** 把消息内容切成 文本/图片/视频 段 */
function tokenize(content: string): Segment[] {
  const segments: Segment[] = []
  const all: Array<{ start: number; end: number; seg: Segment }> = []

  let m: RegExpExecArray | null
  MARKDOWN_IMAGE_RE.lastIndex = 0
  while ((m = MARKDOWN_IMAGE_RE.exec(content)) !== null) {
    const match = m
    all.push({ start: match.index, end: match.index + match[0].length, seg: { kind: 'image', alt: match[1] || '图片', url: match[2] } })
  }
  VIDEO_URL_RE.lastIndex = 0
  while ((m = VIDEO_URL_RE.exec(content)) !== null) {
    const match = m
    all.push({ start: match.index, end: match.index + match[0].length, seg: { kind: 'video', url: match[1] } })
  }
  IMAGE_URL_RE.lastIndex = 0
  while ((m = IMAGE_URL_RE.exec(content)) !== null) {
    const match = m
    // 避免与 markdown 图片重复渲染（markdown 的 url 也会命中裸链接正则）
    const insideMarkdown = all.some((a) => a.seg.kind === 'image' && match.index >= a.start && match.index < a.end)
    if (!insideMarkdown) {
      all.push({ start: match.index, end: match.index + match[0].length, seg: { kind: 'image', alt: '', url: match[1] } })
    }
  }

  all.sort((a, b) => a.start - b.start || a.end - b.end)
  let cursor = 0
  for (const item of all) {
    if (item.start > cursor) {
      segments.push({ kind: 'text', value: content.slice(cursor, item.start) })
    }
    if (item.start >= cursor) {
      segments.push(item.seg)
      cursor = Math.max(cursor, item.end)
    }
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', value: content.slice(cursor) })
  }
  return segments
}

/**
 * 轻量媒体渲染器：识别消息里的 markdown 图片 / 视频链接 / 裸图片链接并内嵌渲染
 * 不引入 markdown 库（避免新增依赖），只处理媒体场景
 */
function MediaRendererImpl({ content, compact = false }: { content: string; compact?: boolean }) {
  const segments = tokenize(content)
  return (
    <span className={styles.mediaRenderer}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return (
            <span key={i} className={styles.text}>
              {seg.value}
            </span>
          )
        }
        if (seg.kind === 'video') {
          return (
            <video
              key={i}
              className={styles.video}
              src={resolveMediaUrl(seg.url)}
              controls
              preload="metadata"
              style={compact ? { maxHeight: 160 } : undefined}
            />
          )
        }
        return (
          <Image
            key={i}
            className={styles.image}
            src={resolveMediaUrl(seg.url)}
            alt={seg.alt || '图片'}
            width={compact ? 160 : 240}
            preview={{ mask: '查看大图' }}
          />
        )
      })}
    </span>
  )
}

export const MediaRenderer = memo(MediaRendererImpl)
export default MediaRenderer
