// 密钥脱敏工具
// 用于日志输出时对 API Key 等敏感信息脱敏，防止明文泄露

/**
 * 对 API Key 脱敏：保留前4后4，中间用 **** 替换
 * - 长度 > 8：返回 `${key.slice(0,4)}****${key.slice(-4)}`
 * - 长度 <= 8：返回 `****`
 * - 空值/非字符串：返回 `****`，不抛异常
 */
export function maskApiKey(key: string | null | undefined): string {
  if (typeof key !== 'string' || key.length === 0) {
    return '****';
  }
  if (key.length <= 8) {
    return '****';
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
