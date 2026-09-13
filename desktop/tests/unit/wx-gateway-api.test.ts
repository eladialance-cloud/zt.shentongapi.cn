import {
  wxGatewayHealth,
  wxGatewayStatus,
  wxGatewayCapabilities,
  wxGatewaySend,
  wxGatewayCall,
} from '../../src/api/wx-gateway-api'

function mockFetchOk(body: unknown): jest.Mock {
  const fn = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }))
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('wx-gateway-api', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('health 返回 ok 与 service', async () => {
    mockFetchOk({ ok: true, service: 'wx-gateway', backend: 'wxauto', backend_license: 'MIT' })
    const res = await wxGatewayHealth()
    expect(res.ok).toBe(true)
    expect(res.service).toBe('wx-gateway')
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:9020/api/health', expect.anything())
  })

  it('status 返回 connected=false', async () => {
    mockFetchOk({ ok: true, connected: false, detail: 'SDK_NOT_READY' })
    const res = await wxGatewayStatus()
    expect(res.ok).toBe(true)
    expect(res.connected).toBe(false)
  })

  it('capabilities 返回 8 个能力', async () => {
    mockFetchOk({
      ok: true,
      capabilities: {
        send: { title: '发消息', risk: 'high', params: { to: 'str', text: 'str' } },
        friends: { title: '好友列表', risk: 'readonly', params: {} },
      },
    })
    const res = await wxGatewayCapabilities()
    expect(Object.keys(res.capabilities)).toEqual(expect.arrayContaining(['send', 'friends']))
  })

  it('send POST 带 JSON body 到 /api/wx/send', async () => {
    const fn = mockFetchOk({ ok: false, code: 'SDK_NOT_READY', detail: '授权 SDK 未接入' })
    const res = await wxGatewaySend({ to: 'u', text: 'hi' })
    expect(res.code).toBe('SDK_NOT_READY')
    const url = fn.mock.calls[0][0]
    const init = fn.mock.calls[0][1] as { method?: string; body?: string }
    expect(url).toBe('http://127.0.0.1:9020/api/wx/send')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ to: 'u', text: 'hi' })
  })

  it('通用调用按能力名路由', async () => {
    const fn = mockFetchOk({ ok: false, code: 'SDK_NOT_READY' })
    await wxGatewayCall('moments_publish', { text: 'hi' })
    expect(fn.mock.calls[0][0]).toBe('http://127.0.0.1:9020/api/wx/moments_publish')
  })

  it('HTTP 错误时返回 HTTP_ERROR', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch
    const res = await wxGatewayHealth()
    expect(res.ok).toBe(false)
    expect(res.code).toBe('HTTP_ERROR')
  })

  it('网络错误时返回 NETWORK_ERROR', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    const res = await wxGatewayHealth()
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NETWORK_ERROR')
    expect(res.detail).toBe('boom')
  })
})