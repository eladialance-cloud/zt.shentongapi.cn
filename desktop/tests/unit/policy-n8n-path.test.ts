// n8n webhook 路径净化 + flowId 形态校验（安全审计 S-24）
// 背景：渲染层可传入任意 paths / flowId，最终拼进 URL 或作为 Python argv。
// 目录穿越可把携带 JWT 的 POST 打到 N8N 的 /rest/* 管理接口；flowId 可伪装成 CLI 参数。
import {
  assertKnownFlowId,
  isSafeFlowId,
  sanitizeWebhookPaths,
} from '../../electron/main/policy/n8n-path-policy'

describe('sanitizeWebhookPaths', () => {
  it('去掉首尾斜杠并保留合法路径', () => {
    expect(sanitizeWebhookPaths(['/a/b/'])).toEqual(['a/b'])
    expect(sanitizeWebhookPaths(['a/b'])).toEqual(['a/b'])
    expect(sanitizeWebhookPaths(['///a///'])).toEqual(['a'])
  })

  it('拒绝目录穿越项（S-24 核心：防止 token 被 POST 到非 webhook 端点）', () => {
    expect(sanitizeWebhookPaths(['../rest/login'])).toEqual([])
    expect(sanitizeWebhookPaths(['a/../../rest/workflows'])).toEqual([])
    expect(sanitizeWebhookPaths(['..'])).toEqual([])
  })

  it('拒绝查询串与锚点', () => {
    expect(sanitizeWebhookPaths(['a?x=1'])).toEqual([])
    expect(sanitizeWebhookPaths(['a#frag'])).toEqual([])
  })

  it('拒绝空格与非法字符、超长项，数组上限 10', () => {
    expect(sanitizeWebhookPaths(['a b'])).toEqual([])
    expect(sanitizeWebhookPaths(['a'.repeat(201)])).toEqual([])
    expect(sanitizeWebhookPaths(Array.from({ length: 12 }, (_, i) => 'p' + i))).toHaveLength(10)
  })

  it('非法字符（反斜杠/编码/协议）被丢弃', () => {
    expect(sanitizeWebhookPaths(['a\\b'])).toEqual([])
    expect(sanitizeWebhookPaths(['%2e%2e/rest'])).toEqual([])
    expect(sanitizeWebhookPaths(['http://evil.com/x'])).toEqual([])
  })

  it('混合输入只保留合法项', () => {
    expect(sanitizeWebhookPaths(['../x', 'ok/1', 'a b', 'ok/2'])).toEqual(['ok/1', 'ok/2'])
  })

  it('非数组返回空数组', () => {
    expect(sanitizeWebhookPaths(undefined)).toEqual([])
    expect(sanitizeWebhookPaths(null)).toEqual([])
    expect(sanitizeWebhookPaths('a/b')).toEqual([])
    expect(sanitizeWebhookPaths({ 0: 'a' })).toEqual([])
    expect(sanitizeWebhookPaths([])).toEqual([])
  })
})

describe('isSafeFlowId', () => {
  it('接受正常业务流 id', () => {
    for (const id of ['daily_report', 'a-b.c', 'Flow123', 'x']) {
      expect([id, isSafeFlowId(id)] as const).toEqual([id, true])
    }
  })

  it('拒绝 CLI 参数伪装与路径形态（S-24 核心）', () => {
    for (const id of ['--help', '-x', '..', 'a..b', '../../etc/passwd', 'a b', 'a/b', 'a\\b', '']) {
      expect([id, isSafeFlowId(id)] as const).toEqual([id, false])
    }
  })

  it('拒绝超长与非字符串', () => {
    expect(isSafeFlowId('a'.repeat(101))).toBe(false)
    expect(isSafeFlowId(undefined)).toBe(false)
    expect(isSafeFlowId(123)).toBe(false)
  })
})

describe('assertKnownFlowId', () => {
  const known = new Set(['daily_report', 'weekly_summary'])

  it('已知集合内才通过', () => {
    expect(assertKnownFlowId('daily_report', known)).toBe(true)
    expect(assertKnownFlowId('unknown_flow', known)).toBe(false)
  })

  it('集合为空表示「无法枚举」而不是「全部非法」（由形态校验兜底）', () => {
    expect(assertKnownFlowId('anything', new Set())).toBe(true)
  })

  it('忽略首尾空白后比对', () => {
    expect(assertKnownFlowId('  daily_report  ', known)).toBe(true)
  })
})
