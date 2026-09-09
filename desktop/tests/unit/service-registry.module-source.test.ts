import * as crypto from 'node:crypto'
import {
  parseModuleSource,
  resolveDownloadUrl,
  computeAssetSha256,
  verifyModuleAsset,
  defaultInstallKindForSource,
} from '../../electron/main/service-registry/module-source'

describe('service-registry module-source', () => {
  test('parseModuleSource：github 带 @ref 与 ?path', () => {
    const s = parseModuleSource('github:someuser/my-skill@v1.2.3?path=/skills/foo')
    expect(s.kind).toBe('github')
    expect(s.repoLocator).toBe('someuser/my-skill')
    expect(s.ref).toBe('v1.2.3')
    expect(s.subpath).toBe('skills/foo')
  })

  test('parseModuleSource：url / file / skillhub / hermes / 无协议前缀', () => {
    expect(parseModuleSource('url:https://a/b.tar.gz')).toMatchObject({ kind: 'url', url: 'https://a/b.tar.gz' })
    expect(parseModuleSource('file:C:\\tmp\\pkg.tar.gz')).toMatchObject({ kind: 'file', url: 'C:\\tmp\\pkg.tar.gz' })
    expect(parseModuleSource('skillhub:my-skill')).toMatchObject({ kind: 'skillhub', id: 'my-skill' })
    expect(parseModuleSource('hermes:my-agent')).toMatchObject({ kind: 'hermes', id: 'my-agent' })
    expect(parseModuleSource('someuser/repo')).toMatchObject({ kind: 'github', repoLocator: 'someuser/repo' })
  })

  test('parseModuleSource：非法来源抛错', () => {
    expect(() => parseModuleSource('')).toThrow(/不能为空/)
    expect(() => parseModuleSource('ftp:https://x')).toThrow(/不支持的模块来源/)
    expect(() => parseModuleSource('github:onlyowner')).toThrow(/owner\/repo/)
  })

  test('resolveDownloadUrl：github 默认 master，带 ref 用 tag', () => {
    expect(resolveDownloadUrl(parseModuleSource('github:a/b@v2.0.0'))).toBe(
      'https://codeload.github.com/a/b/tar.gz/refs/tags/v2.0.0',
    )
    expect(resolveDownloadUrl(parseModuleSource('github:a/b'))).toBe(
      'https://codeload.github.com/a/b/tar.gz/refs/tags/master',
    )
    expect(resolveDownloadUrl(parseModuleSource('url:https://x/y.tar.gz'))).toBe('https://x/y.tar.gz')
  })

  test('computeAssetSha256 与 verifyModuleAsset：sha256 匹配/不匹配', () => {
    const buf = Buffer.from('hello module')
    const sha = computeAssetSha256(buf)
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyModuleAsset(buf, { expectedSha256: sha })).toBe(true)
    expect(verifyModuleAsset(buf, { expectedSha256: '0'.repeat(64) })).toBe(false)
  })

  test('verifyModuleAsset：无校验依据默认拒绝，allowUnverified 才放行', () => {
    expect(verifyModuleAsset(Buffer.from('x'), {})).toBe(false)
    expect(verifyModuleAsset(Buffer.from('x'), { allowUnverified: true })).toBe(true)
  })

  test('verifyModuleAsset：Ed25519 签名验证', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const buf = Buffer.from('signed module')
    const signature = crypto.sign(null, buf, privateKey).toString('base64')
    expect(verifyModuleAsset(buf, { signature, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string })).toBe(true)
    const badSig = crypto.sign(null, Buffer.from('tampered'), privateKey).toString('base64')
    expect(verifyModuleAsset(buf, { signature: badSig, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string })).toBe(false)
  })

  test('defaultInstallKindForSource：按关键词推导', () => {
    expect(defaultInstallKindForSource(parseModuleSource('skillhub:my-skill'))).toBe('skill')
    expect(defaultInstallKindForSource(parseModuleSource('hermes:my-agent'))).toBe('agent')
    expect(defaultInstallKindForSource(parseModuleSource('github:a/b'))).toBeNull()
  })
})