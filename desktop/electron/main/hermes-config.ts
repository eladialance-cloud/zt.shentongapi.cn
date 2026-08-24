/** @file Hermes 本地服务配置生成
 *
 * 职责：
 * - 生成 $HERMES_HOME/config.yaml 的 model 段与 custom_providers 条目，
 *   让 Hermes 推理指向平台 llm-proxy 网关（base_url + 用户静态 Key），
 *   模型 = 平台后台 modelId，用户零配置（解决 "No inference provider configured"）。
 * - 幂等合并：文件已存在则保留用户其它配置（端口/auxiliary/工具等），
 *   仅替换 model 段与 custom_providers 里 base_url 匹配的条目。
 * 纯函数，便于 jest 单测（不依赖 electron）。
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface HermesConfigOptions {
  /** llm-proxy OpenAI 兼容网关地址（如 https://zt.shentongapi.cn/api/llm-proxy/v1） */
  llmProxyBaseUrl: string
  /** 用户 llm-proxy 静态 Key（sk-shentong-...） */
  apiKey: string
  /** 后台 chat 模型 modelId（如 qwen3.8-max） */
  llmModel: string
}

/** 平台托管 provider 名称（写入 custom_providers 条目） */
export const HERMES_PROVIDER_NAME = 'shentong'

/**
 * 平台托管 provider 键：Hermes 运行时只认 "custom:<name>" 形态，
 * 裸 "custom" 在 runtime_provider 解析链里没有兜底（会报 empty API key）。
 */
export const HERMES_PROVIDER_KEY = 'custom:' + HERMES_PROVIDER_NAME

function yamlScalar(value: string): string {
  if (value === '' || /^[#\-~!]|:\s|\n/.test(value)) return JSON.stringify(value)
  return value
}

/** model 段（顶层） */
/** Hermes 单次响应输出上限：模型推理 token 会占满默认 4096，导致规划 JSON 被截断（Response truncated due to output length limit） */
export const HERMES_MAX_OUTPUT_TOKENS = 8192

function buildModelBlock(opts: HermesConfigOptions): string[] {
  return [
    'model:',
    '  provider: ' + yamlScalar(HERMES_PROVIDER_KEY),
    '  default: ' + yamlScalar(opts.llmModel),
    '  max_tokens: ' + HERMES_MAX_OUTPUT_TOKENS,
  ]
}

/** custom_providers 列表项（缩进 2 的 "- " 起头） */
function buildCustomProviderItem(opts: HermesConfigOptions): string[] {
  return [
    '  - name: ' + yamlScalar(HERMES_PROVIDER_NAME),
    '    base_url: ' + yamlScalar(opts.llmProxyBaseUrl),
    '    api_key: ' + yamlScalar(opts.apiKey),
    '    model: ' + yamlScalar(opts.llmModel),
    '    max_output_tokens: ' + HERMES_MAX_OUTPUT_TOKENS,
  ]
}

/** 生成 Hermes $HERMES_HOME/config.yaml 全文（全新安装时使用） */
export function buildHermesConfigYaml(opts: HermesConfigOptions): string {
  return [...buildModelBlock(opts), 'custom_providers:', ...buildCustomProviderItem(opts), ''].join('\n')
}

function indentOf(line: string): number {
  return (line.match(/^(\s*)/) ?? ['', ''])[1].length
}

/** 是否为顶层键（列 0 非空白且不是注释/列表项） */
function isTopLevelKey(line: string): boolean {
  return /^\S/.test(line) && !/^\s*#/.test(line) && !/^-\s/.test(line)
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim()
}

/**
 * 替换/插入顶层 model 段：
 * - 已存在（标量或块）→ 整体替换；
 * - 不存在 → 插入文件顶部。
 */
function patchModelBlock(lines: string[], block: string[]): string[] {
  const idx = lines.findIndex((l) => /^model:\s*/.test(l))
  if (idx < 0) return [...block, ...lines]
  // 标量写法（model: xxx）只占一行；块写法（model:）到下一个顶层键/空行结束
  const rest = lines[idx].replace(/^model:\s*/, '')
  if (rest && !rest.startsWith('#')) return [...lines.slice(0, idx), ...block, ...lines.slice(idx + 1)]
  let end = idx + 1
  while (end < lines.length) {
    const l = lines[end]
    if (!l.trim() || isTopLevelKey(l)) break
    end++
  }
  return [...lines.slice(0, idx), ...block, ...lines.slice(end)]
}

/**
 * 替换/插入 custom_providers 条目：
 * - 已存在 base_url 匹配的条目 → 整体替换（跟随当前用户 Key/模型）；
 * - 存在 custom_providers 段但无匹配 → 列表末尾追加；
 * - 不存在 → 文件末尾追加整个段。
 */
function upsertCustomProviderItem(lines: string[], item: string[], baseUrl: string): string[] {
  const idx = lines.findIndex((l) => /^custom_providers:\s*/.test(l))
  if (idx < 0) {
    const tail = lines.length && lines[lines.length - 1].trim() ? [''] : []
    return [...lines, ...tail, 'custom_providers:', ...item]
  }
  // 内联写法（custom_providers: [] 等）先降为纯键，再按块解析
  if (lines[idx].trim() !== 'custom_providers:') lines[idx] = 'custom_providers:'
  // 段内列表项起点（缩进 2 的 "- "）
  const itemStarts: number[] = []
  let listEnd = lines.length
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    if (indentOf(l) <= 2 && isTopLevelKey(l)) {
      listEnd = i
      break
    }
    if (/^ {2}-\s/.test(l)) itemStarts.push(i)
  }
  for (let k = 0; k < itemStarts.length; k++) {
    const start = itemStarts[k]
    const end = k + 1 < itemStarts.length ? itemStarts[k + 1] : listEnd
    const itemLines = lines.slice(start, end)
    const baseIdx = itemLines.findIndex((l) => /^ {4}base_url:\s*/.test(l))
    const baseVal = baseIdx >= 0 ? stripQuotes(itemLines[baseIdx].replace(/^ {4}base_url:\s*/, '')) : ''
    const normUrl = (v: string) => v.trim().replace(/\/+$/, '')
    if (normUrl(baseVal) === normUrl(baseUrl)) return [...lines.slice(0, start), ...item, ...lines.slice(end)]
  }
  // 未匹配：追加到列表末尾（跳过尾部空行）
  let insertAt = listEnd
  while (insertAt > idx + 1 && !lines[insertAt - 1].trim()) insertAt--
  return [...lines.slice(0, insertAt), ...item, ...lines.slice(insertAt)]
}

/** 对已有 YAML 文本做幂等合并，返回补丁后的全文 */
export function patchHermesConfig(content: string, opts: HermesConfigOptions): string {
  const hadTrailingNL = /(?:\r?\n)$/.test(content)
  let lines = content.split(/\r?\n/)
  lines = patchModelBlock(lines, buildModelBlock(opts))
  lines = upsertCustomProviderItem(lines, buildCustomProviderItem(opts), opts.llmProxyBaseUrl.trim().replace(/\/+$/, ''))
  let out = lines.join('\n')
  if (hadTrailingNL && !/[\r\n]$/.test(out)) out += '\n'
  return out
}

/** 首次写入 $HERMES_HOME/config.yaml；已存在则不覆盖。返回配置文件绝对路径。 */
export function ensureHermesConfig(hermesHome: string, opts: HermesConfigOptions): string {
  const cfgPath = join(hermesHome, 'config.yaml')
  if (existsSync(cfgPath)) return cfgPath
  mkdirSync(hermesHome, { recursive: true })
  writeFileSync(cfgPath, buildHermesConfigYaml(opts), 'utf-8')
  return cfgPath
}

/**
 * 同步 $HERMES_HOME/config.yaml：已存在时只替换 model 段与 base_url 匹配的
 * custom_providers 条目（用户其它配置不受影响）。返回配置文件绝对路径。
 */
export function syncHermesConfig(hermesHome: string, opts: HermesConfigOptions): string {
  const cfgPath = join(hermesHome, 'config.yaml')
  if (!existsSync(cfgPath)) return ensureHermesConfig(hermesHome, opts)
  try {
    const existing = readFileSync(cfgPath, 'utf-8')
    const patched = patchHermesConfig(existing, opts)
    if (patched !== existing) {
      mkdirSync(hermesHome, { recursive: true })
      writeFileSync(cfgPath, patched, 'utf-8')
    }
  } catch (err) {
    console.warn('[hermes-config] sync failed（保留原配置）: ' + (err instanceof Error ? err.message : String(err)))
  }
  return cfgPath
}
