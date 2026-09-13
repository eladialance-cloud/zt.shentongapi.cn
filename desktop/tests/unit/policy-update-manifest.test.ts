// latest.yml 发布清单验签回归测试（安全审计 S-01）
//
// 背景：generic provider 只校验 latest.yml 里的 sha512，而清单与安装包放在同一台服务器 ——
// 能换包的人也能同时换哈希，校验形同虚设。修法是服务端用私钥对清单签名、客户端内置公钥验签。
// 本测试用 node:crypto 现生成的 Ed25519 密钥对覆盖验签契约（不引入任何新依赖）。
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import {
  isStrictUpdateMode,
  publicKeyFromPrivateKey,
  signLatestYml,
  verifyLatestYml,
} from '../../electron/main/policy/update-manifest'

const payload = [
  'version: 2.1.5',
  'files:',
  '  - url: ShenTongAI-Setup-2.1.5-x64.exe',
  '    sha512: abcdef',
  '    size: 123',
  'path: ShenTongAI-Setup-2.1.5-x64.exe',
  '',
].join('\n')

const kp = (() => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string }
  const raw = Buffer.from(jwk.x.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return { privateKey, derBase64: der.toString('base64'), rawBase64: raw.toString('base64') }
})()

const sigOf = (data: string | Buffer): string =>
  cryptoSign(null, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), kp.privateKey).toString('base64')

describe('verifyLatestYml', () => {
  it('DER(SPKI) 公钥 + 正确签名 → ok', () => {
    expect(verifyLatestYml(payload, sigOf(payload), kp.derBase64)).toEqual({ ok: true })
  })

  it('32 字节裸公钥（base64）同样接受', () => {
    expect(verifyLatestYml(payload, sigOf(payload), kp.rawBase64)).toEqual({ ok: true })
  })

  it('支持 Buffer 负载（按原始字节验签）', () => {
    const buf = Buffer.from(payload, 'utf8')
    expect(verifyLatestYml(buf, sigOf(buf), kp.derBase64)).toEqual({ ok: true })
  })

  it('清单被篡改 → BAD_SIG', () => {
    expect(verifyLatestYml(payload + '# tampered' + '\n', sigOf(payload), kp.derBase64)).toEqual({
      ok: false,
      reason: 'BAD_SIG',
    })
  })

  it('签名来自其它密钥 → BAD_SIG', () => {
    const other = generateKeyPairSync('ed25519')
    const otherSig = cryptoSign(null, Buffer.from(payload, 'utf8'), other.privateKey).toString('base64')
    expect(verifyLatestYml(payload, otherSig, kp.derBase64)).toEqual({ ok: false, reason: 'BAD_SIG' })
  })

  it('签名带换行 / 空格仍可验签', () => {
    expect(verifyLatestYml(payload, '\n  ' + sigOf(payload) + ' \n', kp.derBase64)).toEqual({ ok: true })
  })

  it('缺公钥 / 缺签名 / 空清单 / 坏公钥 / 坏签名长度 → 明确失败码', () => {
    expect(verifyLatestYml(payload, sigOf(payload), '')).toEqual({ ok: false, reason: 'NO_KEY' })
    expect(verifyLatestYml(payload, '   ', kp.derBase64)).toEqual({ ok: false, reason: 'NO_SIG' })
    expect(verifyLatestYml('', sigOf(''), kp.derBase64)).toEqual({ ok: false, reason: 'EMPTY' })
    expect(verifyLatestYml(payload, sigOf(payload), 'not-a-key')).toEqual({ ok: false, reason: 'BAD_KEY' })
    expect(verifyLatestYml(payload, Buffer.from('short').toString('base64'), kp.derBase64)).toEqual({
      ok: false,
      reason: 'BAD_SIG',
    })
  })
})

describe('isStrictUpdateMode', () => {
  it('默认严格（未设置 ST_UPDATE_ALLOW_UNSIGNED）', () => {
    expect(isStrictUpdateMode({})).toBe(true)
    expect(isStrictUpdateMode({ ST_UPDATE_ALLOW_UNSIGNED: '0' })).toBe(true)
  })

  it('仅显式允许未签名清单时放松', () => {
    expect(isStrictUpdateMode({ ST_UPDATE_ALLOW_UNSIGNED: '1' })).toBe(false)
    expect(isStrictUpdateMode({ ST_UPDATE_ALLOW_UNSIGNED: 'true' })).toBe(false)
  })

  it('入参异常时 fail-safe 为严格', () => {
    expect(isStrictUpdateMode(null as unknown as Record<string, string>)).toBe(true)
    expect(isStrictUpdateMode(undefined as unknown as Record<string, string>)).toBe(true)
  })
})
describe('signLatestYml / publicKeyFromPrivateKey（服务端侧辅助）', () => {
  it('签名 → 用导出的公钥验签通过（往返一致）', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string
    const pub = publicKeyFromPrivateKey(pem)
    const sig = signLatestYml(payload, pem)
    expect(verifyLatestYml(payload, sig, pub)).toEqual({ ok: true })
  })

  it('32 字节裸种子（base64）与 PKCS8 PEM 等价', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer
    const seed = pkcs8.subarray(pkcs8.length - 32).toString('base64')
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string
    expect(publicKeyFromPrivateKey(seed)).toBe(publicKeyFromPrivateKey(pem))
    expect(verifyLatestYml(payload, signLatestYml(payload, seed), publicKeyFromPrivateKey(pem))).toEqual({ ok: true })
  })

  it('坏私钥明确抛错（不产出坏签名）', () => {
    expect(() => signLatestYml(payload, '')).toThrow(/私钥/)
    expect(() => signLatestYml(payload, Buffer.from('too-short').toString('base64'))).toThrow(/32 字节/)
  })
})
