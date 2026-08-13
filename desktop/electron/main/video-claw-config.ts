/**
 * VideoClaw 本地服务配置生成
 *
 * 职责：
 * - 生成 VideoClaw 后端 backend/config.yaml：所有 provider 指向平台 llm-proxy
 *   （base_url + 用户静态 Key），模型名 = 平台后台 modelId，用户零配置。
 * - 幂等写入：文件已存在则不覆盖（保留用户/系统既有配置）。
 * 纯函数，便于 jest 单测（不依赖 electron）。
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
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
    'project_name: Video-Claw',
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
    '      - ' + q(llmModel),
    '      - ' + q(vlmModel),
    '      - ' + q(imageT2iModel),
    '      - ' + q(imageIt2iModel),
    '      - ' + q(videoFirstFrameModel),
    '      - ' + q(videoStartEndModel),
    '      - ' + q(videoReferenceModel),
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
