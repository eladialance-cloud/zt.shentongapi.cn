/**
 * 环境变量启动校验
 * 防止生产环境使用默认密钥
 */

const DEFAULT_JWT_SECRET = 'change-me-in-production-at-least-32-chars-please';
const DEFAULT_ADMIN_JWT_SECRET = 'change-me-admin-jwt-secret-32-chars';
const DEFAULT_HMAC_SECRET = 'shentong-ai-hmac-secret';
const DEV_AES_KEY = 'dev-only-aes-key-not-for-production-32b';

export function validateJwtSecrets(): void {
  const jwtSecret = process.env.JWT_SECRET;
  const adminJwtSecret = process.env.ADMIN_JWT_SECRET;
  const aesKey = process.env.AES_KEY;
  const hmacSecret = process.env.HMAC_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  const errors: string[] = [];

  if (!jwtSecret) {
    errors.push('JWT_SECRET 未设置，请在 .env 中配置');
  } else if (jwtSecret === DEFAULT_JWT_SECRET) {
    errors.push('JWT_SECRET 不能使用默认占位值，请修改 .env 中的 JWT_SECRET');
  }

  if (!adminJwtSecret) {
    errors.push('ADMIN_JWT_SECRET 未设置，请在 .env 中配置');
  } else if (adminJwtSecret === DEFAULT_ADMIN_JWT_SECRET) {
    errors.push('ADMIN_JWT_SECRET 不能使用默认占位值，请修改 .env 中的 ADMIN_JWT_SECRET');
  }

  if (jwtSecret && adminJwtSecret && jwtSecret === adminJwtSecret) {
    errors.push('ADMIN_JWT_SECRET 不能与 JWT_SECRET 相同，请使用独立的 admin 密钥');
  }

  // AES_KEY 校验
  if (isProduction) {
    if (!aesKey) {
      errors.push('AES_KEY 未设置：生产环境必须配置 AES_KEY 环境变量');
    } else if (aesKey === DEV_AES_KEY) {
      errors.push('AES_KEY 不能使用开发专用密钥，请在 .env 中配置生产密钥');
    }
  }

  // HMAC_SECRET 校验
  if (isProduction) {
    if (!hmacSecret) {
      errors.push('HMAC_SECRET 未设置：生产环境必须配置 HMAC_SECRET 环境变量');
    } else if (hmacSecret === DEFAULT_HMAC_SECRET) {
      errors.push('HMAC_SECRET 不能使用默认值 shentong-ai-hmac-secret，请修改 .env 中的 HMAC_SECRET');
    }
  }

  if (errors.length > 0) {
    console.error('\n[启动校验失败] 密钥配置错误：');
    errors.forEach((e) => console.error('  - ' + e));
    console.error('\n请检查 .env 文件配置后重试。\n');
    process.exit(1);
  }
}
