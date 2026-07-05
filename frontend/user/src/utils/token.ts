// JWT Token 工具
// 用于本地校验 token 过期，避免依赖后端探针
// 注意：仅做客户端预校验，最终鉴权仍由后端判定

interface JwtPayload {
  exp?: number;
  [key: string]: unknown;
}

/**
 * 解码 JWT payload（不验证签名）
 * 返回 null 表示 token 格式非法
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // atob 解 base64，处理 URL-safe 与 padding
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '='
    );
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * 校验 token 是否已过期
 * - 无 exp 字段视为永久有效（返回 false）
 * - 格式非法视为已过期（返回 true）
 * @param token JWT access token
 * @param skewMs 提前量（ms），默认 30s，避免边界时钟漂移
 */
export function isTokenExpired(token: string | null | undefined, skewMs = 30_000): boolean {
  if (!token) return true;
  const payload = decodeJwt(token);
  if (!payload) return true;
  if (typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 - skewMs < Date.now();
}
