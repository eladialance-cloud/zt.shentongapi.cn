/**
 * 环境变量启动校验
 * 防止生产环境使用默认密钥
 */

const DEFAULT_JWT_SECRET = 'change-me-in-production-at-least-32-chars-please';
const DEFAULT_ADMIN_JWT_SECRET = 'change-me-admin-jwt-secret-32-chars';
const MIN_SECRET_LENGTH = 32;
/** 已在外网/服务器配置中泄漏过的弱密钥（P0-5 凭据轮换后禁止复用） */
const LEAKED_JWT_SECRETS = [
  'shentong_ai_secret_key_2026_abc123',
  'shentong_ai_admin_secret_2026_xyz789',
];

/** 弱密钥判定：过短 / 已泄漏值 / 常见弱模式 */
function isWeakSecret(value: string): boolean {
  const v = value.toLowerCase();
  if (v.length < MIN_SECRET_LENGTH) return true;
  if (LEAKED_JWT_SECRETS.includes(v)) return true;
  if (
    v.includes('abc123') ||
    v.includes('xyz789') ||
    v.includes('changeme') ||
    v.includes('change-me') ||
    v.includes('secret_key') ||
    v.includes('123456')
  ) {
    return true;
  }
  return false;
}
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
  } else if (jwtSecret === DEFAULT_JWT_SECRET || isWeakSecret(jwtSecret)) {
    errors.push('JWT_SECRET 过短或为弱密钥（已泄漏/常见模式），请生成 32+ 字符随机密钥写入 .env');
  }

  if (!adminJwtSecret) {
    errors.push('ADMIN_JWT_SECRET 未设置，请在 .env 中配置');
  } else if (adminJwtSecret === DEFAULT_ADMIN_JWT_SECRET || isWeakSecret(adminJwtSecret)) {
    errors.push('ADMIN_JWT_SECRET 过短或为弱密钥（已泄漏/常见模式），请生成 32+ 字符随机密钥写入 .env');
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
    } else if (aesKey.length < MIN_SECRET_LENGTH) {
      errors.push('AES_KEY 长度不足 32 字符，请生成更强的随机密钥');
    }
  }

  // HMAC_SECRET 校验
  if (isProduction) {
    if (!hmacSecret) {
      errors.push('HMAC_SECRET 未设置：生产环境必须配置 HMAC_SECRET 环境变量');
    } else if (hmacSecret === DEFAULT_HMAC_SECRET) {
      errors.push('HMAC_SECRET 不能使用默认值 shentong-ai-hmac-secret，请修改 .env 中的 HMAC_SECRET');
    } else if (hmacSecret.length < MIN_SECRET_LENGTH) {
      errors.push('HMAC_SECRET 长度不足 32 字符，请生成更强的随机密钥');
    }
  }

  if (errors.length > 0) {
    console.error('\n[启动校验失败] 密钥配置错误：');
    errors.forEach((e) => console.error('  - ' + e));
    console.error('\n请检查 .env 文件配置后重试。\n');
    process.exit(1);
  }
}
