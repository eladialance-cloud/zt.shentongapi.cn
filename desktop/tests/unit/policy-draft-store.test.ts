/**
 * draft-store-policy 单测（安全审计 S-53）。
 *
 * 背景：渲染层把两类数据明文写进 localStorage —— 流式草稿（chat-stream:draft，
 * 每 6s 一次全量覆盖）与 refreshToken（zustand persist 的 auth-storage）。
 * localStorage 与渲染层同源、任意注入脚本可读，刷新令牌属高价值凭据。
 * 本策略把「能写什么键、能写多大、落到哪个目录」收敛成纯判定，
 * 主进程 services/renderer-store 只负责按判定落盘（可加密则加密）。
 *
 * 命名空间约定：
 *   - chat-draft：用户草稿（非凭据）→ 允许在无加密能力时降级明文，保证崩溃恢复可用；
 *   - auth-token：刷新令牌（凭据）→ **必须**加密，无法加密时拒绝写入（绝不落明文）。
 */
import { describe, it, expect } from '@jest/globals'
import {
  DRAFT_KEY_RE,
  DRAFT_STORE_NAMESPACES,
  MAX_DRAFT_BYTES,
  describeDraftStoreDeny,
  draftFilePath,
  evaluateDraftKey,
  evaluateDraftNamespace,
  evaluateDraftPayload,
  isSecretNamespace,
} from '../../electron/main/policy/draft-store-policy'

describe('命名空间白名单', () => {
  it('只放行登记过的两个命名空间', () => {
    for (const ns of DRAFT_STORE_NAMESPACES) {
      const r = evaluateDraftNamespace(ns)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.namespace).toBe(ns)
    }
  })

  it('其它值一律拒绝（含路径穿越、空、非字符串）', () => {
    for (const raw of ['', '  ', '../chat-draft', 'chat-draft/../..', 'other', null, undefined, 42, {}]) {
      const r = evaluateDraftNamespace(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('INVALID_NAMESPACE')
    }
  })

  it('auth-token 是凭据命名空间，chat-draft 不是', () => {
    expect(isSecretNamespace('auth-token')).toBe(true)
    expect(isSecretNamespace('chat-draft')).toBe(false)
  })
})

describe('键名白名单', () => {
  it('放行字母数字与 . _ : -（含现有键 chat-stream:draft）', () => {
    for (const key of ['chat-stream:draft', 'a', 'A.b_c-d:1', 'x'.repeat(128)]) {
      const r = evaluateDraftKey(key)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.key).toBe(key)
    }
  })

  it('拒绝空 / 超长 / 控制字符 / 路径分隔符 / .. 穿越', () => {
    for (const key of ['', '   ', 'a/b', 'a\\b', '..', 'a..b', '../x', 'a b', 'a\nb', 'x'.repeat(129), null, 42]) {
      const r = evaluateDraftKey(key)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('INVALID_KEY')
    }
  })

  it('白名单正则与实现一致（防止有人放宽正则而测试不同步）', () => {
    expect(DRAFT_KEY_RE.test('chat-stream:draft')).toBe(true)
    expect(DRAFT_KEY_RE.test('a/b')).toBe(false)
  })
})

describe('载荷体积上限', () => {
  it('对象与字符串都可序列化，返回 JSON 文本', () => {
    const obj = evaluateDraftPayload({ sessionId: 1, content: '你好' })
    expect(obj.ok).toBe(true)
    if (obj.ok) expect(JSON.parse(obj.json).content).toBe('你好')
    const str = evaluateDraftPayload('refresh-token-value')
    expect(str.ok).toBe(true)
    if (str.ok) expect(JSON.parse(str.json)).toBe('refresh-token-value')
  })

  it('超过上限（按 UTF-8 字节）拒绝', () => {
    const big = '中'.repeat(Math.ceil(MAX_DRAFT_BYTES / 3) + 10)
    const r = evaluateDraftPayload(big)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('TOO_LARGE')
  })

  it('无法序列化 / undefined 拒绝（不写脏数据）', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    for (const bad of [undefined, circular, { n: BigInt(1) }]) {
      const r = evaluateDraftPayload(bad)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('SERIALIZE')
    }
  })
})

describe('落盘路径限定', () => {
  const root = 'C:/data/renderer-store'

  it('合法键落到 <root>/<namespace>/<key>.json', () => {
    const p = draftFilePath(root, 'chat-draft', 'chat-stream:draft')
    expect(p).not.toBeNull()
    expect(p).toContain('renderer-store')
    expect(p).toContain('chat-draft')
    expect(p!.endsWith('.json')).toBe(true)
    expect(p!.includes('..')).toBe(false)
  })

  it('非法命名空间 / 非法键返回 null（调用方必须放弃）', () => {
    expect(draftFilePath(root, '../evil', 'k')).toBeNull()
    expect(draftFilePath(root, 'chat-draft', '../evil')).toBeNull()
    expect(draftFilePath(root, 'chat-draft', 'a/b')).toBeNull()
    expect(draftFilePath('', 'chat-draft', 'k')).toBeNull()
  })

  it('windows 反斜杠语义下也限定在 root 内', () => {
    const p = draftFilePath('C:\\data\\renderer-store', 'auth-token', 'refresh')
    expect(p).not.toBeNull()
    expect(p!.replace(/\\/g, '/')).toContain('C:/data/renderer-store/auth-token/')
  })
})

describe('describeDraftStoreDeny', () => {
  it('每个 reason 文案非空且互不相同', () => {
    const reasons = ['EMPTY', 'INVALID_NAMESPACE', 'INVALID_KEY', 'SERIALIZE', 'TOO_LARGE', 'IO'] as const
    const texts = reasons.map((r) => describeDraftStoreDeny(r))
    for (const t of texts) expect(t.length).toBeGreaterThan(0)
    expect(new Set(texts).size).toBe(reasons.length)
  })
})
