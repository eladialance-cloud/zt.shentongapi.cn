/**
 * 管理后台管理员密码重置脚本
 *
 * 场景：管理端密码被篡改 / 遗忘，需要找回或重置。
 * 原理：admin 登录校验的是 users 表的 bcrypt 密码哈希，
 *       直接写入一个已知密码的 bcrypt 哈希即可恢复登录。
 *
 * 用法（在 backend 目录下执行）：
 *   node scripts/reset-admin-password.js                      # 重置 admin / Admin@123456
 *   node scripts/reset-admin-password.js admin MyNew@Pass1    # 自定义用户名和密码
 *   node scripts/reset-admin-password.js --dry-run            # 只读检查，不修改数据库
 *
 * 数据库连接信息从 backend/.env 的 DB_* 配置读取。
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function loadEnv(file) {
  const env = {};
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const targetUsername = positional[0] || 'admin';
  const targetPassword = positional[1] || 'Admin@123456';

  const env = loadEnv(path.join(__dirname, '..', '.env'));
  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_DATABASE,
  });

  const [rows] = await conn.execute(
    'SELECT id, username, status, email, updated_at FROM users WHERE username = ?',
    [targetUsername],
  );

  if (!rows.length) {
    console.error(`未找到用户名 ${targetUsername}。`);
    console.error('若账号被删除，请先执行 backend/sql/admin-seed.sql 重建默认管理员。');
    process.exitCode = 1;
    await conn.end();
    return;
  }

  const user = rows[0];
  console.log(`目标账号: ${user.username} (id=${user.id}, status=${user.status})`);
  if (dryRun) {
    console.log('--dry-run 模式：仅检查，未修改任何数据。');
    await conn.end();
    return;
  }

  const hash = bcrypt.hashSync(targetPassword, 10);
  await conn.execute(
    'UPDATE users SET password = ?, must_change_password = 0, updated_at = NOW() WHERE username = ?',
    [hash, targetUsername],
  );

  console.log(`已重置 ${targetUsername} 的密码为: ${targetPassword}`);
  console.log('建议：立即登录管理后台修改密码，并检查 admin-audit 审计日志排查篡改来源。');
  await conn.end();
}

main().catch((err) => {
  console.error('重置失败:', err.message);
  process.exit(1);
});
