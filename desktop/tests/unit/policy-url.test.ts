// 出站 URL 策略（安全审计 S-23 / S-41）
// 关键点：不仅挡住字面私网 IP，还要挡住 Node URL 解析器归一化后的等价写法，
// 以及「末尾点」这类容易绕过字符串比较的写法。
import { evaluateOutboundUrl, isPrivateOrReservedHost } from '../../electron/main/policy/url-policy'

describe('isPrivateOrReservedHost', () => {
  it('识别回环 / 私网 / 链路本地 / 元数据 / 未指定地址', () => {
    const priv = [
      'localhost',
      'LOCALHOST',
      'foo.localhost',
      'localhost.',
      '127.0.0.1',
      '127.1.2.3',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.9.9',
      '192.168.1.1',
      '169.254.169.254',
      '100.100.100.200',
      '0.0.0.0',
      '::1',
      '[::1]',
      'fd00::1',
      'fe80::1',
      '::',
    ]
    for (const h of priv) expect([h, isPrivateOrReservedHost(h)] as const).toEqual([h, true])
  })

  it('公网域名与公网 IP 为假', () => {
    for (const h of ['zt.shentongapi.cn', '8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1', 'example.com']) {
      expect([h, isPrivateOrReservedHost(h)] as const).toEqual([h, false])
    }
  })

  it('非法输入不抛错', () => {
    expect(isPrivateOrReservedHost(undefined)).toBe(false)
    expect(isPrivateOrReservedHost(123)).toBe(false)
    expect(isPrivateOrReservedHost('')).toBe(false)
  })
})

describe('evaluateOutboundUrl', () => {
  it('拒绝非 http/https、不可解析、空值', () => {
    expect(evaluateOutboundUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'PROTOCOL' })
    expect(evaluateOutboundUrl('ftp://a.com/x')).toEqual({ ok: false, reason: 'PROTOCOL' })
    expect(evaluateOutboundUrl('not a url')).toEqual({ ok: false, reason: 'PARSE' })
    expect(evaluateOutboundUrl('')).toEqual({ ok: false, reason: 'EMPTY' })
    expect(evaluateOutboundUrl(undefined)).toEqual({ ok: false, reason: 'EMPTY' })
  })

  it('默认拒绝私网与元数据地址（S-23 核心）', () => {
    expect(evaluateOutboundUrl('http://169.254.169.254/latest/meta-data/')).toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    })
    expect(evaluateOutboundUrl('http://127.0.0.1:5678/rest/login')).toEqual({ ok: false, reason: 'PRIVATE_HOST' })
    expect(evaluateOutboundUrl('http://localhost:5678/x')).toEqual({ ok: false, reason: 'PRIVATE_HOST' })
    expect(evaluateOutboundUrl('http://192.168.1.10:8080/x')).toEqual({ ok: false, reason: 'PRIVATE_HOST' })
  })

  it('归一化后的等价写法同样被拒绝（十进制/十六进制/短写 IPv4）', () => {
    for (const raw of ['http://2130706433/', 'http://0x7f.1/', 'http://127.1/', 'http://0177.0.0.1/']) {
      expect([raw, evaluateOutboundUrl(raw).ok] as const).toEqual([raw, false])
    }
  })

  it('白名单命中才放行（大小写不敏感）', () => {
    const allowedHosts = new Set(['cdn.shentongapi.cn'])
    expect(evaluateOutboundUrl('https://cdn.shentongapi.cn/a.png', { allowedHosts }).ok).toBe(true)
    expect(evaluateOutboundUrl('https://CDN.ShenTongAPI.cn/a.png', { allowedHosts }).ok).toBe(true)
    expect(evaluateOutboundUrl('https://evil.com/a.png', { allowedHosts })).toEqual({
      ok: false,
      reason: 'HOST_NOT_ALLOWED',
    })
    expect(evaluateOutboundUrl('https://x.cdn.shentongapi.cn/a.png', { allowedHosts })).toEqual({
      ok: false,
      reason: 'HOST_NOT_ALLOWED',
    })
  })

  it('白名单可用前导点做子域通配', () => {
    const allowedHosts = new Set(['.shentongapi.cn'])
    expect(evaluateOutboundUrl('https://cdn.shentongapi.cn/a.png', { allowedHosts }).ok).toBe(true)
    expect(evaluateOutboundUrl('https://shentongapi.cn/a.png', { allowedHosts }).ok).toBe(false)
    expect(evaluateOutboundUrl('https://evilshentongapi.cn/a.png', { allowedHosts }).ok).toBe(false)
  })

  it('allowPrivate=true 放行私网（本机/局域网自建模型服务场景）', () => {
    expect(evaluateOutboundUrl('http://127.0.0.1:8642/health', { allowPrivate: true }).ok).toBe(true)
    expect(evaluateOutboundUrl('http://192.168.1.10:11434/v1', { allowPrivate: true }).ok).toBe(true)
  })

  it('即使 allowPrivate=true，元数据/链路本地地址仍被拒绝（永不放行）', () => {
    expect(evaluateOutboundUrl('http://169.254.169.254/latest/meta-data/', { allowPrivate: true })).toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    })
    expect(evaluateOutboundUrl('http://100.100.100.200/latest/meta-data/', { allowPrivate: true }).ok).toBe(false)
    expect(evaluateOutboundUrl('http://0.0.0.0:80/', { allowPrivate: true }).ok).toBe(false)
  })

  it('放行时返回归一化后的 URL', () => {
    const r = evaluateOutboundUrl('https://CDN.example.com/a.png?x=1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe('https://cdn.example.com/a.png?x=1')
  })

  it('带用户信息的形式不会误判真实主机', () => {
    // 真实主机是 evil.com，允许（公网）；反之真实主机是 127.0.0.1 时拒绝
    expect(evaluateOutboundUrl('http://127.0.0.1@evil.com/').ok).toBe(true)
    expect(evaluateOutboundUrl('http://evil.com@127.0.0.1/')).toEqual({ ok: false, reason: 'PRIVATE_HOST' })
  })
})
