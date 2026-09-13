import {
  importN8nWorkflows,
  normalizeBaseUrl,
  webhookPathOf,
  shouldActivate,
  type ImportTarget,
  type WorkflowPayload,
} from '../../electron/main/n8n-import'

interface RemoteWf {
  id: string
  name?: string
  nodes?: Array<Record<string, unknown>>
  active?: boolean
  [key: string]: unknown
}

/** 内存版 n8n 公开 API 替身：GET/POST/PUT 工作流 + activate 端点 */
function makeFakeN8n(
  initial: RemoteWf[] = [],
  opts: { activateSupported?: boolean; failList?: boolean; failCreate?: boolean } = {},
) {
  const store = new Map<string, RemoteWf>(initial.map((w) => [w.id, { ...w }]))
  let seq = initial.length
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = []
  const reply = (status: number, payload: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  })
  const fetchImpl = (async (url: string, init?: { method?: string; body?: unknown }) => {
    const path = new URL(String(url)).pathname
    const method = String(init?.method ?? 'GET').toUpperCase()
    let body: Record<string, unknown> | undefined
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = undefined
      }
    }
    calls.push({ method, path, body })

    if (path === '/api/v1/workflows' && method === 'GET') {
      if (opts.failList) return reply(500, { message: 'boom' })
      return reply(200, { data: [...store.values()], nextCursor: null })
    }
    if (path === '/api/v1/workflows' && method === 'POST') {
      if (opts.failCreate) return reply(400, { message: 'bad request' })
      seq += 1
      const id = `wf_${seq}`
      store.set(id, { id, active: false, ...(body as object) })
      return reply(200, { id })
    }
    const mAct = path.match(/^\/api\/v1\/workflows\/([^/]+)\/activate$/)
    if (mAct && method === 'POST') {
      if (opts.activateSupported === false) return reply(404, { message: 'not found' })
      const wf = store.get(mAct[1])
      if (!wf) return reply(404, { message: 'not found' })
      wf.active = true
      return reply(200, { id: wf.id, active: true })
    }
    const mWf = path.match(/^\/api\/v1\/workflows\/([^/]+)$/)
    if (mWf && method === 'PUT') {
      const wf = store.get(mWf[1])
      if (!wf) return reply(404, { message: 'not found' })
      Object.assign(wf, body ?? {})
      return reply(200, wf)
    }
    return reply(404, { message: 'unknown path' })
  }) as unknown as typeof fetch
  return { fetchImpl, calls, store }
}

function target(id: string, risk: 'readonly' | 'high', slug: string, name = id): ImportTarget {
  return {
    id,
    name,
    risk,
    workflow: {
      name,
      nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: slug } }],
      connections: {},
    },
  }
}

describe('n8n-import 工具函数', () => {
  it('normalizeBaseUrl 归一化尾部斜杠与缺省值', () => {
    expect(normalizeBaseUrl(undefined)).toBe('http://127.0.0.1:5678')
    expect(normalizeBaseUrl('')).toBe('http://127.0.0.1:5678')
    expect(normalizeBaseUrl('http://127.0.0.1:5678///')).toBe('http://127.0.0.1:5678')
  })

  it('webhookPathOf 取 webhook 节点路径并去斜杠', () => {
    const wf = { name: 'x', nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: '/st-wf-a/' } }], connections: {} }
    expect(webhookPathOf(wf as WorkflowPayload)).toBe('st-wf-a')
    expect(webhookPathOf({ name: 'x', nodes: [], connections: {} })).toBe('')
  })

  it('shouldActivate：高风险默认不激活，需显式开闸', () => {
    expect(shouldActivate({ risk: 'readonly' }, {})).toBe(true)
    expect(shouldActivate({ risk: 'high' }, {})).toBe(false)
    expect(shouldActivate({ risk: 'high' }, { activateHighRisk: true })).toBe(true)
    expect(shouldActivate({ risk: 'readonly' }, { activate: false })).toBe(false)
  })
})

describe('importN8nWorkflows', () => {
  it('空远端：全部新建，只激活低风控模板', async () => {
    const fake = makeFakeN8n()
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a'), target('b', 'high', 'st-wf-b')],
      fetchImpl: fake.fetchImpl,
    })
    expect(report.ok).toBe(true)
    expect(report.created).toBe(2)
    expect(report.updated).toBe(0)
    expect(report.activated).toBe(1)
    expect(report.failed).toBe(0)
    const byId = Object.fromEntries(report.items.map((i) => [i.id, i]))
    expect(byId.a.action).toBe('create')
    expect(byId.a.activated).toBe(true)
    expect(byId.b.activated).toBe(false)
    expect(byId.b.detail).toContain('灰度')
    expect(fake.store.size).toBe(2)
  })

  it('幂等：同 webhook 路径已存在时走更新而不是重建', async () => {
    const fake = makeFakeN8n([
      { id: 'existing_1', name: '旧名字', nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'st-wf-a' } }] },
    ])
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a', '新名字')],
      fetchImpl: fake.fetchImpl,
    })
    expect(report.created).toBe(0)
    expect(report.updated).toBe(1)
    expect(report.items[0].action).toBe('update')
    expect(report.items[0].remoteId).toBe('existing_1')
    expect(fake.store.size).toBe(1)
    expect((fake.store.get('existing_1') as RemoteWf).name).toBe('新名字')
  })

  it('老版本 n8n 无 activate 端点时回退 PUT active=true', async () => {
    const fake = makeFakeN8n([], { activateSupported: false })
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a')],
      fetchImpl: fake.fetchImpl,
    })
    expect(report.activated).toBe(1)
    expect(report.items[0].activated).toBe(true)
    expect(report.items[0].detail).toContain('回退')
    const put = fake.calls.find((c) => c.method === 'PUT')
    expect(put?.body).toEqual({ active: true })
  })

  it('dryRun：只拉清单不写入', async () => {
    const fake = makeFakeN8n([
      { id: 'existing_1', name: 'a', nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'st-wf-a' } }] },
    ])
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a'), target('c', 'readonly', 'st-wf-c')],
      dryRun: true,
      fetchImpl: fake.fetchImpl,
    })
    expect(report.dryRun).toBe(true)
    expect(report.items.map((i) => i.action)).toEqual(['update', 'create'])
    expect(fake.calls.every((c) => c.method === 'GET')).toBe(true)
    expect(fake.store.size).toBe(1)
  })

  it('缺 API Key 直接结构化失败，不发请求', async () => {
    const fake = makeFakeN8n()
    const report = await importN8nWorkflows({ apiKey: '', targets: [target('a', 'readonly', 'st-wf-a')], fetchImpl: fake.fetchImpl })
    expect(report.ok).toBe(false)
    expect(report.error).toContain('API Key')
    expect(fake.calls).toHaveLength(0)
  })

  it('n8n 不可用时返回可读错误（不抛异常）', async () => {
    const fake = makeFakeN8n([], { failList: true })
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a')],
      fetchImpl: fake.fetchImpl,
    })
    expect(report.ok).toBe(false)
    expect(report.error).toContain('读取 n8n 工作流清单失败')
    expect(report.items).toHaveLength(0)
  })

  it('单个模板创建失败不影响其它模板，失败计数正确', async () => {
    const fake = makeFakeN8n([], { failCreate: true })
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a'), target('b', 'readonly', 'st-wf-b')],
      fetchImpl: fake.fetchImpl,
    })
    expect(report.ok).toBe(false)
    expect(report.failed).toBe(2)
    expect(report.items.every((i) => i.action === 'error')).toBe(true)
    expect(report.items[0].detail).toContain('创建失败')
  })

  it('activate=false 时只导入不激活', async () => {
    const fake = makeFakeN8n()
    const report = await importN8nWorkflows({
      apiKey: 'KEY',
      targets: [target('a', 'readonly', 'st-wf-a')],
      activate: false,
      fetchImpl: fake.fetchImpl,
    })
    expect(report.created).toBe(1)
    expect(report.activated).toBe(0)
    expect(report.items[0].detail).toContain('未激活')
    expect(fake.store.get('wf_1')?.active).toBe(false)
  })
})
