// 日志脱敏策略（安全审计 S-75 / S-30 / S-79）
// 目标：写盘/上报前把凭据抹掉，同时**不能**把正常日志变成乱码（否则日志就没人看了）。
import { redactText, redactValue } from '../../electron/main/policy/redact'

describe('redactText', () => {
  it('抹掉 JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123signature'
    expect(redactText('token=' + jwt)).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(redactText('Authorization: Bearer ' + jwt)).not.toContain(jwt)
  })

  it('抹掉 sk- / cli_ / Bearer 形态密钥', () => {
    expect(redactText('key sk-abcdefghijklmnop')).not.toContain('sk-abcdefghijklmnop')
    expect(redactText('app cli_a1b2c3d4e5f6g7h8')).not.toContain('cli_a1b2c3d4e5f6g7h8')
    expect(redactText('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  })

  it('抹掉 key=value 形态的常见敏感字段', () => {
    expect(redactText('password=hunter2hunter2')).not.toContain('hunter2hunter2')
    expect(redactText('api_key: sk-zzzzzzzzzzzzzzzz')).not.toContain('sk-zzzzzzzzzzzzzzzz')
    expect(redactText('{"refresh_token":"abc123def456"}')).not.toContain('abc123def456')
    expect(redactText('session_id=deadbeefdeadbeef')).not.toContain('deadbeefdeadbeef')
  })

  it('不破坏正常文本（中文、数字、路径、普通标识符）', () => {
    for (const s of [
      '启动成功，端口 8642',
      '[edict] 任务 T-2026-0913-001 已完成，耗时 1234ms',
      'C:\\Users\\a\\userData\\hermes-home\\config.yaml',
      '[hermes-chat] Hermes 状态异常（端口未监听），自动重启...',
    ]) {
      expect([s, redactText(s)] as const).toEqual([s, s])
    }
  })

  it('非字符串输入原样返回，不抛错', () => {
    expect(redactText(123)).toBe(123)
    expect(redactText(undefined)).toBe(undefined)
    expect(redactText(null)).toBe(null)
  })
})

describe('redactValue', () => {
  it('按键名脱敏并递归处理嵌套结构', () => {
    const out = redactValue({
      a: 1,
      token: 'x',
      nested: { apiKey: 'sk-zzzzzzzzzzzzzzzz', keep: 'ok' },
    }) as Record<string, unknown>
    expect(out.token).toBe('***')
    expect((out.nested as Record<string, unknown>).apiKey).toBe('***')
    expect((out.nested as Record<string, unknown>).keep).toBe('ok')
    expect(out.a).toBe(1)
  })

  it('数组元素同样脱敏', () => {
    const out = redactValue([{ token: 'x' }, 'key sk-abcdefghijklmnop', 3]) as unknown[]
    expect((out[0] as Record<string, unknown>).token).toBe('***')
    expect(out[1]).not.toContain('sk-abcdefghijklmnop')
    expect(out[2]).toBe(3)
  })

  it('循环引用不抛错', () => {
    const cyc: Record<string, unknown> = { token: 'x' }
    cyc.self = cyc
    expect(() => redactValue(cyc)).not.toThrow()
    const out = redactValue(cyc) as Record<string, unknown>
    expect(out.token).toBe('***')
    expect(out.self).toBe('[Circular]')
  })

  it('超过深度上限时截断而不是无限展开', () => {
    let deep: Record<string, unknown> = { end: 'x' }
    for (let i = 0; i < 10; i++) deep = { child: deep }
    const out = redactValue(deep, 3)
    let cursor: unknown = out
    let hops = 0
    while (cursor && typeof cursor === 'object' && 'child' in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>).child
      hops++
      if (hops > 20) break
    }
    expect(hops).toBeLessThanOrEqual(3)
    expect(cursor).toBe('[DepthLimit]')
  })

  it('Error 实例转成脱敏后的文本（否则日志里只有 {}）', () => {
    const out = redactValue(new Error('bad token sk-abcdefghijklmnop'))
    expect(typeof out).toBe('string')
    expect(out).not.toContain('sk-abcdefghijklmnop')
    expect(String(out)).toContain('bad token')
  })

  it('函数与 Symbol 不抛错', () => {
    expect(() => redactValue({ fn: () => 1, sym: Symbol('s') })).not.toThrow()
  })
})
