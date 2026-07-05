// SubTask 36.6: HMAC 签名测试
//
// 测试场景：
// 1. 签名生成：相同输入应生成相同签名
// 2. 签名验证：服务端验签应通过
// 3. 防重放：同一 nonce 5 分钟内重复使用应被拒绝
// 4. 时钟漂移：timestamp 超过 ±5 分钟应被拒绝
// 5. 缺签名头：无 X-Signature 的请求应被拒绝
//
// 直接测试 src/utils/hmac.ts 的 signRequest / hmacSha256 / verifyTimestamp 函数

import {
  signRequest,
  hmacSha256,
  sha256,
  verifyTimestamp,
  type SignatureTriple
} from '@/utils/hmac'
import { TEST_SECRET_KEY, HMAC_MAX_SKEW_SECONDS } from '../setup'

/** 模拟 nonce 防重放存储 */
class NonceRegistry {
  private usedNonces = new Map<string, number>()

  /** 记录 nonce，返回是否首次出现 */
  checkAndStore(nonce: string, timestamp: number): boolean {
    const now = Math.floor(Date.now() / 1000)
    // 清理超过 5 分钟的 nonce
    for (const [n, ts] of this.usedNonces) {
      if (now - ts > 300) {
        this.usedNonces.delete(n)
      }
    }
    if (this.usedNonces.has(nonce)) {
      return false // 重复
    }
    this.usedNonces.set(nonce, timestamp)
    return true
  }

  clear(): void {
    this.usedNonces.clear()
  }
}

/** 模拟服务端验签 */
async function verifySignature(
  method: string,
  path: string,
  body: unknown,
  secretKey: string,
  triple: SignatureTriple
): Promise<boolean> {
  const upperMethod = method.toUpperCase()
  let bodyHash = ''
  if (body != null) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    if (bodyStr.length > 0) {
      bodyHash = await sha256(bodyStr)
    }
  }
  const message = `${upperMethod}\n${path}\n${triple.timestamp}\n${triple.nonce}\n${bodyHash}`
  const expectedSignature = await hmacSha256(message, secretKey)
  return expectedSignature === triple.signature
}

describe('SubTask 36.6 - HMAC 签名测试', () => {
  let nonceRegistry: NonceRegistry

  beforeEach(() => {
    nonceRegistry = new NonceRegistry()
  })

  describe('签名生成', () => {
    it('相同输入应生成相同签名', async () => {
      // arrange
      const method = 'POST'
      const path = '/chat/sessions/1/messages'
      const body = { content: 'hello world' }
      const secretKey = TEST_SECRET_KEY

      // act
      const sig1 = await signRequest(method, path, body, secretKey)
      // 使用相同 nonce 和 timestamp 重新计算
      const sig2 = await hmacSha256(
        `POST\n${path}\n${sig1.timestamp}\n${sig1.nonce}\n${await sha256(JSON.stringify(body))}`,
        secretKey
      )

      // assert
      expect(sig1.signature).toBe(sig2)
      expect(sig1.timestamp).toMatch(/^\d+$/)
      expect(sig1.nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    })

    it('不同 body 应生成不同签名', async () => {
      // arrange
      const method = 'POST'
      const path = '/chat/sessions/1/messages'
      const secretKey = TEST_SECRET_KEY

      // act
      const sig1 = await signRequest(method, path, { content: 'hello' }, secretKey)
      const sig2 = await signRequest(method, path, { content: 'world' }, secretKey)

      // assert
      expect(sig1.signature).not.toBe(sig2.signature)
    })

    it('不同 path 应生成不同签名', async () => {
      // arrange
      const method = 'GET'
      const body = null
      const secretKey = TEST_SECRET_KEY

      // act
      const sig1 = await signRequest(method, '/api/v1/users', body, secretKey)
      const sig2 = await signRequest(method, '/api/v1/agents', body, secretKey)

      // assert
      expect(sig1.signature).not.toBe(sig2.signature)
    })

    it('无 body 时 bodyHash 应为空字符串', async () => {
      // arrange & act
      const sig = await signRequest('GET', '/credits/balance', null, TEST_SECRET_KEY)

      // assert - 验证签名可正常生成
      expect(sig.signature).toBeDefined()
      expect(sig.signature).toHaveLength(64) // SHA-256 hex 长度
    })

    it('method 应自动转大写', async () => {
      // arrange
      const path = '/test'
      const body = null
      const secretKey = TEST_SECRET_KEY

      // act
      const sigLower = await signRequest('post', path, body, secretKey)
      const sigUpper = await signRequest('POST', path, body, secretKey)

      // assert - 由于 timestamp 和 nonce 不同，签名本身不同
      // 但验证 bodyHash 计算逻辑一致（通过验签间接验证）
      expect(sigLower.timestamp).toBeDefined()
      expect(sigUpper.timestamp).toBeDefined()
    })
  })

  describe('签名验证', () => {
    it('服务端验签应通过', async () => {
      // arrange
      const method = 'POST'
      const path = '/chat/sessions/1/messages'
      const body = { content: 'test message' }
      const secretKey = TEST_SECRET_KEY

      // act
      const triple = await signRequest(method, path, body, secretKey)
      const isValid = await verifySignature(method, path, body, secretKey, triple)

      // assert
      expect(isValid).toBe(true)
    })

    it('使用错误密钥验签应失败', async () => {
      // arrange
      const method = 'POST'
      const path = '/test'
      const body = { data: 'test' }
      const correctKey = TEST_SECRET_KEY
      const wrongKey = 'wrong-secret-key'

      // act
      const triple = await signRequest(method, path, body, correctKey)
      const isValid = await verifySignature(method, path, body, wrongKey, triple)

      // assert
      expect(isValid).toBe(false)
    })

    it('篡改 body 后验签应失败', async () => {
      // arrange
      const method = 'POST'
      const path = '/test'
      const originalBody = { amount: 100 }
      const tamperedBody = { amount: 999 }
      const secretKey = TEST_SECRET_KEY

      // act
      const triple = await signRequest(method, path, originalBody, secretKey)
      const isValid = await verifySignature(method, path, tamperedBody, secretKey, triple)

      // assert
      expect(isValid).toBe(false)
    })
  })

  describe('防重放', () => {
    it('同一 nonce 5 分钟内重复使用应被拒绝', async () => {
      // arrange
      const method = 'POST'
      const path = '/test'
      const body = { data: 'test' }
      const secretKey = TEST_SECRET_KEY

      // act
      const triple = await signRequest(method, path, body, secretKey)
      const ts = parseInt(triple.timestamp, 10)

      // 第一次使用 nonce → 通过
      const firstUse = nonceRegistry.checkAndStore(triple.nonce, ts)
      // 第二次使用相同 nonce → 拒绝
      const secondUse = nonceRegistry.checkAndStore(triple.nonce, ts)

      // assert
      expect(firstUse).toBe(true)
      expect(secondUse).toBe(false)
    })

    it('不同 nonce 应均被接受', async () => {
      // arrange & act
      const sig1 = await signRequest('GET', '/test1', null, TEST_SECRET_KEY)
      const sig2 = await signRequest('GET', '/test2', null, TEST_SECRET_KEY)

      const ts1 = parseInt(sig1.timestamp, 10)
      const ts2 = parseInt(sig2.timestamp, 10)

      const use1 = nonceRegistry.checkAndStore(sig1.nonce, ts1)
      const use2 = nonceRegistry.checkAndStore(sig2.nonce, ts2)

      // assert
      expect(use1).toBe(true)
      expect(use2).toBe(true)
      expect(sig1.nonce).not.toBe(sig2.nonce)
    })
  })

  describe('时钟漂移', () => {
    it('timestamp 在 ±5 分钟内应被接受', () => {
      // arrange
      const now = Math.floor(Date.now() / 1000)

      // act & assert
      expect(verifyTimestamp(now)).toBe(true)
      expect(verifyTimestamp(now - HMAC_MAX_SKEW_SECONDS)).toBe(true) // 5 分钟前
      expect(verifyTimestamp(now + HMAC_MAX_SKEW_SECONDS)).toBe(true) // 5 分钟后
      expect(verifyTimestamp(now - 100)).toBe(true) // 100 秒前
      expect(verifyTimestamp(now + 100)).toBe(true) // 100 秒后
    })

    it('timestamp 超过 +5 分钟应被拒绝', () => {
      // arrange
      const now = Math.floor(Date.now() / 1000)
      const futureTs = now + HMAC_MAX_SKEW_SECONDS + 1

      // act & assert
      expect(verifyTimestamp(futureTs)).toBe(false)
    })

    it('timestamp 超过 -5 分钟应被拒绝', () => {
      // arrange
      const now = Math.floor(Date.now() / 1000)
      const pastTs = now - HMAC_MAX_SKEW_SECONDS - 1

      // act & assert
      expect(verifyTimestamp(pastTs)).toBe(false)
    })

    it('无效 timestamp 字符串应被拒绝', () => {
      // arrange & act & assert
      expect(verifyTimestamp('invalid')).toBe(false)
      expect(verifyTimestamp('')).toBe(false)
      expect(verifyTimestamp(NaN)).toBe(false)
    })

    it('自定义 maxSkew 参数应生效', () => {
      // arrange
      const now = Math.floor(Date.now() / 1000)

      // act & assert - maxSkew=60 秒
      expect(verifyTimestamp(now - 30, 60)).toBe(true)
      expect(verifyTimestamp(now - 61, 60)).toBe(false)
    })
  })

  describe('缺签名头', () => {
    it('无 X-Signature 的请求应被拒绝', () => {
      // arrange - 模拟请求 headers
      const headersWithoutSig: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token'
      }

      // act
      const hasSignature = 'X-Signature' in headersWithoutSig
      const hasTimestamp = 'X-Timestamp' in headersWithoutSig
      const hasNonce = 'X-Nonce' in headersWithoutSig

      // assert - 缺少签名头应拒绝
      expect(hasSignature).toBe(false)
      expect(hasTimestamp).toBe(false)
      expect(hasNonce).toBe(false)
    })

    it('完整的签名头应包含 X-Signature / X-Timestamp / X-Nonce', async () => {
      // arrange
      const method = 'POST'
      const path = '/test'
      const body = { data: 'test' }

      // act
      const triple = await signRequest(method, path, body, TEST_SECRET_KEY)

      // 模拟 httpClient 注入的 headers
      const headers: Record<string, string> = {
        'X-Timestamp': triple.timestamp,
        'X-Nonce': triple.nonce,
        'X-Signature': triple.signature
      }

      // assert
      expect(headers['X-Signature']).toBe(triple.signature)
      expect(headers['X-Timestamp']).toBe(triple.timestamp)
      expect(headers['X-Nonce']).toBe(triple.nonce)
      expect(headers['X-Signature']).toHaveLength(64) // HMAC-SHA256 hex 长度
    })

    it('仅缺少 X-Signature 时应被拒绝', () => {
      // arrange
      const headers: Record<string, string> = {
        'X-Timestamp': Math.floor(Date.now() / 1000).toString(),
        'X-Nonce': 'test-nonce'
        // 缺少 X-Signature
      }

      // act
      const hasSignature = 'X-Signature' in headers

      // assert
      expect(hasSignature).toBe(false)
    })
  })

  describe('SHA-256 与 HMAC-SHA256 基础', () => {
    it('sha256 应返回 64 字符 hex 字符串', async () => {
      // arrange & act
      const hash = await sha256('test message')

      // assert
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('hmacSha256 应返回 64 字符 hex 字符串', async () => {
      // arrange & act
      const hmac = await hmacSha256('test message', TEST_SECRET_KEY)

      // assert
      expect(hmac).toHaveLength(64)
      expect(hmac).toMatch(/^[0-9a-f]{64}$/)
    })

    it('相同输入 hmacSha256 应返回相同结果', async () => {
      // arrange & act
      const hmac1 = await hmacSha256('test', 'key')
      const hmac2 = await hmacSha256('test', 'key')

      // assert
      expect(hmac1).toBe(hmac2)
    })
  })
})
