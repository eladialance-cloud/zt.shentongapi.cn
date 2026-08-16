/**
 * VideoClaw 本地服务配置生成
 *
 * 职责：
 * - 生成 ST-Claw 后端 backend/config.yaml：所有 provider 指向平台 llm-proxy
 *   （base_url + 用户静态 Key），模型名 = 平台后台 modelId，用户零配置。
 * - llmproxy.models 白名单 = 管理后台 models 表启用模型（后台没有的不出现）。
 * - 幂等写入：文件已存在则不覆盖（保留用户/系统既有配置）。
 * 纯函数，便于 jest 单测（不依赖 electron）。
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface VideoClawConfigOptions {
  /** llm-proxy OpenAI 兼容网关地址（如 https://zt.shentongapi.cn/api/llm-proxy/v1） */
  llmProxyBaseUrl: string
  /** 用户 llm-proxy 静态 Key（sk-shentong-...） */
  apiKey: string
  /** 后台 chat 模型 modelId（如 qwen3.8-max） */
  llmModel: string
  /** 后台 vision 模型 modelId（如 qwen3.8-max） */
  vlmModel: string
  /** 后台文生图模型 modelId（如 qwen-image-3.0） */
  imageT2iModel: string
  /** 后台图生图模型 modelId（如 qwen-image-3.0） */
  imageIt2iModel: string
  /** 首帧生视频模型 modelId（如 wan2.7-i2v） */
  videoFirstFrameModel: string
  /** 首尾帧生视频模型 modelId（如 wan2.7-i2v） */
  videoStartEndModel: string
  /** 参考图生视频模型 modelId（如 wan2.7-r2v） */
  videoReferenceModel: string
  /** 管理后台启用模型列表（llm-proxy /v1/models 返回；用于 llmproxy.models 白名单） */
  platformModels?: Array<{ id: string; type?: string; name?: string; supportsVision?: boolean }>
  style?: string
  videoRatio?: string
  videoResolution?: string
}

/** 平台默认模型映射（与后台 modelId 对齐；视频模型上架后可按需修改） */
export const DEFAULT_VIDEO_CLAW_MODELS = {
  llmModel: 'qwen3.8-max',
  vlmModel: 'qwen3.8-max',
  imageT2iModel: 'qwen-image-3.0',
  imageIt2iModel: 'qwen-image-3.0',
  videoFirstFrameModel: 'wan2.7-i2v',
  videoStartEndModel: 'wan2.7-i2v',
  videoReferenceModel: 'wan2.7-r2v',
} as const

/** llmproxy.models 白名单：优先使用管理后台启用模型；后台拉取为空时降级默认模型 */
function platformWhitelistLines(
  platformModels: Array<{ id: string; type?: string; name?: string; supportsVision?: boolean }>,
  defaults: string[],
): string[] {
  const ids: string[] = []
  for (const m of platformModels) {
    const id = m?.id
    if (id && !ids.includes(id)) ids.push(id)
  }
  const list = ids.length > 0 ? ids : defaults
  return list.map((id) => '      - ' + yamlScalar(id))
}

function yamlScalar(value: string): string {
  // YAML 需引号场景：空值、以 # - ~ ! 开头、含冒号+空格或换行；URL/模型名保持原样
  if (value === '' || /^[#\-~!]|:\s|\n/.test(value)) return JSON.stringify(value)
  return value
}

/** 生成 VideoClaw backend/config.yaml 文本 */
export function buildVideoClawConfigYaml(opts: VideoClawConfigOptions): string {
  const {
    llmProxyBaseUrl,
    apiKey,
    llmModel,
    vlmModel,
    imageT2iModel,
    imageIt2iModel,
    videoFirstFrameModel,
    videoStartEndModel,
    videoReferenceModel,
    style = 'realistic',
    videoRatio = '16:9',
    videoResolution = '720P',
  } = opts
  const q = (v: string) => yamlScalar(v)
  return [
    'project_name: ST-Claw',
    'server:',
    '  host: 127.0.0.1',
    '  port: 8000',
    '  log_level: INFO',
    '  access_log: false',
    'api_providers:',
    '  common:',
    '    print_model_input: false',
    '    proxy: \'\'',
    '  openai:',
    '    api_key: ' + q(apiKey),
    '    base_url: ' + q(llmProxyBaseUrl),
    '    enable_proxy: false',
    '  deepseek:',
    '    api_key: ' + q(apiKey),
    '    base_url: ' + q(llmProxyBaseUrl),
    '    enable_proxy: false',
    '  dashscope:',
    '    api_key: \'\'',
    '    base_url: https://dashscope.aliyuncs.com/api/v1',
    '    enable_proxy: false',
    '  ark:',
    '    api_key: \'\'',
    '    base_url: https://ark.cn-beijing.volces.com/api/v3',
    '    enable_proxy: false',
    '  kling:',
    '    base_url: https://api-beijing.klingai.com',
    '    api_key: \'\'',
    '    enable_proxy: false',
    '  llmproxy:',
    '    api_key: ' + q(apiKey),
    '    base_url: ' + q(llmProxyBaseUrl),
    '    enable_proxy: false',
    '    models:',
    ...platformWhitelistLines(opts.platformModels ?? [], [
      llmModel, vlmModel, imageT2iModel, imageIt2iModel,
      videoFirstFrameModel, videoStartEndModel, videoReferenceModel,
    ]),
    'models:',
    '  llm: ' + q(llmModel),
    '  vlm: ' + q(vlmModel),
    '  image_it2i: ' + q(imageIt2iModel),
    '  image_t2i: ' + q(imageT2iModel),
    '  video: ' + q(videoFirstFrameModel),
    '  video_first_frame: ' + q(videoFirstFrameModel),
    '  video_start_end: ' + q(videoStartEndModel),
    '  video_reference: ' + q(videoReferenceModel),
    'generation:',
    '  style: ' + style,
    '  video_ratio: ' + JSON.stringify(videoRatio),
    '  video_resolution: ' + videoResolution,
    '  video_generation_mode: first_frame',
    '',
  ].join('\n')
}

/** 平台模型条目 */
export interface PlatformModel {
  id: string
  type?: string
  name?: string
  supportsVision?: boolean
}

/**
 * 拉取管理后台启用模型列表（llm-proxy /v1/models）。
 * 失败返回 null（调用方降级为默认模型）。
 */
export async function fetchPlatformModels(
  baseUrl: string,
  apiKey: string,
): Promise<PlatformModel[] | null> {
  if (!apiKey) return null
  try {
    const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/models', {
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { data?: Array<Record<string, unknown>> }
    const list = data?.data ?? []
    return list
      .filter((m) => m && typeof m.id === 'string' && m.id !== 'deep-shentong')
      .map((m) => ({
        id: m.id as string,
        type: (m.type as string) || 'chat',
        name: (m.name as string) || (m.id as string),
        supportsVision: !!m.supports_vision,
      }))
  } catch {
    return null
  }
}

/** 按类型从平台模型里挑选默认值（无则回退默认映射） */
export function pickPlatformModels(
  platformModels: PlatformModel[] | null | undefined,
  defaults: typeof DEFAULT_VIDEO_CLAW_MODELS,
): Pick<
    VideoClawConfigOptions,
    'llmModel' | 'vlmModel' | 'imageT2iModel' | 'imageIt2iModel' | 'videoFirstFrameModel' | 'videoStartEndModel' | 'videoReferenceModel'
  > {
  const list = platformModels ?? []
  const byType = (types: string[]) => list.find((m) => types.includes(String(m.type || '').toLowerCase()))
  const llm = byType(['chat', 'reasoning'])
  const vlm = byType(['chat', 'reasoning', 'vision']) || llm
  const image = byType(['image', 'image_edit', 'image_generation'])
  const video = byType(['video', 't2v', 'i2v', 'r2v'])
  return {
    ...defaults,
    llmModel: llm?.id || defaults.llmModel,
    vlmModel: vlm?.id || defaults.vlmModel,
    imageT2iModel: image?.id || defaults.imageT2iModel,
    imageIt2iModel: image?.id || defaults.imageIt2iModel,
    videoFirstFrameModel: video?.id || defaults.videoFirstFrameModel,
    videoStartEndModel: video?.id || defaults.videoStartEndModel,
    videoReferenceModel: video?.id || defaults.videoReferenceModel,
  }
}

/** 幂等写入 backend/config.yaml；已存在则不覆盖。返回配置文件绝对路径。 */
export function ensureVideoClawConfig(
  backendDir: string,
  opts: VideoClawConfigOptions,
): string {
  const cfgPath = join(backendDir, 'config.yaml')
  if (existsSync(cfgPath)) return cfgPath
  mkdirSync(backendDir, { recursive: true })
  writeFileSync(cfgPath, buildVideoClawConfigYaml(opts), 'utf-8')
  return cfgPath
}

/** 从 YAML 文本里提取 llmproxy.models 白名单模型 ID（仅 llmproxy 段内查找，避免误取其它 provider 的 models 列表） */
export function extractYamlWhitelist(content: string): string[] {
  const lines = content.split(/\r?\n/)
  const indentOf = (l: string): number => (l.match(/^(\s*)/) ?? ['', ''])[1].length
  const llmproxyIdx = lines.findIndex((l) => /^ {0,2}llmproxy:\s*$/.test(l))
  if (llmproxyIdx < 0) return []
  let modelsIdx = -1
  for (let i = llmproxyIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (indentOf(line) <= 2) break // 已离开 llmproxy 段
    if (/^ {4}models:\s*$/.test(line)) {
      modelsIdx = i
      break
    }
  }
  if (modelsIdx < 0) return []
  const ids: string[] = []
  for (let i = modelsIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || indentOf(line) < 6) break
    const m = line.trim().match(/^-\s*(.+)$/)
    if (m) ids.push(m[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return ids
}

/**
 * 仅替换 YAML 中 llmproxy.models 白名单列表，保留其它全部内容（用户端口/Key/生成参数等）。
 * llmproxy 段缺失时返回原文本，不整体重建以免破坏用户配置。
 */
export function patchYamlWhitelist(content: string, ids: string[]): string {
  const lines = content.split(/\r?\n/)
  const indentOf = (l: string): number => (l.match(/^(\s*)/) ?? ['', ''])[1].length
  const llmproxyIdx = lines.findIndex((l) => /^ {0,2}llmproxy:\s*$/.test(l))
  if (llmproxyIdx < 0) return content
  const listLines = ids.map((id) => '      - ' + yamlScalar(id))
  let modelsIdx = -1
  let sectionEnd = lines.length
  for (let i = llmproxyIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (indentOf(line) <= 2) {
      sectionEnd = i
      break
    }
    if (/^ {4}models:\s*$/.test(line)) {
      modelsIdx = i
      break
    }
  }
  if (modelsIdx < 0) {
    // llmproxy 段无 models 键：在段末插入白名单列表
    const before = lines.slice(0, sectionEnd)
    const after = sectionEnd < lines.length ? lines.slice(sectionEnd) : []
    return [...before, '    models:', ...listLines, ...after].join('\n')
  }
  // 替换 models: 之后的列表项（缩进 >= 6 且以 "- " 开头；允许空白行夹在列表中间）
  let endIdx = modelsIdx + 1
  while (endIdx < lines.length) {
    const line = lines[endIdx]
    const trimmed = line.trim()
    if (!trimmed) {
      let j = endIdx + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j < lines.length && indentOf(lines[j]) >= 6 && /^-\s+/.test(lines[j].trimStart())) {
        endIdx++
        continue
      }
      break
    }
    if (indentOf(line) < 6) break
    if (!/^-\s+/.test(trimmed)) break
    endIdx++
  }
  const before = lines.slice(0, modelsIdx)
  const after = lines.slice(endIdx)
  return [...before, '    models:', ...listLines, ...after].join('\n')
}

/**
 * 在 YAML 指定段（如 api_providers.llmproxy / 顶层 models）内替换或新增标量字段。
 * - 段不存在：返回 null（不整份重建，保留用户配置）；
 * - 字段全部一致：返回 null（幂等，不触发重写）；
 * - 有变化：返回替换后的完整文本。
 */
function replaceYamlSectionFields(
  content: string,
  sectionPattern: RegExp,
  fieldIndent: number,
  fields: Record<string, string>,
): string | null {
  const lines = content.split(/\r?\n/)
  const indentOf = (l: string): number => (l.match(/^(\s*)/) ?? ['', ''])[1].length
  const sectionIdx = lines.findIndex((l) => sectionPattern.test(l))
  if (sectionIdx < 0) return null
  const sectionIndent = indentOf(lines[sectionIdx])
  // 段结束位置（缩进回退到 <= 段缩进，或文件尾）
  let endIdx = lines.length
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (indentOf(line) <= sectionIndent) {
      endIdx = i
      break
    }
  }
  const out = [...lines]
  let changed = false
  // 1) 替换段内已有字段
  for (let i = sectionIdx + 1; i < endIdx; i++) {
    const line = out[i]
    const m = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/)
    if (!m || indentOf(line) !== fieldIndent) continue
    const key = m[2]
    if (!(key in fields)) continue
    const newLine = ' '.repeat(fieldIndent) + key + ': ' + yamlScalar(fields[key])
    if (out[i] !== newLine) {
      out[i] = newLine
      changed = true
    }
  }
  // 2) 段内缺失的字段追加到段末（跳过尾部空白行，保持缩进层级）
  const present = new Set<string>()
  for (let i = sectionIdx + 1; i < endIdx; i++) {
    const m = out[i].match(/^(\s*)([A-Za-z0-9_]+):/)
    if (m && indentOf(out[i]) === fieldIndent) present.add(m[2])
  }
  const missing = Object.keys(fields).filter((k) => !present.has(k))
  if (missing.length > 0) {
    let insertAt = endIdx
    while (insertAt > sectionIdx + 1 && !out[insertAt - 1].trim()) insertAt--
    const pad = ' '.repeat(fieldIndent)
    out.splice(insertAt, 0, ...missing.map((k) => pad + k + ': ' + yamlScalar(fields[k])))
    changed = true
  }
  return changed ? out.join('\n') : null
}

/**
 * 同步 backend/config.yaml：已存在时补齐 llmproxy.api_key/base_url、顶层 models 默认值
 * 与 llmproxy.models 白名单（管理后台新增/下架模型、用户重新登录后，重启桌面端或启动视频服务即自动生效；
 * 用户其他配置——端口/风格/第三方 Key——不受影响）。返回配置文件绝对路径。
 */
export function syncVideoClawConfig(
  backendDir: string,
  opts: VideoClawConfigOptions,
): string {
  const cfgPath = join(backendDir, 'config.yaml')
  if (!existsSync(cfgPath)) return ensureVideoClawConfig(backendDir, opts)
  try {
    const existing = readFileSync(cfgPath, 'utf-8')
    const desiredYaml = buildVideoClawConfigYaml(opts)
    let patched = existing

    // 1) llmproxy 段：api_key / base_url 必须跟随当前用户（旧配置 Key 为空 → ST-Claw 拉不到后台模型）
    const llmproxyPatch = replaceYamlSectionFields(patched, /^ {0,2}llmproxy:\s*$/, 4, {
      api_key: opts.apiKey,
      base_url: opts.llmProxyBaseUrl,
    })
    if (llmproxyPatch !== null) patched = llmproxyPatch

    // 2) 顶层 models 段：默认模型跟随后台当前启用模型（旧默认值可能已失效/下架）
    const modelsPatch = replaceYamlSectionFields(patched, /^models:\s*$/, 2, {
      llm: opts.llmModel,
      vlm: opts.vlmModel,
      image_t2i: opts.imageT2iModel,
      image_it2i: opts.imageIt2iModel,
      video_first_frame: opts.videoFirstFrameModel,
      video_start_end: opts.videoStartEndModel,
      video_reference: opts.videoReferenceModel,
    })
    if (modelsPatch !== null) patched = modelsPatch

    // 3) llmproxy.models 白名单（管理后台启用模型；模型不存在于白名单则 ST-Claw 不按 llmproxy 通道路由）
    const desiredWhitelist = extractYamlWhitelist(desiredYaml)
    const whitelistPatch = patchYamlWhitelist(patched, desiredWhitelist)
    if (whitelistPatch !== patched) patched = whitelistPatch

    if (patched !== existing) {
      mkdirSync(backendDir, { recursive: true })
      writeFileSync(cfgPath, patched, 'utf-8')
    }
  } catch (err) {
    console.warn('[video-claw-config] sync failed（保留原配置）: ' + (err instanceof Error ? err.message : String(err)))
  }
  return cfgPath
}

/** 由 service-manager 解析运行时后的 backend 目录 */
export function resolveVideoClawBackendDir(runtimeDir: string): string {
  return join(runtimeDir, 'video-claw', 'video-claw', 'backend')
}

/** 备用：config 目录不在标准位置时探测（防目录结构变化） */
export function probeVideoClawBackendDir(candidates: string[]): string | null {
  for (const c of candidates) {
    if (existsSync(join(c, 'config.yaml')) || existsSync(dirname(c))) return c
  }
  return null
}
