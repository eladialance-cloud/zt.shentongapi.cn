/**
 * 模块来源解析 + 资产校验（A5 三形态 / B1 装 Hermes 渠道，桌面端纯逻辑，可单测）。
 *
 * 支持来源（对齐用户确认的“Hermes 官网 / GitHub / skillHub”安装方式）：
 * - github:owner/repo@ref?path=/skills/xxx   GitHub 仓库指定 tag/分支 + 子路径
 * - url:https://.../pkg.tar.gz               直接下载包
 * - skillhub:<id>                            从 skillHub 按 id 取包
 * - hermes:<id>                              Hermes 官网按 id 取包
 * - file:C:\path\pkg.tar.gz                  本地文件
 *
 * 授权/签名：`verifyModuleAsset` 支持 sha256 或 Ed25519（PEM 公钥）二选一校验。
 * 纯函数，不 import electron，避免循环依赖。
 */

import * as crypto from 'node:crypto'
import type { ModuleKind } from './types'

export type ModuleSourceKind = 'github' | 'url' | 'skillhub' | 'hermes' | 'file'

export interface ModuleSourceSpec {
  kind: ModuleSourceKind
  raw: string
  /** github 专用：owner/repo */
  repoLocator?: string
  /** github/url 专用：tag/ref 或查询 */
  ref?: string
  /** github/url 专用：包内子路径 */
  subpath?: string
  /** url/file/skillhub/hermes 专用：最终下载地址 */
  url?: string
  /** skillhub/hermes 专用：条目 id */
  id?: string
}

/** 解析来源串（不支持/为空抛错；内容一律 trim）。 */
export function parseModuleSource(spec: string): ModuleSourceSpec {
  const s = (spec || '').trim()
  if (!s) throw new Error('模块来源不能为空')
  const sep = s.indexOf(':')
  if (sep === -1) {
    // 无协议前缀：默认当 GitHub locator 处理
    return parseGithub(s)
  }
  const kind = s.slice(0, sep).toLowerCase()
  const rest = s.slice(sep + 1).trim()
  switch (kind) {
    case 'github':
      return parseGithub(rest)
    case 'url':
      return { kind: 'url', raw: s, url: rest }
    case 'skillhub':
      return { kind: 'skillhub', raw: s, id: rest }
    case 'hermes':
      return { kind: 'hermes', raw: s, id: rest }
    case 'file':
      return { kind: 'file', raw: s, url: rest }
    default:
      throw new Error('不支持的模块来源: ' + kind)
  }
}

function parseGithub(rest: string): ModuleSourceSpec {
  if (!rest) throw new Error('GitHub 来源缺少 owner/repo')
  let locator = rest
  let ref: string | undefined
  let subpath: string | undefined
  const q = locator.indexOf('?')
  if (q !== -1) {
    const query = locator.slice(q + 1)
    locator = locator.slice(0, q).trim()
    const m = query.match(/path=([^&]+)/)
    if (m) subpath = decodeURIComponent(m[1]).replace(/^\/+|\/+$/g, '') || undefined
  }
  const at = locator.indexOf('@')
  if (at !== -1) {
    ref = locator.slice(at + 1).trim() || undefined
    locator = locator.slice(0, at).trim()
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(locator)) {
    throw new Error('GitHub 来源格式应为 owner/repo（可选 @tag 与 ?path=...）: ' + rest)
  }
  return { kind: 'github', raw: rest, repoLocator: locator, ref, subpath }
}

/** 把来源规范化成最终下载地址（github 用官方 codeload 归档，默认取 tag/master）。 */
export function resolveDownloadUrl(spec: ModuleSourceSpec): string {
  switch (spec.kind) {
    case 'github': {
      const ref = spec.ref && spec.ref.trim() ? spec.ref.trim() : 'master'
      return `https://codeload.github.com/${spec.repoLocator}/tar.gz/refs/tags/${encodeURIComponent(ref)}`
    }
    case 'url':
    case 'file':
      return spec.url ?? ''
    case 'skillhub':
    case 'hermes':
      // skillhub / hermes 的包 url 目前由后端/配置解析；无配置时返回空，交由调用方报错
      return ''
    default:
      return ''
  }
}

/** 计算整个 Buffer 的 sha256（十六进制）。 */
export function computeAssetSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export interface VerifyAssetOptions {
  /** 期望 sha256（十六进制，忽略大小写） */
  expectedSha256?: string
  /** Ed25519 签名（base64） */
  signature?: string
  /** Ed25519 公钥（PEM 字符串） */
  publicKey?: string
  /** 两者都缺时是否放行；默认 false（要求至少一种校验来源） */
  allowUnverified?: boolean
}

/**
 * 校验模块资产完整性：优先 Ed25519 签名，其次 sha256。
 * 无任何校验依据且 allowUnverified=false 时返回 false（保守拒绝）。
 */
export function verifyModuleAsset(buf: Buffer, opts: VerifyAssetOptions): boolean {
  const sig = opts.signature?.trim()
  const pub = opts.publicKey?.trim()
  if (sig && pub) {
    try {
      return crypto.verify(
        null,
        buf,
        crypto.createPublicKey(pub),
        Buffer.from(sig, 'base64'),
      )
    } catch {
      return false
    }
  }
  const sha = opts.expectedSha256?.trim().toLowerCase()
  if (sha) {
    return computeAssetSha256(buf) === sha
  }
  return !!opts.allowUnverified
}

/** 推导安装形态：来源本身不含形态，交给模块清单；此处仅提供默认去重提示。 */
export function defaultInstallKindForSource(spec: ModuleSourceSpec): ModuleKind | null {
  const lower = (spec.raw || '').toLowerCase()
  if (lower.includes('/skills/') || lower.startsWith('skillhub:')) return 'skill'
  if (lower.includes('/agents/') || lower.startsWith('hermes:')) return 'agent'
  return null
}