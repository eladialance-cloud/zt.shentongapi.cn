/**
 * secret-box —— 对称信封（安全审计 S-05 / S-61）
 *
 * 为什么不用 Electron safeStorage 直接加密 auth.json：
 * - auth.json 的读者不只有主进程。Hermes 运行时（独立 node 进程）里的工具卡脚本
 *   （knowledge-query / n8n-run-workflow）也要读 token，它们拿不到 safeStorage。
 * - 因此采用「随机主密钥 + AES-256-GCM」：主密钥本身由 safeStorage 保护后落盘，
 *   并通过环境变量注入 Hermes 进程；auth.json 落盘的是纯密文。
 *
 * 格式：`v1.<iv b64>.<tag b64>.<ciphertext b64>`（AES-256-GCM，12 字节 IV，16 字节 tag，UTF-8 明文）
 * 该格式刻意保持「无依赖、可跨语言重放」，与 resources/hermes/skills/<name>/scripts/auth-file.mjs 必须逐字节一致。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'v1'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** 生成新的主密钥（base64，32 字节） */
export function generateSecretKey(): string {
  return randomBytes(KEY_BYTES).toString('base64')
}

/** 解码主密钥；非法则抛错（绝不降级为弱加密） */
function keyBuffer(keyB64: unknown): Buffer {
  if (typeof keyB64 !== 'string' || !keyB64) throw new Error('secret-box: 密钥缺失')
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== KEY_BYTES) throw new Error('secret-box: 密钥长度必须是 32 字节')
  // 反向校验：非 base64 字符会被 Buffer 静默丢弃，往返不一致即视为非法
  if (key.toString('base64').replace(/=+$/, '') !== keyB64.replace(/=+$/, '')) {
    throw new Error('secret-box: 密钥不是合法 base64')
  }
  return key
}

/** 是否为可用主密钥（字符串 + 32 字节 base64） */
export function isSecretKey(value: unknown): boolean {
  try {
    keyBuffer(value)
    return true
  } catch {
    return false
  }
}

/** 是否为 secret-box 密文结构 */
export function isSealedBox(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parts = value.split('.')
  return parts.length === 4 && parts[0] === PREFIX
}

/** 加密为 `v1.<iv>.<tag>.<ct>`；密钥非法直接抛错 */
export function sealBox(plain: string, keyB64: string): string {
  const key = keyBuffer(keyB64)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  // 先校验长度：CBC/GCM 参数异常时不同 Node 版本行为不一致，这里统一成可预期结果
  if (tag.length !== TAG_BYTES) throw new Error('secret-box: 认证标签长度异常')
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/** 解密；结构非法、密钥不对、密文被篡改一律抛错（调用方必须按失败处理） */
export function openBox(sealed: string, keyB64: string): string {
  const key = keyBuffer(keyB64)
  if (!isSealedBox(sealed)) throw new Error('secret-box: 不是合法密文结构')
  const parts = (sealed as string).split('.')
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ct = Buffer.from(parts[3], 'base64')
  if (iv.length !== IV_BYTES) throw new Error('secret-box: IV 长度异常')
  if (tag.length !== TAG_BYTES) throw new Error('secret-box: 认证标签长度异常')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
