/**
 * renderer-store 单测（安全审计 S-53 的落盘层）。
 *
 * 判定逻辑在 tests/unit/policy-draft-store.test.ts；这里验证落盘层的三条关键约定：
 *   1) chat-draft（非凭据）可读写，能加密则加密，无加密能力时允许降级明文；
 *   2) auth-token（凭据）**必须**加密：无加密能力时拒绝写入，磁盘上不留明文令牌；
 *   3) 非法命名空间 / 键 / 超大载荷一律拒绝且不产生文件。
 */
import { describe, it, expect, beforeEach } from '@jest/globals'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  clearEntry,
  loadEntry,
  saveEntry,
  type RendererStoreDeps,
} from '../../electron/main/services/renderer-store'

const ROOT_DIR = path.join(os.tmpdir(), 'st-renderer-store-' + Date.now())

/** 假加密：可逆且带前缀，便于断言「磁盘上不是明文」 */
const fakeCrypto = {
  encrypt: (plain: string) => 'SEALED:' + Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (sealed: string) => Buffer.from(sealed.slice('SEALED:'.length), 'base64').toString('utf8'),
}

const deps = (over: Partial<RendererStoreDeps> = {}): RendererStoreDeps => ({
  root: ROOT_DIR,
  canEncrypt: true,
  isPackaged: true,
  ...fakeCrypto,
  ...over,
})

const draftPath = path.join(ROOT_DIR, 'chat-draft', 'chat-stream:draft.json')
const tokenPath = path.join(ROOT_DIR, 'auth-token', 'refresh.json')

describe('renderer-store：chat-draft（非凭据）', () => {
  beforeEach(() => {
    fs.rmSync(ROOT_DIR, { recursive: true, force: true })
    fs.mkdirSync(ROOT_DIR, { recursive: true })
  })

  it('可加密时落盘为密文，读取还原对象', () => {
    const draft = { sessionId: 7, content: '草稿正文草稿正文', toolCalls: [], updatedAt: 1 }
    const saved = saveEntry(deps(), 'chat-draft', 'chat-stream:draft', draft)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(saved.sealed).toBe(true)
    const raw = fs.readFileSync(draftPath, 'utf-8')
    expect(raw).not.toContain('草稿正文')
    const loaded = loadEntry<typeof draft>(deps(), 'chat-draft', 'chat-stream:draft')
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.value).toEqual(draft)
  })

  it('无加密能力（生产打包）时降级明文，保证草稿可恢复', () => {
    const d = deps({ canEncrypt: false, encrypt: undefined, decrypt: undefined })
    const draft = { sessionId: 1, content: '明文兜底草稿', toolCalls: [], updatedAt: 2 }
    const saved = saveEntry(d, 'chat-draft', 'chat-stream:draft', draft)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(saved.sealed).toBe(false)
    expect(fs.readFileSync(draftPath, 'utf-8')).toContain('明文兜底草稿')
    const loaded = loadEntry<typeof draft>(d, 'chat-draft', 'chat-stream:draft')
    expect(loaded.ok && loaded.value).toEqual(draft)
  })

  it('缺文件返回 value=null（不报错、不抛异常）', () => {
    const r = loadEntry(deps(), 'chat-draft', 'chat-stream:draft')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeNull()
  })

  it('文件损坏返回失败而不是脏数据', () => {
    fs.mkdirSync(path.dirname(draftPath), { recursive: true })
    fs.writeFileSync(draftPath, '{ not json', 'utf-8')
    const r = loadEntry(deps(), 'chat-draft', 'chat-stream:draft')
    expect(r.ok).toBe(false)
  })

  it('clear 删除文件；对不存在的文件也返回成功', () => {
    saveEntry(deps(), 'chat-draft', 'chat-stream:draft', { a: 1 })
    expect(fs.existsSync(draftPath)).toBe(true)
    expect(clearEntry(deps(), 'chat-draft', 'chat-stream:draft').ok).toBe(true)
    expect(fs.existsSync(draftPath)).toBe(false)
    expect(clearEntry(deps(), 'chat-draft', 'chat-stream:draft').ok).toBe(true)
  })
})

describe('renderer-store：auth-token（凭据，必须加密）', () => {
  beforeEach(() => {
    fs.rmSync(ROOT_DIR, { recursive: true, force: true })
    fs.mkdirSync(ROOT_DIR, { recursive: true })
  })

  it('可加密时落盘为密文，读取还原令牌', () => {
    const saved = saveEntry(deps(), 'auth-token', 'refresh', 'sk-secret-refresh-token')
    expect(saved.ok).toBe(true)
    const raw = fs.readFileSync(tokenPath, 'utf-8')
    expect(raw).not.toContain('sk-secret-refresh-token')
    const loaded = loadEntry<string>(deps(), 'auth-token', 'refresh')
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.value).toBe('sk-secret-refresh-token')
  })

  it('无加密能力且已打包：拒绝写入，磁盘上不留明文令牌', () => {
    const d = deps({ canEncrypt: false, encrypt: undefined, decrypt: undefined, isPackaged: true })
    const saved = saveEntry(d, 'auth-token', 'refresh', 'sk-secret-refresh-token')
    expect(saved.ok).toBe(false)
    expect(fs.existsSync(tokenPath)).toBe(false)
  })

  it('磁盘上出现明文（异常状态）时拒绝读取，不当作有效凭据', () => {
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
    fs.writeFileSync(tokenPath, JSON.stringify('sk-plaintext-on-disk'), 'utf-8')
    const r = loadEntry(deps(), 'auth-token', 'refresh')
    expect(r.ok).toBe(false)
  })

  it('无加密能力时读取旧密文返回失败（不回退、不返回脏数据）', () => {
    saveEntry(deps(), 'auth-token', 'refresh', 'sk-secret-refresh-token')
    const d = deps({ canEncrypt: false, decrypt: undefined })
    const r = loadEntry(d, 'auth-token', 'refresh')
    expect(r.ok).toBe(false)
  })
})

describe('renderer-store：入参守卫', () => {
  beforeEach(() => {
    fs.rmSync(ROOT_DIR, { recursive: true, force: true })
    fs.mkdirSync(ROOT_DIR, { recursive: true })
  })

  it('非法命名空间 / 键：拒绝且不产生文件', () => {
    for (const [ns, key] of [
      ['../evil', 'k'],
      ['chat-draft', '../evil'],
      ['chat-draft', 'a/b'],
      ['', 'k'],
    ] as Array<[string, string]>) {
      const r = saveEntry(deps(), ns, key, { a: 1 })
      expect(r.ok).toBe(false)
    }
    expect(fs.readdirSync(ROOT_DIR)).toEqual([])
  })

  it('超出体积上限：拒绝且不产生文件', () => {
    const r = saveEntry(deps(), 'chat-draft', 'chat-stream:draft', 'x'.repeat(600 * 1024))
    expect(r.ok).toBe(false)
    expect(fs.existsSync(draftPath)).toBe(false)
  })

  it('不可序列化：拒绝且不产生文件', () => {
    const bad: Record<string, unknown> = {}
    bad.self = bad
    const r = saveEntry(deps(), 'chat-draft', 'chat-stream:draft', bad)
    expect(r.ok).toBe(false)
    expect(fs.existsSync(draftPath)).toBe(false)
  })
})
