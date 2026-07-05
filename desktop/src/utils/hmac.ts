// HMAC-SHA256 签名工具
// 使用 Web Crypto API（window.crypto.subtle）实现 HMAC-SHA256 和 SHA-256
//
// 签名格式：HMAC-SHA256(`${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`, secretKey)
// - method：大写 HTTP 方法（GET / POST / PUT / DELETE ...）
// - path：URL path（含 query string，不含 host）
// - timestamp：当前时间戳（秒）
// - nonce：UUID v4
// - bodyHash：请求 body 的 SHA-256 hash（hex），无 body 时为空字符串

/** 签名三件套 */
export interface SignatureTriple {
  timestamp: string
  nonce: string
  signature: string
}

/** 字节数组 → hex 字符串 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 生成 UUID v4（利用 crypto.randomUUID 或手动回退） */
function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 回退方案：基于 getRandomValues 手动拼接
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // 版本 4 + 变体位
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 计算 SHA-256 hash（返回 hex 字符串） */
export async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return bytesToHex(new Uint8Array(hashBuffer))
}

/** 计算 HMAC-SHA256（返回 hex 字符串） */
export async function hmacSha256(message: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToHex(new Uint8Array(signature))
}

/**
 * 生成请求签名三件套
 * @param method HTTP 方法（GET / POST ...），内部会转大写
 * @param path URL path（含 query string）
 * @param body 请求 body（对象或字符串，null/undefined 视为无 body）
 * @param secretKey HMAC 密钥
 * @returns { timestamp, nonce, signature }
 */
export async function signRequest(
  method: string,
  path: string,
  body: unknown,
  secretKey: string
): Promise<SignatureTriple> {
  const upperMethod = method.toUpperCase()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = uuidv4()

  // bodyHash：有 body 时计算 SHA-256，无 body 时为空字符串
  let bodyHash = ''
  if (body != null) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    if (bodyStr.length > 0) {
      bodyHash = await sha256(bodyStr)
    }
  }

  const message = `${upperMethod}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`
  const signature = await hmacSha256(message, secretKey)

  return { timestamp, nonce, signature }
}

/**
 * 验证时间戳是否在允许的时钟漂移范围内
 * @param timestamp 待验证的时间戳（秒，字符串或数字）
 * @param maxSkew 最大允许偏差（秒），默认 300（5 分钟）
 * @returns 是否有效
 */
export function verifyTimestamp(timestamp: string | number, maxSkew = 300): boolean {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
  if (isNaN(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  return Math.abs(now - ts) <= maxSkew
}
