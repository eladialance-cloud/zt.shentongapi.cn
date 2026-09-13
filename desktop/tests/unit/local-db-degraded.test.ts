// 本地库降级状态单测（安全审计 S-45）
// 锁定的行为：降级必须带原因码（而不是一个布尔值）；原因详情脱敏 + 截断；
// 渲染层是否提示、提示什么，完全由纯函数决定（接线见 src/utils/local-db-notice.ts）。
import {
  LOCAL_DB_DEGRADED_CODES,
  LOCAL_DB_STATUS_UNKNOWN,
  buildLocalDbStatus,
  describeLocalDbDegraded,
  localDbDegradedNotice,
  normalizeDegradedCode,
  sanitizeDegradedReason,
} from '../../electron/shared/local-db-status'

describe('normalizeDegradedCode', () => {
  it('已知原因码原样返回（含首尾空白归一）', () => {
    for (const code of LOCAL_DB_DEGRADED_CODES) {
      expect(normalizeDegradedCode(code)).toBe(code)
    }
    expect(normalizeDegradedCode('  KEY_MISMATCH  ')).toBe('KEY_MISMATCH')
  })

  it('未知 / 非法入参一律归为 UNKNOWN', () => {
    for (const raw of ['nope', '', '   ', null, undefined, 42, true, {}, [], () => {}]) {
      expect(normalizeDegradedCode(raw)).toBe('UNKNOWN')
    }
  })

  it('原因码清单无重复', () => {
    expect(new Set(LOCAL_DB_DEGRADED_CODES).size).toBe(LOCAL_DB_DEGRADED_CODES.length)
  })
})

describe('sanitizeDegradedReason', () => {
  it('Error 取 message，字符串去空白', () => {
    expect(sanitizeDegradedReason(new Error('boom'))).toBe('boom')
    expect(sanitizeDegradedReason('  disk full  ')).toBe('disk full')
  })

  it('空内容 / 非字符串非 Error 返回 null', () => {
    expect(sanitizeDegradedReason('')).toBeNull()
    expect(sanitizeDegradedReason('   ')).toBeNull()
    expect(sanitizeDegradedReason(null)).toBeNull()
    expect(sanitizeDegradedReason(42)).toBeNull()
    expect(sanitizeDegradedReason({})).toBeNull()
  })

  it('抹掉密钥形态的长 hex（错误信息可能回显 PRAGMA key 的 SQL）', () => {
    const key = 'a'.repeat(64)
    const msg = 'near "x\'' + key + '\'": syntax error'
    const out = sanitizeDegradedReason(msg)
    expect(out).not.toContain(key)
    expect(out).toContain('[redacted]')
  })

  it('按 maxChars 截断', () => {
    expect(sanitizeDegradedReason('x'.repeat(300))!.length).toBe(200)
    expect(sanitizeDegradedReason('x'.repeat(300), 10)).toBe('x'.repeat(10))
    // 非法 maxChars 回落到默认 200
    expect(sanitizeDegradedReason('x'.repeat(300), 0)!.length).toBe(200)
    expect(sanitizeDegradedReason('x'.repeat(300), Number.NaN)!.length).toBe(200)
  })
})

describe('buildLocalDbStatus', () => {
  it('未降级：不带原因（即便入参给了 code/reason）', () => {
    const s = buildLocalDbStatus({
      degraded: false,
      initialized: true,
      moduleAvailable: true,
      code: 'KEY_MISMATCH',
      reason: 'x',
      degradedAt: '2026-09-13T00:00:00.000Z',
    })
    expect(s).toEqual({
      degraded: false,
      initialized: true,
      moduleAvailable: true,
      code: null,
      reason: null,
      degradedAt: null,
    })
  })

  it('降级：原因码归一 + 时间转 ISO', () => {
    const s = buildLocalDbStatus({
      degraded: true,
      initialized: false,
      moduleAvailable: false,
      code: 'MODULE_UNAVAILABLE',
      reason: '  sqlcipher not available  ',
      degradedAt: '2026-09-13T08:00:00+08:00',
    })
    expect(s.degraded).toBe(true)
    expect(s.code).toBe('MODULE_UNAVAILABLE')
    expect(s.reason).toBe('sqlcipher not available')
    expect(s.degradedAt).toBe(new Date('2026-09-13T08:00:00+08:00').toISOString())
  })

  it('入参按不可信处理：脏值不抛错', () => {
    const s = buildLocalDbStatus({
      degraded: 'yes',
      initialized: 1,
      moduleAvailable: 'true',
      code: 'whatever',
      reason: 42,
      degradedAt: 'not-a-date',
    })
    expect(s).toEqual({
      degraded: false,
      initialized: false,
      moduleAvailable: false,
      code: null,
      reason: null,
      degradedAt: null,
    })

    const degraded = buildLocalDbStatus({ degraded: true, degradedAt: 'not-a-date' })
    expect(degraded.code).toBe('UNKNOWN')
    expect(degraded.reason).toBeNull()
    expect(degraded.degradedAt).toBeNull()
  })
})

describe('describeLocalDbDegraded', () => {
  it('每个原因码都有独立文案，且都说明「改走云端」', () => {
    const texts = LOCAL_DB_DEGRADED_CODES.map((c) => describeLocalDbDegraded(c))
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).toContain('云端')
    }
    expect(new Set(texts).size).toBe(LOCAL_DB_DEGRADED_CODES.length)
  })

  it('null / UNKNOWN 走兜底文案', () => {
    expect(describeLocalDbDegraded(null)).toBe(describeLocalDbDegraded('UNKNOWN'))
    expect(describeLocalDbDegraded(null)).toContain('云端')
  })
})

describe('localDbDegradedNotice', () => {
  it('降级才提示，文案与原因码对应', () => {
    expect(
      localDbDegradedNotice({ degraded: true, code: 'MODULE_UNAVAILABLE' }),
    ).toBe(describeLocalDbDegraded('MODULE_UNAVAILABLE'))
    expect(localDbDegradedNotice({ degraded: true, code: 'KEY_MISMATCH' })).toBe(
      describeLocalDbDegraded('KEY_MISMATCH'),
    )
  })

  it('降级但原因码缺失 / 非法：仍提示（兜底文案）', () => {
    expect(localDbDegradedNotice({ degraded: true })).toBe(describeLocalDbDegraded(null))
    expect(localDbDegradedNotice({ degraded: true, code: 'garbage' })).toBe(
      describeLocalDbDegraded('UNKNOWN'),
    )
  })

  it('未降级 / 非法入参：不提示', () => {
    for (const raw of [
      null,
      undefined,
      'degraded',
      42,
      {},
      { degraded: false, code: 'MODULE_UNAVAILABLE' },
      { degraded: 'true' },
    ]) {
      expect(localDbDegradedNotice(raw)).toBeNull()
    }
  })

  it('LOCAL_DB_STATUS_UNKNOWN 兜底值本身不触发提示', () => {
    expect(localDbDegradedNotice(LOCAL_DB_STATUS_UNKNOWN)).toBeNull()
    expect(Object.isFrozen(LOCAL_DB_STATUS_UNKNOWN)).toBe(true)
  })
})
