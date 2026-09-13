/**
 * remote-artifact-policy —— 远端技能 / 产物的来源与形态策略（安全审计 S-42）。
 *
 * 背景：技能目录与模块目录是 **Agent 会读取并执行** 的位置。
 * 原实现只校验 URL 前缀是 http(s) 就把远端内容落盘（\`edict-extra.addRemoteSkill\`），
 * 于是「任意 URL → Agent 能力」成为一条持久化通道；再叠加 S-06 的提示注入面即形成落地利用链。
 *
 * 四道闸（fail-closed）：
 * 1. 来源：域名白名单（自有域名 + 代码托管域名 + 运维追加），只允许 https（http 仅环回，本机开发用），
 *    且 URL 内不得携带凭据（避免把口令送进日志与第三方）；
 * 2. 形态：技能文件必须是文本且不超过体积上限（NUL 字节视为二进制）；
 * 3. 归档：解压条目不得绝对路径 / 穿越 / 带盘符 / UNC / NUL；
 * 4. 落地：技能目录内禁止可执行与脚本宿主扩展名。
 *
 * 纯函数、零 electron 依赖；判定与接线分离（接线在 edict-extra / local-content-manager）。
 */
import { normalizeHost, isPrivateOrReservedHost } from './url-policy'

export type RemoteArtifactDenyReason =
  | 'EMPTY'
  | 'PARSE'
  | 'PROTOCOL'
  | 'CREDENTIALS_IN_URL'
  | 'HOST_NOT_ALLOWED'
  | 'EXTENSION_NOT_ALLOWED'
  | 'TOO_LARGE'
  | 'BINARY_CONTENT'
  | 'ARCHIVE_ENTRY_UNSAFE'

export type RemoteArtifactDecision =
  | { ok: true; host: string; url: string }
  | { ok: false; reason: RemoteArtifactDenyReason }

/** 技能正文体积上限（技能是文本指令，正常远小于此） */
export const MAX_SKILL_BYTES = 256 * 1024

/**
 * 默认来源白名单。
 * - 以 \`.\` 开头表示「域名后缀」匹配（覆盖自有域名的全部子域）；
 * - 其余为精确匹配（**不做**后缀匹配，避免 \`github.com.evil.com\` 这种伪装）。
 */
export const DEFAULT_SKILL_SOURCE_HOSTS: readonly string[] = [
  'shentongapi.cn',
  '.shentongapi.cn',
  'github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'gitee.com',
]

/** 技能文件允许的扩展名（文本类） */
export const ALLOWED_SKILL_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt', '.json', '.yaml', '.yml']

/** 技能目录内禁止出现的可执行 / 脚本宿主扩展名 */
export const FORBIDDEN_ARTIFACT_EXTENSIONS: readonly string[] = [
  '.exe', '.dll', '.scr', '.com', '.msi', '.lnk', '.bat', '.cmd', '.vbs', '.vbe', '.hta', '.ps1', '.psm1', '.jar', '.cpl', '.pif',
]

/** 运维追加白名单：ST_SKILL_SOURCE_HOSTS=skills.corp.internal,cdn.example.com */
export function skillSourceHosts(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  const extra = (env.ST_SKILL_SOURCE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_SKILL_SOURCE_HOSTS, ...extra])
}

function extnameOf(pathname: string): string {
  const base = pathname.split('/').pop() || ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/** 环回主机（本机开发场景允许 http） */
function isLoopbackHost(host: string): boolean {
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '[::1]') return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

function hostAllowed(host: string, allowed: ReadonlySet<string>): boolean {
  for (const entry of allowed) {
    if (typeof entry !== 'string' || !entry) continue
    const candidate = entry.toLowerCase()
    if (candidate.startsWith('.')) {
      if (host.endsWith(candidate)) return true
      continue
    }
    if (host === candidate) return true
  }
  return false
}

/**
 * 裁决一个远端技能来源 URL 是否可以下载。
 * fail-closed：任何解析/形态异常都拒绝，不做「修正后再放行」。
 */
export function evaluateRemoteSkillUrl(
  raw: unknown,
  opts: { allowedHosts?: ReadonlySet<string>; requireExtension?: boolean } = {},
): RemoteArtifactDecision {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'EMPTY' }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'PARSE' }
  }
  const protocol = url.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return { ok: false, reason: 'PROTOCOL' }
  if (url.username || url.password) return { ok: false, reason: 'CREDENTIALS_IN_URL' }

  const host = normalizeHost(url.hostname)
  if (!host) return { ok: false, reason: 'PARSE' }
  if (protocol === 'http:' && !isLoopbackHost(host)) return { ok: false, reason: 'PROTOCOL' }

  const allowed = opts.allowedHosts ?? skillSourceHosts()
  if (!hostAllowed(host, allowed) && !isLoopbackHost(host)) return { ok: false, reason: 'HOST_NOT_ALLOWED' }

  if (opts.requireExtension !== false) {
    const ext = extnameOf(url.pathname)
    if (!ALLOWED_SKILL_EXTENSIONS.includes(ext)) return { ok: false, reason: 'EXTENSION_NOT_ALLOWED' }
  }
  return { ok: true, host, url: url.href }
}

/** 技能正文形态校验：非空、文本（无 NUL）、不超上限 */
export function evaluateSkillContent(
  body: unknown,
  maxBytes: number = MAX_SKILL_BYTES,
): { ok: true } | { ok: false; reason: 'EMPTY' | 'TOO_LARGE' | 'BINARY_CONTENT' } {
  if (typeof body !== 'string' || !body.trim()) return { ok: false, reason: 'EMPTY' }
  if (body.includes('\u0000')) return { ok: false, reason: 'BINARY_CONTENT' }
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : MAX_SKILL_BYTES
  if (Buffer.byteLength(body, 'utf8') > limit) return { ok: false, reason: 'TOO_LARGE' }
  return { ok: true }
}

/**
 * 归档条目路径是否安全（tar 穿越守卫）。
 * 拒绝：空、NUL、绝对路径、盘符、UNC、任何一段为 \`..\`。
 */
export function isSafeArchiveEntryPath(entry: unknown): boolean {
  if (typeof entry !== 'string' || !entry) return false
  if (entry.includes('\u0000')) return false
  const normalized = entry.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return false
  if (/^[A-Za-z]:/.test(normalized)) return false
  const segments = normalized.split('/')
  if (segments.some((seg) => seg === '..')) return false
  if (segments.every((seg) => !seg)) return false
  return true
}

/** 安装目录内是否禁止该条目（按 basename 的扩展名判定，大小写不敏感） */
export function isForbiddenArtifactEntryName(name: unknown): boolean {
  if (typeof name !== 'string' || !name.trim()) return false
  const base = name.replace(/\\/g, '/').split('/').pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return false
  return FORBIDDEN_ARTIFACT_EXTENSIONS.includes(base.slice(dot).toLowerCase())
}

/** 提示文案（接线处直接展示给用户 / 日志） */
export function describeRemoteArtifactDeny(reason: RemoteArtifactDenyReason): string {
  switch (reason) {
    case 'EMPTY':
      return '来源地址为空'
    case 'PARSE':
      return '来源地址无法解析'
    case 'PROTOCOL':
      return '只允许 https 来源（本机环回可用 http）'
    case 'CREDENTIALS_IN_URL':
      return '来源地址不允许携带账号密码'
    case 'HOST_NOT_ALLOWED':
      return '来源域名不在白名单内（可用 ST_SKILL_SOURCE_HOSTS 追加）'
    case 'EXTENSION_NOT_ALLOWED':
      return '技能文件扩展名不在白名单内（仅允许 .md/.markdown/.txt/.json/.yaml/.yml）'
    case 'TOO_LARGE':
      return '技能内容超过体积上限（256KB）'
    case 'BINARY_CONTENT':
      return '技能内容不是文本（含 NUL 字节）'
    case 'ARCHIVE_ENTRY_UNSAFE':
      return '压缩包内存在不安全的条目路径'
    default:
      return '来源被拒绝'
  }
}

/** 保留导出：供接线处判断「私网来源」时给出额外提示（不自建仓库时不应出现） */
export { isPrivateOrReservedHost }
