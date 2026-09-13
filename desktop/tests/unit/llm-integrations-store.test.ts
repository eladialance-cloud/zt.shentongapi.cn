/**
 * LlmIntegrationsStore 端点信任接线验证（安全审计 S-54）。
 *
 * 判定逻辑在 tests/unit/policy-llm-endpoint.test.ts；这里验证 store 侧真的接上了：
 *   - save 拒绝被策略拒绝的地址（不落盘、不覆盖原有记录）；
 *   - save 写入 trust 分级（platform / custom）；
 *   - test 在被策略拦下时根本不发请求（fetch 不被调用）。
 */
import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { LlmIntegrationsStore } from '../../electron/main/llm-integrations'
import type { LlmIntegration } from '../../electron/shared/types'

const DIR = path.join(os.tmpdir(), 'st-llm-integrations-' + Date.now())
const FILE = path.join(DIR, 'llm-integrations.json')

// jest/jsdom 环境缺少 AbortSignal.timeout（Electron 运行时自带）
beforeAll(() => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
    ;(AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout = (ms: number) => {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), ms)
      return ctrl.signal
    }
  }
})

function makeStore(): LlmIntegrationsStore {
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })
  return new LlmIntegrationsStore(FILE)
}

function record(over: Partial<LlmIntegration> = {}): LlmIntegration {
  return {
    id: 'i1',
    name: '测试接入',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    models: [{ id: 'gpt-4o' }],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('LlmIntegrationsStore.save：端点信任分级（S-54）', () => {
  let store: LlmIntegrationsStore
  beforeEach(() => { store = makeStore() })

  it('平台域名 → 记录 trust=platform', () => {
    const r = store.save(record({ baseUrl: 'https://zt.shentongapi.cn/api/llm-proxy/v1' }))
    expect(r.ok).toBe(true)
    expect(r.integrations[0].trust).toBe('platform')
    expect(JSON.parse(fs.readFileSync(FILE, 'utf-8')).integrations[0].trust).toBe('platform')
  })

  it('自定义公网域名 → 记录 trust=custom', () => {
    const r = store.save(record())
    expect(r.ok).toBe(true)
    expect(r.integrations[0].trust).toBe('custom')
  })

  it('云元数据地址被拒：不落盘', () => {
    const r = store.save(record({ baseUrl: 'http://169.254.169.254/latest/meta-data' }))
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('元数据')
    expect(fs.existsSync(FILE)).toBe(false)
  })

  it('URL 内嵌账号密码被拒', () => {
    const r = store.save(record({ baseUrl: 'https://u:p@api.openai.com/v1' }))
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('账号密码')
  })

  it('非 URL 被拒', () => {
    const r = store.save(record({ baseUrl: '不是地址' }))
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('无法解析')
  })

  it('更新被拒时保留原记录（不破坏已有配置）', () => {
    expect(store.save(record()).ok).toBe(true)
    const bad = store.save(record({ baseUrl: 'http://100.100.100.200/latest/meta-data' }))
    expect(bad.ok).toBe(false)
    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].baseUrl).toBe('https://api.openai.com/v1')
    expect(list[0].apiKey).toBe('sk-test')
  })
})

describe('LlmIntegrationsStore.test：发请求前先过策略（S-54）', () => {
  let store: LlmIntegrationsStore
  let originalFetch: typeof fetch

  beforeEach(() => {
    store = makeStore()
    originalFetch = globalThis.fetch
  })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('云元数据地址被拦下，且不发起任何请求', async () => {
    const spy = jest.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    const r = await store.test('http://169.254.169.254/v1', 'sk-test', 'gpt-4o')
    expect(r.ok).toBe(false)
    expect(String(r.message)).toContain('元数据')
    expect(spy).not.toHaveBeenCalled()
  })

  it('空 Base URL → 明确报错且不发请求', async () => {
    const spy = jest.fn()
    globalThis.fetch = spy as unknown as typeof fetch
    const r = await store.test('', 'sk-test', 'gpt-4o')
    expect(r.ok).toBe(false)
    expect(String(r.message)).toContain('不能为空')
    expect(spy).not.toHaveBeenCalled()
  })

  it('合法自定义 https 端点照常发请求', async () => {
    const spy = jest.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, text: async () => '' }))
    globalThis.fetch = spy as unknown as typeof fetch
    const r = await store.test('https://api.deepseek.com/v1', 'sk-test', 'deepseek-chat')
    expect(r.ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toBe('https://api.deepseek.com/v1/chat/completions')
  })
})
