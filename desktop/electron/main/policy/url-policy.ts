/**
 * url-policy —— 出站 URL 放行策略（安全审计 S-23 / S-41）
 *
 * 解决的问题：主进程代渲染层/云端发起的出站请求（media:fetch-buffer、模型连通性测试）
 * 天然是 SSRF 入口 —— 可探测内网服务、读取云元数据端点（169.254.169.254 / 100.100.100.200）。
 *
 * 设计要点：
 * - 纯函数（只依赖 URL 解析），零网络、零 electron，可直测；
 * - 按「主机分类」而不是「黑名单字符串」判定：先归一化（小写、去首尾点、去 IPv6 方括号），再分类；
 * - IPv4 归一化交给 WHATWG URL 解析器（Node 会把 2130706433 / 0x7f.1 / 0177.0.0.1 都折成 127.0.0.1），
 *   否则这些等价写法可以绕过朴素的字符串比较；
 * - 链路本地/云元数据/未指定地址属于**永不放行**类（即使 allowPrivate=true）；
 * - 残留风险：本策略基于字面主机名，不做 DNS 解析，因此 DNS rebinding 仍可绕过 ——
 *   该风险由网络层出口控制兜底（已记入审计报告）。
 */

export type OutboundDenyReason =
  | 'EMPTY'
  | 'PARSE'
  | 'PROTOCOL'
  | 'PRIVATE_HOST'
  | 'HOST_NOT_ALLOWED'

export type OutboundDecision =
  | { ok: true; url: string }
  | { ok: false; reason: OutboundDenyReason }

export interface OutboundUrlOptions {
  /** 提供了则主机必须命中；'.x.com' 形式表示子域通配 */
  allowedHosts?: ReadonlySet<string>
  /** 是否放行私网/环回（本机自建模型服务等场景）；不影响永不放行类 */
  allowPrivate?: boolean
}

type HostClass = 'public' | 'private' | 'reserved'

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function stripTrailingDot(host: string): string {
  return host.endsWith('.') ? host.slice(0, -1) : host
}

function classifyIpv4(host: string): HostClass {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return 'public'
  const octets = [m[1], m[2], m[3], m[4]].map((s) => Number(s))
  if (octets.some((n) => n > 255)) return 'public'
  const [a, b] = octets
  if (a === 0) return 'reserved' // 0.0.0.0/8「本网络」
  if (a === 127) return 'private'
  if (a === 10) return 'private'
  if (a === 172 && b >= 16 && b <= 31) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 169 && b === 254) return 'reserved' // 链路本地：含 169.254.169.254 云元数据
  if (a === 100 && b >= 64 && b <= 127) return 'reserved' // CGNAT：含 100.100.100.200 元数据
  if (a === 198 && (b === 18 || b === 19)) return 'reserved' // 基准测试网段
  if (a >= 224) return 'reserved' // 组播 224/4 与保留 240/4
  return 'public'
}

function classifyIpv6(host: string): HostClass {
  const v = host.split('%')[0] // 去掉 zone id
  if (v === '::1') return 'private'
  if (v === '::') return 'reserved'
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return 'private' // fc00::/7 ULA
  if (/^fe[89ab][0-9a-f]:/.test(v)) return 'reserved' // fe80::/10 链路本地
  if (/^ff[0-9a-f]{2}:/.test(v)) return 'reserved' // ff00::/8 组播
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return classifyIpv4(mapped[1])
  return 'public'
}

/** 归一化主机名（小写、去 IPv6 方括号、去末尾点） */
export function normalizeHost(host: unknown): string {
  if (typeof host !== 'string') return ''
  return stripTrailingDot(stripBrackets(host.trim().toLowerCase()))
}

function classifyHost(normalizedHost: string): HostClass {
  if (!normalizedHost) return 'reserved'
  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) return 'private'
  if (normalizedHost.includes(':')) return classifyIpv6(normalizedHost)
  return classifyIpv4(normalizedHost)
}

/** 是否为私网 / 环回 / 链路本地 / 元数据 / 保留地址（含等价写法） */
export function isPrivateOrReservedHost(host: unknown): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return false
  return classifyHost(normalized) !== 'public'
}

function matchesAllowedHost(normalizedHost: string, allowed: ReadonlySet<string>): boolean {
  for (const entry of allowed) {
    if (typeof entry !== 'string') continue
    const candidate = normalizeHost(entry)
    if (!candidate) continue
    if (candidate.startsWith('.')) {
      if (normalizedHost.endsWith(candidate)) return true
      continue
    }
    if (normalizedHost === candidate) return true
  }
  return false
}

/** 出站 URL 裁决：协议 / 主机分类 / 可选白名单 */
export function evaluateOutboundUrl(raw: unknown, opts: OutboundUrlOptions = {}): OutboundDecision {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'EMPTY' }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'PARSE' }
  }
  const protocol = url.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return { ok: false, reason: 'PROTOCOL' }

  const host = normalizeHost(url.hostname)
  if (!host) return { ok: false, reason: 'PARSE' }

  const hostClass = classifyHost(host)
  // 链路本地/元数据/未指定：永不放行（永远没有「合法」的业务理由去读云元数据）
  if (hostClass === 'reserved') return { ok: false, reason: 'PRIVATE_HOST' }
  if (hostClass === 'private' && !opts.allowPrivate) return { ok: false, reason: 'PRIVATE_HOST' }
  if (opts.allowedHosts && !matchesAllowedHost(host, opts.allowedHosts)) {
    return { ok: false, reason: 'HOST_NOT_ALLOWED' }
  }
  return { ok: true, url: url.href }
}

// ===== 封面设计器媒体拉取的默认白名单（可选严格模式） =====

/**
 * 自有域名白名单。
 * 说明：封面设计器的图片地址来自用户内容，可能是任意公网图床，因此**默认不启用白名单**
 * （只强制「非私网」）；需要更严的部署可设置 ST_MEDIA_HOST_ALLOWLIST=1 开启，
 * 并用 ST_MEDIA_EXTRA_HOSTS 追加域名（逗号分隔）。
 */
export const DEFAULT_MEDIA_HOSTS: ReadonlySet<string> = new Set([
  'zt.shentongapi.cn',
  'cdn.shentongapi.cn',
  '.shentongapi.cn',
])

function isTruthyFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/** 返回媒体白名单；未开启严格模式时返回 undefined（= 仅要求公网主机） */
export function mediaAllowedHosts(
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> | undefined {
  if (!isTruthyFlag(env?.ST_MEDIA_HOST_ALLOWLIST)) return undefined
  const extra = String(env?.ST_MEDIA_EXTRA_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_MEDIA_HOSTS, ...extra])
}

/** 拒绝原因 → 用户可读文案 */
export function describeOutboundDeny(reason: OutboundDenyReason): string {
  switch (reason) {
    case 'EMPTY':
      return '地址为空'
    case 'PARSE':
      return '地址无法解析'
    case 'PROTOCOL':
      return '仅支持 http/https'
    case 'PRIVATE_HOST':
      return '不允许访问本机/内网/元数据地址'
    case 'HOST_NOT_ALLOWED':
      return '域名不在允许列表内'
    default:
      return '地址被安全策略拒绝'
  }
}
