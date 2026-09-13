import {
  douyinHealth,
  douyinStatus,
  douyinCapabilities,
  douyinCollect,
  douyinCall,
} from '../../src/api/douyin-api'

function mockFetchOk(body: unknown): jest.Mock {
  const fn = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }))
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('douyin-api', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('health 返回 ok 与 service', async () => {
    mockFetchOk({ ok: true, service: 'douyin', mode: 'read-only' })
    const res = await douyinHealth()
    expect(res.ok).toBe(true)
    expect(res.service).toBe('douyin')
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:9030/api/health', expect.anything())
  })

  it('status 返回 ready=false', async () => {
    mockFetchOk({ ok: true, ready: false, login: 'offline' })
    const res = await douyinStatus()
    expect(res.ready).toBe(false)
  })

  it('capabilities 含高风险能力', async () => {
    mockFetchOk({
      ok: true,
      capabilities: {
        collect: { title: '采集视频', risk: 'readonly', stage: 'collect', params: { keyword: 'str' } },
        publish: { title: '发布视频', risk: 'high', stage: 'publish', params: {} },
      },
    })
    const res = await douyinCapabilities()
    expect(Object.keys(res.capabilities)).toEqual(expect.arrayContaining(['collect', 'publish']))
  })

  it('collect POST 带 JSON body 到 /api/douyin/collect', async () => {
    const fn = mockFetchOk({ ok: false, code: 'PIPELINE_NOT_READY' })
    const res = await douyinCollect({ keyword: 'x', limit: 10 })
    expect(res.code).toBe('PIPELINE_NOT_READY')
    const url = fn.mock.calls[0][0]
    const init = fn.mock.calls[0][1] as { method?: string; body?: string }
    expect(url).toBe('http://127.0.0.1:9030/api/douyin/collect')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ keyword: 'x', limit: 10 })
  })

  it('通用调用按能力名路由', async () => {
    const fn = mockFetchOk({ ok: false, code: 'DISABLED' })
    await douyinCall('publish', { title: 't' })
    expect(fn.mock.calls[0][0]).toBe('http://127.0.0.1:9030/api/douyin/publish')
  })

  it('网络错误时返回 NETWORK_ERROR', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    const res = await douyinHealth()
    expect(res.ok).toBe(false)
    expect(res.code).toBe('NETWORK_ERROR')
  })
})