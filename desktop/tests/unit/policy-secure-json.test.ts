// secure-json 策略层测试（安全审计 S-05 部分 / S-61）
// 纯函数，无 electron 依赖：加密能力通过 deps 注入，便于测试三种环境组合。
import { isEnvelope, openJson, sealJson } from '../../electron/main/policy/secure-json'

const encrypt = (s: string): string => 'ENC(' + Buffer.from(s, 'utf8').toString('base64') + ')'
const decrypt = (s: string): string => Buffer.from(s.slice(4, -1), 'base64').toString('utf8')

describe('sealJson', () => {
  it('可加密时产出 enc=true 信封，且明文不出现在结果中', () => {
    const r = sealJson({ token: 'secret-jwt' }, { available: true, isPackaged: true, encrypt })
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toContain('secret-jwt')
    if (r.ok) expect(r.envelope.enc).toBe(true)
  })

  it('生产环境不可加密时拒绝写入（S-05/S-61 核心：绝不落明文）', () => {
    expect(sealJson({ token: 'x' }, { available: false, isPackaged: true, encrypt })).toEqual({
      ok: false,
      reason: 'ENCRYPTION_UNAVAILABLE',
    })
  })

  it('开发环境不可加密时允许 enc=false（便于本地调试，但调用方需告警）', () => {
    const r = sealJson({ token: 'x' }, { available: false, isPackaged: false, encrypt })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.envelope.enc).toBe(false)
  })

  it('无法序列化的值返回失败而不是抛错', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const r = sealJson(cyclic, { available: true, isPackaged: true, encrypt });
    expect(r.ok).toBe(false);
  })

  it('加密函数抛错时返回失败，不落明文', () => {
    const boom = (): string => {
      throw new Error('encrypt failed');
    };
    expect(sealJson({ token: 'x' }, { available: true, isPackaged: true, encrypt: boom })).toEqual({
      ok: false,
      reason: 'ENCRYPT_FAILED',
    })
  })
})

describe('openJson', () => {
  it('密文信封可解出原值', () => {
    const sealed = sealJson({ token: 'jwt-1' }, { available: true, isPackaged: true, encrypt });
    if (!sealed.ok) throw new Error('seal failed');
    expect(openJson<{ token: string }>(sealed.envelope, { available: true, decrypt })).toEqual({
      ok: true,
      value: { token: 'jwt-1' },
    })
  })

  it('密文不可解密时返回失败，不回退明文、不返回脏数据', () => {
    const r = openJson({ v: 1, enc: true, data: 'ENC(x)' }, { available: false, decrypt });
    expect(r.ok).toBe(false);
  })

  it('兼容旧明文信封 enc=false', () => {
    expect(
      openJson({ v: 1, enc: false, data: JSON.stringify({ token: 'legacy' }) }, { available: false, decrypt }),
    ).toEqual({ ok: true, value: { token: 'legacy' } })
  })

  it('解密结果不是合法 JSON 时返回失败', () => {
    expect(openJson({ v: 1, enc: true, data: 'x' }, { available: true, decrypt: () => 'not-json' }).ok).toBe(false)
  })

  it('非法结构返回失败而不是抛错', () => {
    expect(openJson(null, { available: true, decrypt }).ok).toBe(false)
    expect(openJson('junk', { available: true, decrypt }).ok).toBe(false)
    expect(openJson({}, { available: true, decrypt }).ok).toBe(false)
    expect(openJson({ v: 2, enc: true, data: 'x' }, { available: true, decrypt }).ok).toBe(false)
  })
})

describe('isEnvelope', () => {
  it('只认 v=1 且含字符串 data 的对象', () => {
    expect(isEnvelope({ v: 1, enc: true, data: 'x' })).toBe(true)
    expect(isEnvelope({ v: 1, enc: false, data: 'x' })).toBe(true)
    expect(isEnvelope({ token: 'x' })).toBe(false)
    expect(isEnvelope({ v: 1, enc: true })).toBe(false)
    expect(isEnvelope(null)).toBe(false)
  })
})
