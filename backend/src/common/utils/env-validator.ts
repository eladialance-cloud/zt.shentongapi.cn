/**
 * 环境变量启动校验
 * 防止生产环境使用默认密钥
 */

const DEFAULT_JWT_SECRET = 'change-me-in-production-at-least-32-chars-please';
const DEFAULT_ADMIN_JWT_SECRET = 'change-me-admin-jwt-secret-32-chars';

export function validateJwtSecrets(): void {
  const jwtSecret = process.env.JWT_SECRET;
  const adminJwtSecret = process.env.ADMIN_JWT_SECRET;

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

  if (errors.length > 0) {
    console.error('\n[启动校验失败] JWT 密钥配置错误：');
    errors.forEach((e) => console.error('  - ' + e));
    console.error('\n请检查 .env 文件配置后重试。\n');
    process.exit(1);
  }
}
