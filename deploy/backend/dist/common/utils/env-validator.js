"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJwtSecrets = validateJwtSecrets;
const DEFAULT_JWT_SECRET = 'change-me-in-production-at-least-32-chars-please';
const DEFAULT_ADMIN_JWT_SECRET = 'change-me-admin-jwt-secret-32-chars';
const DEFAULT_AES_KEY = 'shentong-ai-default-aes-key-32bytes!!';
const DEFAULT_HMAC_SECRET = 'shentong-ai-hmac-secret';
function validateJwtSecrets() {
    const jwtSecret = process.env.JWT_SECRET;
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET;
    const aesKey = process.env.AES_KEY;
    const hmacSecret = process.env.HMAC_SECRET;
    const errors = [];
    if (!jwtSecret) {
        errors.push('JWT_SECRET 未设置，请在 .env 中配置');
    }
    else if (jwtSecret === DEFAULT_JWT_SECRET) {
        errors.push('JWT_SECRET 不能使用默认占位值，请修改 .env 中的 JWT_SECRET');
    }
    else if (jwtSecret.length < 32) {
        errors.push(`JWT_SECRET 长度必须 ≥32 字符（当前 ${jwtSecret.length} 字符）`);
    }
    if (!adminJwtSecret) {
        errors.push('ADMIN_JWT_SECRET 未设置，请在 .env 中配置');
    }
    else if (adminJwtSecret === DEFAULT_ADMIN_JWT_SECRET) {
        errors.push('ADMIN_JWT_SECRET 不能使用默认占位值，请修改 .env 中的 ADMIN_JWT_SECRET');
    }
    else if (adminJwtSecret.length < 32) {
        errors.push(`ADMIN_JWT_SECRET 长度必须 ≥32 字符（当前 ${adminJwtSecret.length} 字符）`);
    }
    if (jwtSecret && adminJwtSecret && jwtSecret === adminJwtSecret) {
        errors.push('ADMIN_JWT_SECRET 不能与 JWT_SECRET 相同，请使用独立的 admin 密钥');
    }
    if (!aesKey) {
        errors.push('AES_KEY 未设置，请在 .env 中配置');
    }
    else if (aesKey === DEFAULT_AES_KEY) {
        errors.push('AES_KEY 不能使用默认占位值，请修改 .env 中的 AES_KEY');
    }
    else if (aesKey.length < 16) {
        errors.push('AES_KEY 长度需至少 16 字符');
    }
    if (!hmacSecret) {
        errors.push('HMAC_SECRET 未设置，请在 .env 中配置');
    }
    else if (hmacSecret === DEFAULT_HMAC_SECRET) {
        errors.push('HMAC_SECRET 不能使用默认占位值，请修改 .env 中的 HMAC_SECRET');
    }
    else if (hmacSecret.length < 16) {
        errors.push('HMAC_SECRET 长度需至少 16 字符');
    }
    if (errors.length > 0) {
        console.error('\n[启动校验失败] JWT 密钥配置错误：');
        errors.forEach((e) => console.error('  - ' + e));
        console.error('\n请检查 .env 文件配置后重试。\n');
        process.exit(1);
    }
}
//# sourceMappingURL=env-validator.js.map