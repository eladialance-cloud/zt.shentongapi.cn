/**
 * llm-endpoint-policy —— 自定义大模型接入端点的信任分级与确认要求（安全审计 S-54）。
 *
 * 背景：设置页允许用户填写任意 OpenAI 兼容 Base URL，主进程会把用户的 API Key
 * 直接发往该地址（`llm-integrations.test` 发 Authorization 头，对话时同样直连）。
 * 也就是说「用户可填的地址」等价于「平台凭据可外发的目标」：填一个攻击者域名，
 * 下一次点「测试连接」就把 Key 交出去了。原实现只校验 `^https?://`。
 *
 * 分级（与 url-policy 分工：这里只做端点信任，不做白名单强制）：
 * - `platform`：命中平台自有域名（含显式追加的运维域名）→ 平台托管，无需确认；
 * - `custom`：其它公网 / 自建内网 / 环回 → 放行，但 `requiresConfirmation: true`，
 *   调用方必须让用户确认「API Key 会发送到该地址」；
 * - 链路本地 / 云元数据 / 广播 / 保留地址 → 永不放行（`BLOCKED_HOST`，自建模型没有理由用它）；
 * - URL 内携带账号密码 → 拒绝（凭据会进日志、进第三方访问日志）。
 *
 * 另给出 `warnings`：明文 http（非环回）时提示「Key 将以明文传输」——
 * 不硬性阻断（自建局域网网关是正常用法），但必须让用户在确认弹窗里看到。
 *
 * 纯函数、零 electron、零网络，可直测。
 */
import { evaluateOutboundUrl, normalizeHost } from './url-policy'

export type LlmEndpointTrust = 'platform' | 'custom'

export type LlmEndpointDenyReason =
  | 'EMPTY'
  | 'PARSE'
  | 'PROTOCOL'
  | 'CREDENTIALS_IN_URL'
  | 'BLOCKED_HOST'

export type LlmEndpointDecision =
  | {
      ok: true
      /** 归一化主机名（小写、去方括号、去末尾点） */
      host: string
      /** 归一化后的 URL（用于确认弹窗与日志展示） */
      url: string
      trust: LlmEndpointTrust
      /** 非平台域名，或明文 http 传输：必须先取得用户确认 */
      requiresConfirmation: boolean
      /** 需要用户知悉的风险提示（明文传输等） */
      warnings: string[]
    }
  | { ok: false; reason: LlmEndpointDenyReason }

/**
 * 平台自有 LLM 网关域名。
 * 与 policy/remote-artifact-policy 同规则：以 `.` 开头表示子域后缀匹配，其余为精确匹配
 * （因此 `shentongapi.cn.evil.com` 不会命中）。
 */
export const DEFAULT_TRUSTED_LLM_HOSTS: readonly string[] = ['shentongapi.cn', '.shentongapi.cn']

/** 运维追加平台域名：ST_LLM_TRUSTED_HOSTS=llm.corp.internal,.corp.internal */
export function trustedLlmHosts(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  const extra = String(env?.ST_LLM_TRUSTED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_TRUSTED_LLM_HOSTS, ...extra])
}

function hostTrusted(host: string, trusted: ReadonlySet<string>): boolean {
  for (const entry of trusted) {
    if (typeof entry !== 'string') continue
    const candidate = normalizeHost(entry)
    if (!candidate) continue
    if (candidate.startsWith('.')) {
      if (host.endsWith(candidate)) return true
      continue
    }
    if (host === candidate) return true
  }
  return false
}

/** 环回主机（明文 http 在环回上不外发，不算传输风险） */
function isLoopbackHost(host: string): boolean {
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1') return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

/**
 * 裁决一个自定义 LLM 端点。
 * 出站判定复用 url-policy（含 IPv4/IPv6 等价写法归一化、链路本地/元数据永不放行）。
 */
export function evaluateLlmEndpoint(
  raw: unknown,
  opts: { trustedHosts?: ReadonlySet<string> } = {},
): LlmEndpointDecision {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'EMPTY' }

  // 先自行解析：url-policy 不检查「URL 内嵌凭据」，而这里是凭据外发场景，必须拦
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'PARSE' }
  }
  if (parsed.username || parsed.password) return { ok: false, reason: 'CREDENTIALS_IN_URL' }

  const decision = evaluateOutboundUrl(raw, { allowPrivate: true })
  if (!decision.ok) {
    switch (decision.reason) {
      case 'EMPTY':
        return { ok: false, reason: 'EMPTY' }
      case 'PARSE':
        return { ok: false, reason: 'PARSE' }
      case 'PROTOCOL':
        return { ok: false, reason: 'PROTOCOL' }
      default:
        // PRIVATE_HOST：链路本地 / 云元数据 / 广播 / 保留地址，没有合法业务理由
        return { ok: false, reason: 'BLOCKED_HOST' }
    }
  }

  const host = normalizeHost(parsed.hostname)
  const trusted = opts.trustedHosts ?? trustedLlmHosts()
  const trust: LlmEndpointTrust = hostTrusted(host, trusted) ? 'platform' : 'custom'

  const warnings: string[] = []
  const insecureTransport = parsed.protocol.toLowerCase() === 'http:' && !isLoopbackHost(host)
  if (insecureTransport) {
    warnings.push('该地址为明文 http，API Key 将以明文经网络传输，可能被中间人窃取')
  }

  return {
    ok: true,
    host,
    url: parsed.href,
    trust,
    // 平台域名默认免确认；但明文 http 属降级，仍要用户拍板
    requiresConfirmation: trust === 'custom' || insecureTransport,
    warnings,
  }
}

/** 拒绝原因 → 用户可读文案 */
export function describeLlmEndpointDeny(reason: LlmEndpointDenyReason): string {
  switch (reason) {
    case 'EMPTY':
      return 'Base URL 不能为空'
    case 'PARSE':
      return 'Base URL 无法解析，请填写完整地址（如 https://api.example.com/v1）'
    case 'PROTOCOL':
      return 'Base URL 必须以 http(s):// 开头'
    case 'CREDENTIALS_IN_URL':
      return 'Base URL 不允许携带账号密码，请改用 API Key 字段'
    case 'BLOCKED_HOST':
      return '不允许指向链路本地/云元数据/保留地址（如 169.254.169.254、100.100.100.200）'
    default:
      return 'Base URL 被安全策略拒绝'
  }
}
