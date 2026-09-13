/**
 * update-manifest —— 自动更新发布清单的签名校验（安全审计 S-01）。
 *
 * 背景：electron-updater 的 generic provider 只校验 latest.yml 里的 sha512/size，
 * 而清单与安装包放在同一台服务器同一路径 —— 能换包的人也能同时改哈希，校验形同虚设：
 * 拿到更新服务器（或 CDN / DNS / TLS 中间人）即可让全量客户端静默安装任意程序。
 *
 * 修法（客户端侧）：服务端用 Ed25519 私钥对 latest.yml 原始字节签名，客户端内置公钥验签。
 * 本模块只做「验签判定」，零 electron 依赖，可用 node:crypto 单测。
 *
 * 注意：验签必须对**原始字节**做（见 payload 支持 Buffer），
 * 服务端签名与客户端取到的字节必须逐字节一致（不要做换行/编码归一化）。
 */
import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto'

export type ManifestVerifyFailure = 'NO_KEY' | 'NO_SIG' | 'BAD_SIG' | 'BAD_KEY' | 'EMPTY'

export type ManifestVerifyResult = { ok: true } | { ok: false; reason: ManifestVerifyFailure }

/** Ed25519 SPKI DER 前缀：32 字节裸公钥需要补上它才能交给 node:crypto */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Ed25519 签名固定 64 字节 */
const ED25519_SIGNATURE_BYTES = 64

/**
 * 解析公钥：接受 32 字节裸公钥（base64）或完整 SPKI DER（base64）。
 * 返回 null 表示形态不可用（交由调用方判定为 BAD_KEY）。
 */
function parsePublicKey(publicKeyBase64: string): KeyObject | null {
  const raw = Buffer.from(publicKeyBase64.trim(), 'base64')
  if (raw.length === 32) {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
  }
  if (raw.length > 32) {
    return createPublicKey({ key: raw, format: 'der', type: 'spki' })
  }
  return null
}

/**
 * 校验发布清单签名。
 *
 * @param payload latest.yml 的原始内容（字符串按 UTF-8 取字节；要严格一致请传 Buffer）
 * @param signatureBase64 签名内容（base64，允许带换行/空格）
 * @param publicKeyBase64 内置公钥（base64，32 字节裸公钥或 SPKI DER）
 */
export function verifyLatestYml(
  payload: string | Buffer,
  signatureBase64: string | null | undefined,
  publicKeyBase64: string | null | undefined,
): ManifestVerifyResult {
  const data = Buffer.isBuffer(payload) ? payload : typeof payload === 'string' ? Buffer.from(payload, 'utf8') : null
  if (!data || data.length === 0) return { ok: false, reason: 'EMPTY' }
  if (typeof publicKeyBase64 !== 'string' || !publicKeyBase64.trim()) return { ok: false, reason: 'NO_KEY' }
  if (typeof signatureBase64 !== 'string' || !signatureBase64.trim()) return { ok: false, reason: 'NO_SIG' }

  let key: KeyObject | null
  try {
    key = parsePublicKey(publicKeyBase64)
  } catch {
    return { ok: false, reason: 'BAD_KEY' }
  }
  if (!key) return { ok: false, reason: 'BAD_KEY' }

  const signature = Buffer.from(signatureBase64.trim(), 'base64')
  if (signature.length !== ED25519_SIGNATURE_BYTES) return { ok: false, reason: 'BAD_SIG' }

  try {
    // Ed25519 走 null 摘要（算法由密钥类型决定）
    return cryptoVerify(null, data, key, signature) ? { ok: true } : { ok: false, reason: 'BAD_SIG' }
  } catch {
    return { ok: false, reason: 'BAD_SIG' }
  }
}

/**
 * 是否处于「必须有签名」的严格模式。默认严格；
 * 仅当显式设置 ST_UPDATE_ALLOW_UNSIGNED=1/true 时放松（灰度过渡态，调用方需记 warn）。
 */
export function isStrictUpdateMode(env: Record<string, string | undefined> | null | undefined): boolean {
  const raw = env?.ST_UPDATE_ALLOW_UNSIGNED
  if (typeof raw !== 'string') return true
  const value = raw.trim().toLowerCase()
  return !(value === '1' || value === 'true')
}
/** Ed25519 PKCS8 DER 前缀：32 字节裸种子需要补上它才能交给 node:crypto */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** 解析签名私钥：支持 PKCS8 PEM 全文，或 32 字节裸种子（base64） */
function parsePrivateKey(privateKeyPemOrSeedBase64: string): KeyObject {
  const raw = privateKeyPemOrSeedBase64.trim()
  if (!raw) throw new Error('签名私钥为空')
  if (raw.includes('-----BEGIN')) return createPrivateKey(raw)
  const seed = Buffer.from(raw, 'base64')
  if (seed.length !== 32) throw new Error('裸私钥必须是 32 字节 Ed25519 种子（base64）')
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  })
}

/**
 * 对发布清单签名（服务端 / 打包脚本侧使用，客户端不会拿到私钥）。
 *
 * 签名对象必须是**将要放到服务器上的那些字节**：先定稿 latest.yml 内容再签，
 * 客户端拿到什么就验什么（本函数按 UTF-8 取字节，脚本写文件也用同一份字符串）。
 *
 * @param privateKeyPemOrSeedBase64 PKCS8 PEM 全文，或 32 字节 Ed25519 种子（base64）
 * @returns base64 签名（写入 latest.yml.sig）
 */
export function signLatestYml(payload: string | Buffer, privateKeyPemOrSeedBase64: string): string {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8')
  return cryptoSign(null, data, parsePrivateKey(privateKeyPemOrSeedBase64)).toString('base64')
}

/**
 * 由私钥导出配套公钥（base64 SPKI DER），供运维生成客户端内置的 ST_UPDATE_PUBKEY。
 * 私钥一旦泄露即可伪造更新，务必只在发布机/CI 中使用。
 */
export function publicKeyFromPrivateKey(privateKeyPemOrSeedBase64: string): string {
  const publicKey = createPublicKey(parsePrivateKey(privateKeyPemOrSeedBase64))
  return (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).toString('base64')
}
