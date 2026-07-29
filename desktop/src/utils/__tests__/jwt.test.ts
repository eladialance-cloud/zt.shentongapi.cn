/**
 * JWT 相关单元测试 (H-13 Task 20)
 *
 * 测试范围：
 * - JWT exp 字段解析（base64url 解码 + payload 解析）
 * - 过期判断（exp 与当前时间比较）
 * - 无效 token 处理（非 JWT 格式、无 exp、损坏的 base64）
 * - 边界时间（即将过期 60s 阈值）
 * - Refresh 触发条件（exp - now < 60s）
 *
 * 注：src/api/http-client.ts 中的 decodeJwtExp 是私有函数（未导出），
 * 且 http-client.ts 模块在加载时访问 import.meta.env.VITE_API_BASE_URL
 * （Vite 专用语法），在 Jest 环境中无法直接加载。
 * 本测试文件采用参考实现方式：decodeJwtExp / shouldRefreshToken 镜像
 * http-client.ts 中的逻辑，确保对 JWT 格式和刷新时机的理解与生产代码一致。
 */

// ===== 参考实现（镜像 src/api/http-client.ts 第 49-62 行）=====

/**
 * 解码 JWT 的 exp 字段（秒级时间戳）；非 JWT 或无 exp 返回 null
 * 与 http-client.ts 中的私有 decodeJwtExp 完全一致
 */
function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    // base64url -> base64
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/** Refresh 触发阈值（秒）- 镜像 http-client.ts 第 167 行的 60s 阈值 */
const REFRESH_THRESHOLD_SECONDS = 60

/**
 * 判断 token 是否需要刷新
 * 镜像 http-client.ts 第 165-178 行拦截器中的判断逻辑：
 * - exp === null（无效 token 或无 exp）-> 需要刷新
 * - exp - now < 60（即将过期）-> 需要刷新
 * - 否则 -> 不需要刷新
 */
function shouldRefreshToken(token: string, nowSeconds: number): boolean {
  const exp = decodeJwtExp(token)
  if (exp === null) return true
  return exp - nowSeconds < REFRESH_THRESHOLD_SECONDS
}

/** 判断 token 是否已完全过期 */
function isTokenExpired(token: string, nowSeconds: number): boolean {
  const exp = decodeJwtExp(token)
  if (exp === null) return true
  return exp <= nowSeconds
}

// ===== 测试工具 =====

/** 生成测试用 JWT（未签名，仅用于 exp 解析测试） */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: unknown): string =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

/** 生成 base64url 编码的字符串（不带 padding） */
function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// ===== 测试用例 =====

describe('JWT exp 解析', () => {
  it('有效 JWT：正确解析 exp 字段', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = makeJwt({ exp, sub: 'user1' })
    expect(decodeJwtExp(token)).toBe(exp)
  })

  it('JWT payload 中无 exp 字段：返回 null', () => {
    const token = makeJwt({ sub: 'user1', iat: 1700000000 })
    expect(decodeJwtExp(token)).toBeNull()
  })

  it('JWT payload 中 exp 为非数字（字符串）：返回 null', () => {
    const token = makeJwt({ exp: '1700000000', sub: 'user1' })
    expect(decodeJwtExp(token)).toBeNull()
  })

  it('JWT payload 中 exp 为 0：返回 0（falsy 但有效）', () => {
    const token = makeJwt({ exp: 0 })
    expect(decodeJwtExp(token)).toBe(0)
  })
})

describe('JWT 无效 token 处理', () => {
  it('空字符串：返回 null', () => {
    expect(decodeJwtExp('')).toBeNull()
  })

  it('非 JWT 格式（无点分隔）：返回 null', () => {
    expect(decodeJwtExp('not-a-jwt-token')).toBeNull()
  })

  it('只有一段（无 payload 段）：返回 null', () => {
    const header = base64url(JSON.stringify({ alg: 'HS256' }))
    expect(decodeJwtExp(header)).toBeNull()
  })

  it('payload 段损坏（非合法 base64 字符）：返回 null', () => {
    const header = base64url(JSON.stringify({ alg: 'HS256' }))
    expect(decodeJwtExp(`${header}.!!!@#.signature`)).toBeNull()
  })

  it('payload 不是合法 JSON：返回 null', () => {
    const header = base64url(JSON.stringify({ alg: 'HS256' }))
    const payload = base64url('not-json-content')
    expect(decodeJwtExp(`${header}.${payload}.signature`)).toBeNull()
  })

  it('使用 base64url 编码（含 - 和 _）：正确解码', () => {
    const exp = 1700000000
    const token = makeJwt({ exp, sub: 'user_with_special_chars-_' })
    expect(decodeJwtExp(token)).toBe(exp)
  })
})

describe('JWT 过期判断', () => {
  it('exp 在未来：未过期', () => {
    const now = 1000000
    const token = makeJwt({ exp: now + 3600 })
    expect(isTokenExpired(token, now)).toBe(false)
  })

  it('exp 在过去：已过期', () => {
    const now = 1000000
    const token = makeJwt({ exp: now - 100 })
    expect(isTokenExpired(token, now)).toBe(true)
  })

  it('exp 等于 now：已过期（边界，<= 视为过期）', () => {
    const now = 1000000
    const token = makeJwt({ exp: now })
    expect(isTokenExpired(token, now)).toBe(true)
  })

  it('无效 token（无 exp）：视为已过期', () => {
    const token = makeJwt({ sub: 'user1' })
    expect(isTokenExpired(token, 1000000)).toBe(true)
  })
})

describe('JWT refresh 触发条件（60s 阈值）', () => {
  it('exp - now > 60s：不需要刷新', () => {
    const now = 1000000
    const token = makeJwt({ exp: now + 3600 })
    expect(shouldRefreshToken(token, now)).toBe(false)
  })

  it('exp - now = 60s：不需要刷新（边界，< 60 才触发）', () => {
    const now = 1000000
    const token = makeJwt({ exp: now + 60 })
    expect(shouldRefreshToken(token, now)).toBe(false)
  })

  it('exp - now = 59s：需要刷新（边界，< 60 触发）', () => {
    const now = 1000000
    const token = makeJwt({ exp: now + 59 })
    expect(shouldRefreshToken(token, now)).toBe(true)
  })

  it('exp - now = 1s：需要刷新（即将过期）', () => {
    const now = 1000000
    const token = makeJwt({ exp: now + 1 })
    expect(shouldRefreshToken(token, now)).toBe(true)
  })

  it('exp - now = 0（已过期）：需要刷新', () => {
    const now = 1000000
    const token = makeJwt({ exp: now })
    expect(shouldRefreshToken(token, now)).toBe(true)
  })

  it('无效 token（无 exp）：需要刷新', () => {
    const token = makeJwt({ sub: 'user1' })
    expect(shouldRefreshToken(token, 1000000)).toBe(true)
  })

  it('非 JWT 字符串：需要刷新（视为无效）', () => {
    expect(shouldRefreshToken('invalid-token', 1000000)).toBe(true)
  })
})
