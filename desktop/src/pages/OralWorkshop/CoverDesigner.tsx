/**
 * 口播工坊 · 封面设计器（对标参考软件「标题封面-封面设计」）
 * - 背景：视频首帧（任务封面）/ 上传图片 / 纯色
 * - 模板：9 套预设（大字/灰条/金句/描边/渐变/情绪风）
 * - 文本：主标题 h1 + 副标题 h2（可 AI 生成），字号/颜色/描边/字间距/对齐/位置
 * - 实时 1080x1920 canvas 预览（缩放显示）
 * - 保存：渲染 PNG → 上传 → 保存到任务（cover_url + h1/h2 + cover_config）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Col, Input, Modal, Radio, Row, Slider, Upload, message } from 'antd'
import { Download, Save, Sparkles, Upload as UploadIcon, Video } from 'lucide-react'
import { generateCoverTitle, saveJobCover } from '@/api/oral-workshop-api'
import { uploadFile } from '@/api/file-api'
import { resolveMediaUrl } from '@/utils/media'
import type { CoverDesignConfig, OralWorkshopJob } from '@/types/oral-workshop'
import styles from './styles.module.css'


/** 9 套预设模板（版式参考参考软件的「封面设计」模板库） */
interface CoverTemplate {
  id: string
  name: string
  desc: string
  mask: 'none' | 'top' | 'bottom' | 'full'
  h1Color: string
  h2Color: string
  position: 'top' | 'middle' | 'bottom'
  stroke?: string
  bg?: string
}

const COVER_TEMPLATES: CoverTemplate[] = [
  { id: 't1', name: '黄色大字', desc: '居中文字，黄色大字', mask: 'none', h1Color: '#FFE466', h2Color: '#FFFFFF', position: 'middle' },
  { id: 't2', name: '白字黑边', desc: '居中大字，白字黑边', mask: 'none', h1Color: '#FFFFFF', h2Color: '#FFFFFF', stroke: '#000000', position: 'middle' },
  { id: 't3', name: '顶部灰条', desc: '顶部灰条黄白标题，中部卖点，底部金句', mask: 'top', h1Color: '#FFE466', h2Color: '#FFFFFF', position: 'top' },
  { id: 't4', name: '行业解读', desc: '蓝色大字白描边，底部白色斜体副标题，适合行业解读类封面', mask: 'bottom', h1Color: '#4FC3F7', h2Color: '#FFFFFF', position: 'top' },
  { id: 't5', name: '问题方法', desc: '白底黑字问题句，黄底黑字方法句，适合教学干货', mask: 'none', h1Color: '#000000', h2Color: '#000000', bg: '#FFFFFF', position: 'middle' },
  { id: 't6', name: '半透明遮罩', desc: '全屏半透明遮罩，白色大字', mask: 'full', h1Color: '#FFFFFF', h2Color: '#FFFFFF', position: 'middle' },
  { id: 't7', name: '黑底白字', desc: '通屏半透明黑底，白色大字', mask: 'full', h1Color: '#FFFFFF', h2Color: '#DDDDDD', position: 'middle' },
  { id: 't8', name: '薄荷绿渐变', desc: '底部黑色渐变，薄荷绿大标题带', mask: 'bottom', h1Color: '#6EF3B3', h2Color: '#FFFFFF', position: 'bottom' },
  { id: 't9', name: '渐变情绪', desc: '底部高级黑场渐变，配合错落有致的文字，电影感拉满', mask: 'bottom', h1Color: '#FFFFFF', h2Color: '#8FFFF2', position: 'bottom' },
]

const CANVAS_W = 1080
const CANVAS_H = 1920

/** 主进程代理拉取媒体 → 对象 URL（绕过 CORS，canvas 免污染） */
async function mediaToObjectUrl(url: string): Promise<{ url: string; mime: string }> {
  const api = window.electronAPI?.media
  if (api?.fetchBuffer) {
    const { data, mime } = await api.fetchBuffer(url)
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { url: URL.createObjectURL(new Blob([bytes], { type: mime || 'image/png' })), mime: mime || 'image/png' }
  }
  return { url: resolveMediaUrl(url), mime: '' }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/** 逐字绘制（实现字间距 letterSpacing） */
function fillTextSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right',
): void {
  const chars = Array.from(text)
  if (chars.length === 0) return
  const totalW = chars.reduce((w, c) => w + ctx.measureText(c).width + spacing, 0) - spacing
  let startX = x
  if (align === 'center') startX = x - totalW / 2
  else if (align === 'right') startX = x - totalW
  let cx = startX
  for (const c of chars) {
    ctx.fillText(c, cx, y)
    cx += ctx.measureText(c).width + spacing
  }
}

export default function CoverDesigner(props: {
  jobId: number
  videoUrl?: string | null
  coverUrl?: string | null
  coverH1?: string | null
  coverH2?: string | null
  open: boolean
  onClose: () => void
  onSaved: (job: OralWorkshopJob) => void
}) {
  const { jobId, videoUrl, coverUrl, coverH1, coverH2, open, onClose, onSaved } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [config, setConfig] = useState<CoverDesignConfig>({
    templateId: 't1',
    background: 'video-frame',
    backgroundValue: '',
    bgColor: '#0A1628',
    h1: '',
    h2: '',
    tag: '',
    fontSizeH1: 96,
    fontSizeH2: 52,
    h1Color: '#FFE466',
    h2Color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    letterSpacing: 4,
    align: 'center',
    position: 'middle',
  })
  const [bgMedia, setBgMedia] = useState<{ url: string; mime: string } | null>(null)
  const [bgError, setBgError] = useState('')
  const [titleLoading, setTitleLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [exporting, setExporting] = useState(false)

  /** 打开时初始化：标题回填 + 背景（优先任务封面=视频首帧） */
  useEffect(() => {
    if (!open) return
    setConfig((c) => ({
      ...c,
      h1: coverH1 || c.h1,
      h2: coverH2 || c.h2,
      background: coverUrl || videoUrl ? 'video-frame' : 'color',
    }))
  }, [open, coverH1, coverH2, coverUrl, videoUrl])

  /** 背景图拉取：video-frame 用 coverUrl（首帧）→ videoUrl 兜底；image 用上传图 */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const target =
      config.background === 'video-frame' ? coverUrl || videoUrl : config.background === 'image' ? config.backgroundValue : ''
    if (!target) {
      setBgMedia(null)
      setBgError('')
      return
    }
    setBgError('')
    mediaToObjectUrl(resolveMediaUrl(target))
      .then((res) => {
        if (!cancelled) setBgMedia(res)
      })
      .catch((err: Error) => {
        if (!cancelled) setBgError((err as Error)?.message || '背景加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [open, config.background, config.backgroundValue, coverUrl, videoUrl])

  /** 渲染封面到 canvas */
  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    const tpl = COVER_TEMPLATES.find((t) => t.id === config.templateId) ?? COVER_TEMPLATES[0]

    // 1. 背景：纯色 / 图片 / 视频帧
    if (config.background === 'color' || tpl.bg) {
      ctx.fillStyle = tpl.bg || config.bgColor
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }
    if (bgMedia && config.background !== 'color') {
      try {
        if (/video\//.test(bgMedia.mime)) {
          const v = document.createElement('video')
          v.muted = true
          v.playsInline = true
          v.src = bgMedia.url
          await new Promise<void>((resolve, reject) => {
            v.onloadeddata = () => resolve()
            v.onerror = () => reject(new Error('视频加载失败'))
            v.load()
          })
          await new Promise<void>((resolve) => {
            v.onseeked = () => resolve()
            v.currentTime = 0.05
          })
          ctx.drawImage(v, 0, 0, CANVAS_W, CANVAS_H)
        } else {
          const img = await loadImage(bgMedia.url)
          // 等比覆盖（cover）
          const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
          const dw = img.width * scale
          const dh = img.height * scale
          ctx.drawImage(img, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh)
        }
      } catch (err) {
        ctx.fillStyle = config.bgColor
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      }
    }

    // 2. 遮罩（模板）
    const maskGrad = (fromY: number, toY: number, alpha: number) => {
      const g = ctx.createLinearGradient(0, fromY, 0, toY)
      g.addColorStop(0, `rgba(0,0,0,${alpha})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      return g
    }
    if (tpl.mask === 'top') {
      ctx.fillStyle = maskGrad(0, CANVAS_H * 0.42, 0.6)
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H * 0.45)
    } else if (tpl.mask === 'bottom') {
      const g = ctx.createLinearGradient(0, CANVAS_H * 0.55, 0, CANVAS_H)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.68)')
      ctx.fillStyle = g
      ctx.fillRect(0, CANVAS_H * 0.5, CANVAS_W, CANVAS_H * 0.5)
    } else if (tpl.mask === 'full') {
      ctx.fillStyle = 'rgba(0,0,0,0.42)'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }

    // 3. 文本
    const yBase =
      config.position === 'top' ? 300 : config.position === 'bottom' ? CANVAS_H - 420 : CANVAS_H * 0.42
    const xBase = CANVAS_W / 2
    const fontFamily = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
    ctx.textBaseline = 'middle'

    // 标签行（tag，黄色小字带底条）
    if (config.tag?.trim()) {
      ctx.font = `600 40px ${fontFamily}`
      const tagText = config.tag.trim()
      const tagW = ctx.measureText(tagText).width + 56
      const tagH = 64
      const tw = tagW
      const ty = yBase - tagH - 26
      ctx.fillStyle = 'rgba(255,228,102,0.92)'
      ctx.fillRect(xBase - tw / 2, ty, tw, tagH)
      ctx.fillStyle = '#111111'
      ctx.fillText(tagText, xBase, yBase - tagH - 26 + tagH / 2)
    }

    // 主标题 h1
    const h1 = config.h1?.trim() || '口播标题'
    let h1Size = config.fontSizeH1
    if (Array.from(h1).length >= 8) h1Size = Math.round(h1Size * 0.72)
    else if (Array.from(h1).length >= 6) h1Size = Math.round(h1Size * 0.85)
    ctx.font = `800 ${h1Size}px ${fontFamily}`
    ctx.textAlign = 'center'
    const h1Y = yBase + (config.tag?.trim() ? 40 : 0)
    if (config.strokeWidth > 0 && tpl.stroke !== 'none') {
      ctx.lineWidth = config.strokeWidth
      ctx.strokeStyle = config.strokeColor
      ctx.lineJoin = 'round'
      ctx.strokeText(h1, xBase, h1Y)
    }
    ctx.fillStyle = tpl.h1Color || config.h1Color
    fillTextSpaced(ctx, h1, xBase, h1Y, config.letterSpacing, config.align)

    // 副标题 h2
    if (config.h2?.trim()) {
      ctx.font = `600 ${config.fontSizeH2}px ${fontFamily}`
      ctx.fillStyle = tpl.h2Color || config.h2Color
      fillTextSpaced(ctx, config.h2.trim(), xBase, h1Y + h1Size * 0.75 + 16, config.letterSpacing, config.align)
    }
  }, [config, bgMedia])

  useEffect(() => {
    if (open) void render()
  }, [open, render])

  const applyTemplate = (tpl: CoverTemplate) => {
    setConfig((c) => ({
      ...c,
      templateId: tpl.id,
      h1Color: tpl.h1Color,
      h2Color: tpl.h2Color,
      position: tpl.position,
      strokeColor: tpl.stroke || '#000000',
      strokeWidth: tpl.stroke ? 6 : 0,
      bgColor: tpl.bg || c.bgColor,
    }))
  }

  const handleUploadBg = async (file: File) => {
    try {
      const res = await uploadFile(file)
      setConfig((c) => ({ ...c, background: 'image', backgroundValue: res.url }))
      message.success('背景图片已上传')
    } catch (err) {
      message.error('背景上传失败: ' + (err as Error).message)
    }
    return false
  }

  const handleGenerateTitle = async () => {
    setTitleLoading(true)
    try {
      const res = await generateCoverTitle(jobId)
      setConfig((c) => ({ ...c, h1: res.h1, h2: res.h2 }))
      message.success('标题已生成')
    } catch (err) {
      message.error('标题生成失败: ' + (err as Error).message)
    } finally {
      setTitleLoading(false)
    }
  }

  const renderToBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current
      if (!canvas) {
        reject(new Error('画布未就绪'))
        return
      }
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('封面导出失败（画布被污染或浏览器不支持）'))
      }, 'image/png')
    })

  const handleDownload = async () => {
    setExporting(true)
    try {
      await render()
      const blob = await renderToBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cover.png'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      message.error('导出失败: ' + (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setUploadPercent(0)
    try {
      await render()
      const blob = await renderToBlob()
      const file = new File([blob], 'cover.png', { type: 'image/png' })
      const res = await uploadFile(file, (p) => setUploadPercent(p))
      const job = await saveJobCover(jobId, {
        coverUrl: res.url,
        coverH1: config.h1?.trim(),
        coverH2: config.h2?.trim(),
        coverConfig: JSON.stringify(config),
      })
      message.success('封面已保存到任务')
      onSaved(job)
      onClose()
    } catch (err) {
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
      setUploadPercent(0)
    }
  }

  const hasFrame = Boolean(coverUrl || videoUrl)

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="封面设计（标题封面）"
      width={980}
      footer={[
        <Button key="download" icon={<Download size={14} />} onClick={() => void handleDownload()} loading={exporting}>
          导出图片
        </Button>,
        <Button key="close" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" icon={<Save size={14} />} loading={saving} onClick={() => void handleSave()}>
          保存封面{saving ? `（${uploadPercent}%）` : ''}
        </Button>,
      ]}
    >
      <Row gutter={16}>
        <Col span={10}>
          <div className={styles.cdCanvasWrap}>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className={styles.cdCanvas} />
            {bgError && <div className={styles.cdBgError}>背景加载失败：{bgError}</div>}
          </div>
        </Col>
        <Col span={14}>
          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>模板</div>
            <div className={styles.cdTemplateGrid}>
              {COVER_TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className={styles.cdTemplateItem + (config.templateId === t.id ? ' ' + styles.cdTemplateItemActive : '')}
                  onClick={() => applyTemplate(t)}
                  title={t.desc}
                >
                  <div className={styles.cdTemplateName}>{t.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>背景</div>
            <Radio.Group
              value={config.background}
              onChange={(e) => setConfig((c) => ({ ...c, background: e.target.value }))}
            >
              <Radio value="video-frame" disabled={!hasFrame}>
                <Video size={12} /> 视频首帧
              </Radio>
              <Radio value="image">上传图片</Radio>
              <Radio value="color">纯色</Radio>
            </Radio.Group>
            {config.background === 'image' && (
              <Upload accept="image/*" showUploadList={false} beforeUpload={handleUploadBg as never}>
                <Button size="small" icon={<UploadIcon size={13} />} style={{ marginTop: 8 }}>
                  上传背景图片
                </Button>
              </Upload>
            )}
            {config.background === 'color' && (
              <div className={styles.cdColorRow}>
                <input
                  type="color"
                  value={config.bgColor}
                  onChange={(e) => setConfig((c) => ({ ...c, bgColor: e.target.value }))}
                />
                <span>{config.bgColor}</span>
              </div>
            )}
          </div>

          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>
              标题
              <Button size="small" icon={<Sparkles size={12} />} loading={titleLoading} onClick={() => void handleGenerateTitle()} style={{ marginLeft: 8 }}>
                AI 生成标题
              </Button>
            </div>
            <Input
              placeholder="主标题（4-8 字最佳）"
              value={config.h1}
              maxLength={16}
              onChange={(e) => setConfig((c) => ({ ...c, h1: e.target.value }))}
            />
            <Input
              placeholder="副标题（可选，4-8 字）"
              value={config.h2}
              maxLength={24}
              style={{ marginTop: 8 }}
              onChange={(e) => setConfig((c) => ({ ...c, h2: e.target.value }))}
            />
            <Input
              placeholder="卖点标签（可选，如：3 个方法）"
              value={config.tag}
              maxLength={12}
              style={{ marginTop: 8 }}
              onChange={(e) => setConfig((c) => ({ ...c, tag: e.target.value }))}
            />
          </div>

          <div className={styles.cdSection}>
            <div className={styles.cdSectionTitle}>样式</div>
            <div className={styles.cdStyleRow}>
              <span>字号 H1</span>
              <Slider min={48} max={160} value={config.fontSizeH1} onChange={(v) => setConfig((c) => ({ ...c, fontSizeH1: v }))} />
            </div>
            <div className={styles.cdStyleRow}>
              <span>字号 H2</span>
              <Slider min={32} max={96} value={config.fontSizeH2} onChange={(v) => setConfig((c) => ({ ...c, fontSizeH2: v }))} />
            </div>
            <div className={styles.cdStyleRow}>
              <span>字间距</span>
              <Slider min={0} max={24} value={config.letterSpacing} onChange={(v) => setConfig((c) => ({ ...c, letterSpacing: v }))} />
            </div>
            <div className={styles.cdStyleRow}>
              <span>描边</span>
              <Slider min={0} max={16} value={config.strokeWidth} onChange={(v) => setConfig((c) => ({ ...c, strokeWidth: v }))} />
            </div>
            <div className={styles.cdColorRow}>
              <span>描边颜色</span>
              <input type="color" value={config.strokeColor} onChange={(e) => setConfig((c) => ({ ...c, strokeColor: e.target.value }))} />
            </div>
            <div className={styles.cdStyleRow}>
              <span>位置</span>
              <Radio.Group value={config.position} size="small" onChange={(e) => setConfig((c) => ({ ...c, position: e.target.value }))}>
                <Radio.Button value="top">顶部</Radio.Button>
                <Radio.Button value="middle">中部</Radio.Button>
                <Radio.Button value="bottom">底部</Radio.Button>
              </Radio.Group>
            </div>
          </div>
        </Col>
      </Row>
    </Modal>
  )
}