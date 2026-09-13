jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/fake-user-data' },
}))

import { runN8nTemplate } from '../../electron/main/n8n-executor'

function mockFetchResolve(data: unknown): jest.Mock {
  const fn = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  }))
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('n8n-executor 模板触发', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('未知模板返回错误', async () => {
    const res = await runN8nTemplate('nope', {})
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/未知工作流模板/)
  })

  it('按模板 id 解析 webhook 路径并触发', async () => {
    const fn = mockFetchResolve({ ok: true })
    const res = await runN8nTemplate('secretary-daily-poster', { date: '2026-09-09' })
    expect(res.ok).toBe(true)
    const url = fn.mock.calls[0][0]
    expect(url).toBe('http://127.0.0.1:5678/webhook/st-wf-secretary-daily-poster')
    const init = fn.mock.calls[0][1] as { body?: string }
    expect(JSON.parse(init.body as string)).toEqual({ date: '2026-09-09' })
  })

  it('404 时提示本地 n8n 未激活该工作流', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'not found',
    })) as unknown as typeof fetch
    const res = await runN8nTemplate('traffic-generate-copy', { topic: 'x' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/未激活该工作流/)
  })
})