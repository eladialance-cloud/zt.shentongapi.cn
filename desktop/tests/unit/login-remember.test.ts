// 登录页「记住账号」本地存储单测（安全审计 S-53b）
// 锁定的安全属性：任何路径下都不会把密码写进 localStorage；旧版本残留的 password 会被清除。
import {
  LOGIN_REMEMBER_KEY,
  hasLegacyPassword,
  parseRememberedAccount,
  readRememberedAccount,
  serializeRememberedAccount,
  writeRememberedAccount,
} from '@/utils/login-remember'

const raw = () => window.localStorage.getItem(LOGIN_REMEMBER_KEY)

describe('login-remember 序列化', () => {
  it('载荷只含 account，不含 password 字段', () => {
    expect(serializeRememberedAccount('alice')).toBe('{"account":"alice"}')
    expect(serializeRememberedAccount('alice')).not.toContain('password')
  })

  it('parse 只接受字符串 account', () => {
    expect(parseRememberedAccount('{"account":"alice"}')).toBe('alice')
    expect(parseRememberedAccount('{"account":"alice","password":"p"}')).toBe('alice')
    expect(parseRememberedAccount('{"account":123}')).toBe('')
    expect(parseRememberedAccount('{}')).toBe('')
    expect(parseRememberedAccount('null')).toBe('')
    expect(parseRememberedAccount('"alice"')).toBe('')
    expect(parseRememberedAccount('not-json')).toBe('')
    expect(parseRememberedAccount(null)).toBe('')
    expect(parseRememberedAccount(undefined)).toBe('')
  })

  it('hasLegacyPassword 只认含 password 字段的对象', () => {
    expect(hasLegacyPassword('{"account":"a","password":"p"}')).toBe(true)
    expect(hasLegacyPassword('{"account":"a"}')).toBe(false)
    expect(hasLegacyPassword('{"account":"a","password":null}')).toBe(true)
    expect(hasLegacyPassword('nope')).toBe(false)
    expect(hasLegacyPassword('')).toBe(false)
    expect(hasLegacyPassword(null)).toBe(false)
  })
})

describe('login-remember 读写', () => {
  beforeEach(() => window.localStorage.clear())

  it('写入后读回账号，磁盘上没有密码', () => {
    writeRememberedAccount('alice')
    expect(raw()).toBe('{"account":"alice"}')
    expect(readRememberedAccount()).toBe('alice')
  })

  it('传 null 清空', () => {
    writeRememberedAccount('alice')
    writeRememberedAccount(null)
    expect(raw()).toBeNull()
    expect(readRememberedAccount()).toBe('')
  })

  it('读到旧版本明文密码时立即重写为仅账号', () => {
    window.localStorage.setItem(
      LOGIN_REMEMBER_KEY,
      JSON.stringify({ account: 'bob', password: 'super-secret' }),
    )
    expect(readRememberedAccount()).toBe('bob')
    expect(raw()).toBe('{"account":"bob"}')
    expect(raw()).not.toContain('super-secret')
  })

  it('旧版本残留但无账号时不误写', () => {
    window.localStorage.setItem(LOGIN_REMEMBER_KEY, JSON.stringify({ password: 'p' }))
    expect(readRememberedAccount()).toBe('')
    expect(raw()).toBe('{"password":"p"}')
  })

  it('存储内容损坏时返回空串且不抛错', () => {
    window.localStorage.setItem(LOGIN_REMEMBER_KEY, '{oops')
    expect(readRememberedAccount()).toBe('')
  })
})
