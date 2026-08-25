'use strict';
/**
 * 存量库补跑缺失的 SQL 迁移（legacy DB 启动迁移会自动跳过这些文件）
 * 用法: cd /opt/shentong/backend && node scripts/apply-missing-migrations.js
 * 说明: 只执行指定文件；单个文件失败不影响其它文件。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
  const out = {};
  const p = path.join(process.cwd(), '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const DEFAULTS = [
  '017_create_oral_workshop_tables.sql',
  '018_create_membership_tables.sql',
  '020_add_oral_workshop_bilingual.sql',
  '022_create_oral_workshop_asset_tables.sql',
  '019_seed_oral_workshop_config.sql',
];

(async () => {
  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || env.DB_USERNAME || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_DATABASE || 'ai_agent',
    multipleStatements: true,
  });
  const names = process.argv[2] ? process.argv[2].split(',') : DEFAULTS;
  for (const name of names) {
    const f = path.join(process.cwd(), 'migrations', name);
    if (!fs.existsSync(f)) { console.log('SKIP (文件不存在):', name); continue; }
    const sql = fs.readFileSync(f, 'utf8');
    try {
      await conn.query(sql);
      console.log('OK  :', name);
    } catch (e) {
      console.log('FAIL:', name, '->', String(e.message).split('\n')[0]);
    }
  }
  await conn.end();
  console.log('DONE');
})();
