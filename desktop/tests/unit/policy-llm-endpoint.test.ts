/**
 * llm-endpoint-policy 单测（安全审计 S-54）。
 *
 * 背景：自定义大模型接入让用户填任意 Base URL，主进程会把用户的 API Key 直接发往该地址。
 * 于是「用户可填的地址」= 「平台凭据可外发的目标」，必须做信任分级：
 *   - 平台自有域名 → 平台托管，不需确认；
 *   - 其它公网/自建地址 → 属用户自担风险，但**必须弹窗确认**「Key 会发往该地址」；
 *   - 链路本地 / 云元数据 / 保留地址 → 永不放行（与 url-policy 一致）；
 *   - URL 携带账号密码 → 拒绝（凭据不进日志、不进第三方）。
 * 同时给出「明文 http」告警，供确认弹窗提示 Key 会以明文传输。
 */
import { describe, it, expect } from '@jest/globals'
import {
  DEFAULT_TRUSTED_LLM_HOSTS,
  describeLlmEndpointDeny,
  evaluateLlmEndpoint,
  trustedLlmHosts,
} from '../../electron/main/policy/llm-endpoint-policy'

describe('evaluateLlmEndpoint：平台域名', () => {
  it('平台主域 https → trust=platform 且不需确认', () => {
    const r = evaluateLlmEndpoint('https://shentongapi.cn/api/llm-proxy/v1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.trust).toBe('platform')
    expect(r.requiresConfirmation).toBe(false)
    expect(r.warnings).toEqual([])
  })

  it('平台子域 https → trust=platform（后缀匹配子域）', () => {
    const r = evaluateLlmEndpoint('https://zt.shentongapi.cn/api/llm-proxy/v1')
    expect(r.ok && r.trust).toBe('platform')
  })

  it('大小写与末尾点归一化后仍判为平台', () => {
    const r = evaluateLlmEndpoint('https://ZT.ShentongAPI.cn./v1')
    expect(r.ok && r.trust).toBe('platform')
  })

  it('「主域 + 其它域」的伪装域名不得判为平台', () => {
    for (const raw of [
      'https://shentongapi.cn.evil.com/v1',
      'https://evil-shentongapi.cn/v1',
      'https://notshentongapi.cn/v1',
    ]) {
      const r = evaluateLlmEndpoint(raw)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.trust).toBe('custom')
      expect(r.requiresConfirmation).toBe(true)
    }
  })
})

describe('evaluateLlmEndpoint：自定义端点', () => {
  it('公网第三方 https → custom 且必须确认', () => {
    const r = evaluateLlmEndpoint('https://api.openai.com/v1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.host).toBe('api.openai.com')
    expect(r.trust).toBe('custom')
    expect(r.requiresConfirmation).toBe(true)
  })

  it('自建内网地址放行（allowPrivate）但仍需确认并提示明文', () => {
    const r = evaluateLlmEndpoint('http://192.168.1.10:8000/v1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.trust).toBe('custom')
    expect(r.requiresConfirmation).toBe(true)
    expect(r.warnings.join()).toContain('明文')
  })

  it('本机环回放行（自建 Ollama / vLLM 正常用法）：需确认但不报明文传输', () => {
    const r = evaluateLlmEndpoint('http://127.0.0.1:11434/v1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.trust).toBe('custom')
    expect(r.requiresConfirmation).toBe(true)
    // 环回流量不出本机，没有中间人面，不应制造噪声告警
    expect(r.warnings).toEqual([])
  })

  it('https 自定义端点没有明文告警', () => {
    const r = evaluateLlmEndpoint('https://api.deepseek.com/v1')
    expect(r.ok && r.warnings).toEqual([])
  })

  it('平台域名走 http（公网）也要确认并提示明文', () => {
    const r = evaluateLlmEndpoint('http://zt.shentongapi.cn/v1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.trust).toBe('platform')
    expect(r.requiresConfirmation).toBe(true)
    expect(r.warnings.join()).toContain('明文')
  })
})

describe('evaluateLlmEndpoint：拒绝面', () => {
  it('云元数据 / 链路本地地址永不放行', () => {
    for (const raw of [
      'http://169.254.169.254/latest/meta-data',
      'http://100.100.100.200/latest/meta-data',
      'http://0.0.0.0:8000/v1',
      'http://[fe80::1]/v1',
    ]) {
      const r = evaluateLlmEndpoint(raw)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.reason).toBe('BLOCKED_HOST')
    }
  })

  it('URL 携带账号密码 → 拒绝（凭据不外发）', () => {
    const r = evaluateLlmEndpoint('https://user:pass@api.openai.com/v1')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('CREDENTIALS_IN_URL')
  })

  it('非 http(s) 协议 → 拒绝', () => {
    for (const raw of ['file:///etc/passwd', 'ftp://api.openai.com/v1', 'javascript:alert(1)']) {
      const r = evaluateLlmEndpoint(raw)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.reason).toBe('PROTOCOL')
    }
  })

  it('空值 / 非字符串 → EMPTY；无法解析 → PARSE', () => {
    for (const raw of ['', '   ', null, undefined, 42, {}]) {
      const r = evaluateLlmEndpoint(raw)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.reason).toBe('EMPTY')
    }
    const bad = evaluateLlmEndpoint('not a url')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('PARSE')
  })

  it('fail-closed：任何拒绝都不返回 trust / requiresConfirmation', () => {
    const r = evaluateLlmEndpoint('http://169.254.169.254/v1')
    expect(r.ok).toBe(false)
    expect(Object.keys(r as object)).toEqual(['ok', 'reason'])
  })
})

describe('trustedLlmHosts', () => {
  it('默认包含平台主域与子域通配', () => {
    const hosts = trustedLlmHosts({})
    expect(hosts.has('shentongapi.cn')).toBe(true)
    expect(hosts.has('.shentongapi.cn')).toBe(true)
    expect(DEFAULT_TRUSTED_LLM_HOSTS.length).toBeGreaterThan(0)
  })

  it('ST_LLM_TRUSTED_HOSTS 可追加自建网关（逗号分隔、去空白、小写）', () => {
    const hosts = trustedLlmHosts({ ST_LLM_TRUSTED_HOSTS: ' llm.corp.internal , .corp.internal ' })
    expect(hosts.has('llm.corp.internal')).toBe(true)
    expect(evaluateLlmEndpoint('http://llm.corp.internal/v1', { trustedHosts: hosts }).ok).toBe(true)
    const r = evaluateLlmEndpoint('http://llm.corp.internal/v1', { trustedHosts: hosts })
    expect(r.ok && r.trust).toBe('platform')
  })

  it('可选择不信任平台域名（用于测试隔离）', () => {
    const empty = new Set<string>()
    const r = evaluateLlmEndpoint('https://zt.shentongapi.cn/v1', { trustedHosts: empty })
    expect(r.ok && r.trust).toBe('custom')
  })
})

describe('describeLlmEndpointDeny', () => {
  it('每个 reason 都有非空且互不相同的文案', () => {
    const reasons = ['EMPTY', 'PARSE', 'PROTOCOL', 'CREDENTIALS_IN_URL', 'BLOCKED_HOST'] as const
    const texts = reasons.map((r) => describeLlmEndpointDeny(r))
    for (const t of texts) expect(t.length).toBeGreaterThan(0)
    expect(new Set(texts).size).toBe(reasons.length)
  })
})
