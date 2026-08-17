#!/usr/bin/env node
/**
 * ST-Claw 创作工具（Hermes 技能脚本）
 * 调用本地 ST-Claw 完成文生图/图生图/文生视频/图生视频。
 * 用法：
 *   node st-claw-controller.mjs --action t2i   --prompt "..." [--model m] [--style anime] [--ratio 16:9]
 *   node st-claw-controller.mjs --action i2i   --prompt "..." --image "C:\ref.png" [--model m] [--ratio 16:9]
 *   node st-claw-controller.mjs --action video --prompt "..." [--image "C:\frame.png"] [--ratio 16:9] [--resolution 720P] [--duration 5]
 *   node st-claw-controller.mjs --action health|config
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const DEFAULT_BASE = process.env.ST_CLAW_BASE_URL || 'http://127.0.0.1:8000'

function arg(name, def = '') {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--' + name + '=')) return a.slice(name.length + 3)
    if (a === '--' + name && i + 1 < process.argv.length) return process.argv[i + 1]
  }
  return def
}

function mimeOf(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
  }
  return map[ext] || 'application/octet-stream'
}

function toUrl(base, rel) {
  if (!rel) return ''
  if (/^https?:\/\//.test(rel)) return rel
  return base + '/code/' + String(rel).replace(/\\/g, '/').replace(/^\/+/, '')
}

async function httpJson(url, opts = {}) {
  let res
  try {
    res = await fetch(url, opts)
  } catch (err) {
    throw new Error('ST-Claw 未运行或无法连接（' + url + '）：' + err.message)
  }
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body || {})
    throw new Error('ST-Claw HTTP ' + res.status + ' ' + url + ': ' + detail)
  }
  return body
}

async function getHealth(base) {
  const body = await httpJson(base + '/api/health')
  return 'ST-Claw 运行正常（status=' + (body && body.status) + '）'
}

async function getConfig(base) {
  const body = await httpJson(base + '/api/config')
  const m = (body && body.config && body.config.models) || {}
  const lines = [
    'ST-Claw 可用模型配置：',
    '  文生图 image_t2i: ' + (m.image_t2i || '（未配置）'),
    '  图生图 image_it2i: ' + (m.image_it2i || '（未配置）'),
    '  图生视频 video_first_frame: ' + (m.video_first_frame || '（未配置）'),
    '  文生视频 video: ' + (m.video || '（未配置）'),
  ]
  return lines.join('\n')
}

async function pickModel(base, kind, explicit) {
  if (explicit) return explicit
  const body = await httpJson(base + '/api/config')
  const m = (body && body.config && body.config.models) || {}
  const fallback = m[kind] || m.image_t2i || m.video || ''
  if (!fallback) throw new Error('ST-Claw 未配置默认' + kind + '模型，请用 --model 指定')
  return fallback
}

async function uploadMedia(base, imagePath) {
  const data = await readFile(imagePath)
  const form = new FormData()
  form.append('file', new Blob([data], { type: mimeOf(imagePath) }), basename(imagePath))
  const body = await httpJson(base + '/api/upload_media', { method: 'POST', body: form })
  if (!body || !body.file_path) throw new Error('ST-Claw 参考图上传失败：' + JSON.stringify(body))
  return body.file_path
}

function listUrls(base, paths) {
  const urls = (paths || []).map((p) => toUrl(base, p)).filter(Boolean)
  if (!urls.length) return []
  return urls
}

async function runT2I(base, opts) {
  const model = await pickModel(base, 'image_t2i', opts.model)
  const payload = { model, prompt: opts.prompt, ratio: opts.ratio || '16:9' }
  if (opts.style) payload.style = opts.style
  const body = await httpJson(base + '/api/sandbox/t2i', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!body || body.success !== true) throw new Error('ST-Claw 文生图失败：' + ((body && body.error) || '未知错误'))
  return { label: '文生图', recordId: body.record_id, urls: listUrls(base, body.result) }
}

async function runI2I(base, opts) {
  if (!opts.image) throw new Error('图生图需要 --image 参考图绝对路径')
  const model = await pickModel(base, 'image_it2i', opts.model)
  const filePath = await uploadMedia(base, opts.image)
  const payload = { model, prompt: opts.prompt, image: filePath, ratio: opts.ratio || '16:9' }
  const body = await httpJson(base + '/api/sandbox/i2i', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!body || body.success !== true) throw new Error('ST-Claw 图生图失败：' + ((body && body.error) || '未知错误'))
  return { label: '图生图', recordId: body.record_id, urls: listUrls(base, body.result) }
}

async function runVideo(base, opts) {
  const model = await pickModel(base, 'video_first_frame', opts.model)
  const payload = {
    model,
    prompt: opts.prompt,
    ratio: opts.ratio || '16:9',
    resolution: opts.resolution || '720P',
    duration: parseInt(opts.duration || '5', 10) || 5,
  }
  if (opts.image) payload.image = await uploadMedia(base, opts.image)
  const body = await httpJson(base + '/api/sandbox/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!body || body.success !== true) throw new Error('ST-Claw 视频生成失败：' + ((body && body.error) || '未知错误'))
  const urls = listUrls(base, [body.video_path].concat(Array.isArray(body.result) ? body.result : []))
  return { label: '视频生成', recordId: body.record_id, urls }
}

function printResult(res) {
  const lines = []
  if (res.recordId) lines.push('ST-Claw ' + res.label + '成功（record_id=' + res.recordId + '）：')
  else lines.push('ST-Claw ' + res.label + '成功：')
  if (res.urls && res.urls.length) {
    res.urls.forEach((u, i) => lines.push('  ' + (i + 1) + '. ' + u))
  } else {
    lines.push('  （未返回产物 URL）')
  }
  lines.push('')
  lines.push('RESULT_JSON=' + JSON.stringify(res))
  return lines.join('\n')
}

async function main() {
  const action = (arg('action') || '').trim().toLowerCase()
  const base = (arg('base-url') || DEFAULT_BASE).replace(/\/+$/, '')
  if (!action) {
    console.error('缺少 --action 参数（health / config / t2i / i2i / video）')
    process.exit(2)
  }
  const opts = {
    prompt: arg('prompt'),
    model: arg('model'),
    image: arg('image'),
    style: arg('style'),
    ratio: arg('ratio'),
    resolution: arg('resolution'),
    duration: arg('duration'),
  }

  let out
  if (action === 'health') {
    out = await getHealth(base)
  } else if (action === 'config') {
    out = await getConfig(base)
  } else if (action === 't2i') {
    if (!opts.prompt.trim()) throw new Error('文生图需要 --prompt')
    out = printResult(await runT2I(base, opts))
  } else if (action === 'i2i') {
    if (!opts.prompt.trim()) throw new Error('图生图需要 --prompt')
    out = printResult(await runI2I(base, opts))
  } else if (action === 'video') {
    if (!opts.prompt.trim()) throw new Error('视频生成需要 --prompt')
    out = printResult(await runVideo(base, opts))
  } else {
    throw new Error('不支持的 --action: ' + action + '（支持 health / config / t2i / i2i / video）')
  }
  console.log(out)
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err))
  process.exit(1)
})