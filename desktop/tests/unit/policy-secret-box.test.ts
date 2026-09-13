// secret-box 策略层测试（安全审计 S-05 配套）
// 纯函数 AES-256-GCM 信封：主进程用 safeStorage 保护密钥，Hermes 子进程用注入的密钥解密同一份密文。
import { generateSecretKey, isSecretKey, isSealedBox, openBox, sealBox } from '../../electron/main/policy/secret-box'

const KEY = generateSecretKey()

describe('secret-box', () => {
  it('生成 32 字节 base64 密钥且每次都不同', () => {
    const a = generateSecretKey()
    const b = generateSecretKey()
    expect(Buffer.from(a, 'base64')).toHaveLength(32)
    expect(a).not.toBe(b)
    expect(isSecretKey(a)).toBe(true)
  })

  it('非法密钥被判为非密钥', () => {
    expect(isSecretKey('')).toBe(false)
    expect(isSecretKey('short')).toBe(false)
    expect(isSecretKey(123)).toBe(false)
    expect(isSecretKey(null)).toBe(false)
    expect(isSecretKey('!'.repeat(44))).toBe(false)
  })

  it('sealBox / openBox 往返一致', () => {
    const sealed = sealBox('hello 世界', KEY)
    expect(openBox(sealed, KEY)).toBe('hello 世界')
  })

  it('同一明文两次加密结果不同（随机 IV），且都不含明文', () => {
    const a = sealBox('same-secret', KEY)
    const b = sealBox('same-secret', KEY)
    expect(a).not.toBe(b)
    expect(a).not.toContain('same-secret')
    expect(b).not.toContain('same-secret')
  })

  it('sealedBox 结构可识别', () => {
    expect(isSealedBox(sealBox('x', KEY))).toBe(true)
    expect(isSealedBox('v1.a.b.c')).toBe(true)
    expect(isSealedBox('plain text')).toBe(false)
    expect(isSealedBox('v2.a.b.c')).toBe(false)
    expect(isSealedBox(null)).toBe(false)
    expect(isSealedBox({ v1: true })).toBe(false)
  })

  it('换密钥解密失败（不返回脏数据）', () => {
    const sealed = sealBox('secret', KEY)
    expect(() => openBox(sealed, generateSecretKey())).toThrow()
  })

  it('密文被篡改时解密失败（GCM 完整性校验）', () => {
    const sealed = sealBox('secret', KEY)
    const parts = sealed.split('.')
    const raw = Buffer.from(parts[3], 'base64')
    raw[0] = raw[0] ^ 0xff
    const tampered = [parts[0], parts[1], parts[2], raw.toString('base64')].join('.')
    expect(() => openBox(tampered, KEY)).toThrow()
  })

  it('认证标签被篡改时解密失败', () => {
    const sealed = sealBox('secret', KEY)
    const parts = sealed.split('.')
    const tag = Buffer.from(parts[2], 'base64')
    tag[0] = tag[0] ^ 0xff
    const tampered = [parts[0], parts[1], tag.toString('base64'), parts[3]].join('.')
    expect(() => openBox(tampered, KEY)).toThrow()
  })

  it('非法结构解密失败而不是抛未知错误', () => {
    expect(() => openBox('not-a-box', KEY)).toThrow()
    expect(() => openBox('v1.a.b', KEY)).toThrow()
    expect(() => openBox('v1.!!!.!!!.!!!', KEY)).toThrow()
  })

  it('密钥长度非法时抛错而不是降级加密', () => {
    expect(() => sealBox('x', Buffer.alloc(16).toString('base64'))).toThrow()
  })
})
