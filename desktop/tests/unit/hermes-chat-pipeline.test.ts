/**
 * Hermes 对话独立页流水线单测（node:test + tsx）
 * 运行: npx tsx --test tests/unit/hermes-chat-pipeline.test.ts
 * 纯 DI 注入假 API，不加载 http-client / import.meta.env。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureHermesSession,
  persistHermesMessage,
  runHermesSediment,
  undoHermesSediment,
  type HermesPipelineDeps,
} from '../../src/services/hermes-chat-pipeline'
import type { ChatSession } from '../../src/types/chat'

function session(id: number, modelId = 'custom/deep-shentong'): ChatSession {
  return {
    id,
    userId: 1,
    title: 'Hermes 对话',
    modelId,
    status: 'active',
    pinned: false,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeDeps(overrides: Partial<HermesPipelineDeps> = {}): HermesPipelineDeps {
  return {
    createSession: async ({ modelId }) => session(42, modelId || 'custom/deep-shentong'),
    saveMessage: async () => ({}),
    analyzeSediment: async () => null,
    applySediment: async () => ({ feedId: 1, undoToken: 'u1', alreadyExisted: false }),
    undoSediment: async () => ({ ok: true }),
    ...overrides,
  }
}

describe('hermes-chat-pipeline', () => {
  test('runHermesSediment 企业资料 -> knowledge_base 沉淀提示', async () => {
    const deps = makeDeps({
      analyzeSediment: async () => ({ type: 'enterprise_doc', target: 'knowledge_base', title: '公司资料', content: '做AI的', operation: 'add' }),
      applySediment: async () => ({ feedId: 7, undoToken: 'tk-7', alreadyExisted: false }),
    })
    const notice = await runHermesSediment({ content: '记住这个', history: [], sessionId: 42 }, deps)
    assert.ok(notice, 'expect sediment notice')
    assert.equal(notice.target, 'knowledge_base')
    assert.equal(notice.feedId, 7)
    assert.equal(notice.undoToken, 'tk-7')
  })

  test('runHermesSediment 客户画像 -> hermes_memory 沉淀提示', async () => {
    const deps = makeDeps({
      analyzeSediment: async () => ({ type: 'customer_profile', target: 'hermes_memory', title: '客户', content: '喜欢蓝色' }),
      hermesMemoryAdd: async () => ({ ok: true }),
    })
    const notice = await runHermesSediment({ content: '用户喜欢蓝色', history: [], sessionId: 42 }, deps)
    assert.ok(notice, 'expect sediment notice')
    assert.equal(notice.target, 'hermes_memory')
    assert.equal(notice.memoryText, '客户：喜欢蓝色')
  })

  test('runHermesSediment 闲聊/session 缺失 -> 不沉淀', async () => {
    const deps = makeDeps({})
    assert.equal(await runHermesSediment({ content: 'hello', history: [], sessionId: null }, deps), null)
    const depsNone = makeDeps({ analyzeSediment: async () => ({ type: 'none', target: null, title: '', content: '' }) })
    assert.equal(await runHermesSediment({ content: 'hello', history: [], sessionId: 1 }, depsNone), null)
  })

  test('undoHermesSediment knowledge_base 调 undoSediment(token)', async () => {
    let undone = ''
    const deps = makeDeps({ undoSediment: async (token) => { undone = token; return { ok: true } } })
    const ok = await undoHermesSediment(
      { id: '1', sessionId: 1, target: 'knowledge_base', title: 't', undoToken: 'tk-u', createdAt: Date.now() },
      deps,
    )
    assert.equal(ok, true)
    assert.equal(undone, 'tk-u')
  })

  test('undoHermesSediment hermes_memory 调 hermesMemoryRemove(text)', async () => {
    let removed = ''
    const deps = makeDeps({ hermesMemoryRemove: async (text) => { removed = text; return { ok: true } } })
    const ok = await undoHermesSediment(
      { id: '1', sessionId: 1, target: 'hermes_memory', title: 't', memoryText: '客户：蓝', createdAt: Date.now() },
      deps,
    )
    assert.equal(ok, true)
    assert.equal(removed, '客户：蓝')
  })

  test('ensureHermesSession 复用已有会话且只创建一次', async () => {
    let created = 0
    const deps = makeDeps({
      createSession: async ({ modelId }) => { created++; return session(10, modelId || 'x') },
    })
    const a = await ensureHermesSession(null, '你好', { modelId: 'custom/deep-shentong' }, deps)
    const b = await ensureHermesSession(a, '你好', { modelId: 'y' }, deps)
    assert.equal(a, 10)
    assert.equal(b, 10)
    assert.equal(created, 1)
  })

  test('ensureHermesSession 创建失败降级为 0', async () => {
    const deps = makeDeps({ createSession: async () => { throw new Error('backend down') } })
    assert.equal(await ensureHermesSession(null, 'hi', {}, deps), 0)
  })

  test('persistHermesMessage 对 sessionId<=0 跳过', async () => {
    let saved = 0
    const deps = makeDeps({ saveMessage: async () => { saved++; return {} } })
    persistHermesMessage(0, { role: 'user', content: 'x' }, deps)
    persistHermesMessage(-1, { role: 'user', content: 'x' }, deps)
    assert.equal(saved, 0)
    persistHermesMessage(5, { role: 'user', content: 'x' }, deps)
    assert.equal(saved, 1)
  })
})
