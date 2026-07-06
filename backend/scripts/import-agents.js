/**
 * Agent 批量导入脚本
 * 从 agency-agents-zh 仓库批量导入 Agent 到数据库
 * 
 * 用法：在服务器项目根目录执行
 *   node scripts/import-agents.js
 * 
 * 或在容器内执行：
 *   docker exec -it shentong-backend node scripts/import-agents.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// ============ 配置 ============
const REPO_URL = 'https://github.com/jnMetaCode/agency-agents-zh.git';
const REPO_DIR = '/tmp/agency-agents-zh';
const DEFAULT_MODEL_ID = 'gpt-4o-mini';

// 分类映射
const CATEGORY_MAP = {
  'engineering': 'programming',
  'testing': 'programming',
  'security': 'programming',
  'marketing': 'copywriting',
  'sales': 'copywriting',
  'paid-media': 'copywriting',
  'finance': 'data_analysis',
  'supply-chain': 'data_analysis',
  'strategy': 'data_analysis',
  'design': 'office',
  'product': 'office',
  'project-management': 'office',
  'hr': 'office',
  'academic': 'other',
  'gis': 'other',
  'game-development': 'other',
  'specialized': 'other',
  'support': 'other',
  'spatial-computing': 'other',
  'integrations': 'other',
  'legal': 'other',
};

// 数据库配置（从环境变量读取）
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || process.env.MYSQL_USER || 'shentong',
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'ai_agent',
  charset: 'utf8mb4',
};

// ============ 工具函数 ============

/** 解析 Markdown frontmatter */
function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { meta: {}, body: content };
  }

  const fmText = fmMatch[1];
  const body = fmMatch[2];
  const meta = {};

  // 简单 YAML 解析
  for (const line of fmText.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      // 去除引号
      if ((val.startsWith('"') && val.endsWith('"')) || 
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[m[1]] = val;
    }
  }

  return { meta, body };
}

/** 从文件名提取 slug */
function slugFromFilename(filename) {
  return filename
    .replace(/\.md$/, '')
    .replace(/^[a-z]+-/, '')
    .replace(/-/g, '_');
}

/** 从目录名映射到数据库 category */
function mapCategory(dirName) {
  return CATEGORY_MAP[dirName] || 'other';
}

// ============ 主逻辑 ============

async function main() {
  console.log('🚀 Agent 批量导入脚本启动');

  // 1. 检查/Clone 仓库
  if (!fs.existsSync(REPO_DIR)) {
    console.log(`📥 克隆仓库: ${REPO_URL}`);
    const { execSync } = require('child_process');
    execSync(`git clone --depth 1 ${REPO_URL} ${REPO_DIR}`, { stdio: 'inherit' });
  } else {
    console.log(`✅ 仓库已存在: ${REPO_DIR}`);
    const { execSync } = require('child_process');
    try {
      execSync(`cd ${REPO_DIR} && git pull --ff-only`, { stdio: 'inherit' });
    } catch (e) {
      console.log('⚠️ git pull 失败，使用现有版本');
    }
  }

  // 2. 连接数据库
  console.log('🔌 连接数据库:', DB_CONFIG.host, DB_CONFIG.database);
  const conn = await mysql.createConnection(DB_CONFIG);

  // 3. 查找 admin 用户作为 creator
  const [adminRows] = await conn.execute(
    "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
  );
  const adminId = adminRows.length > 0 ? adminRows[0].id : 1;
  console.log(`👤 使用 admin 用户 ID: ${adminId}`);

  // 4. 遍历所有 .md 文件
  const dirs = fs.readdirSync(REPO_DIR).filter(d => {
    const stat = fs.statSync(path.join(REPO_DIR, d));
    return stat.isDirectory() && !d.startsWith('.') && d !== 'scripts' && d !== 'examples' && d !== 'assets';
  });

  let totalImported = 0;
  let totalSkipped = 0;
  const batchValues = [];

  for (const dir of dirs) {
    const dirPath = path.join(REPO_DIR, dir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    console.log(`\n📂 ${dir}/ (${files.length} 个文件)`);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(content);

      const name = meta.name || file.replace(/\.md$/, '').replace(/-/g, ' ');
      const description = meta.description || '';
      const systemPrompt = body.trim();
      const category = mapCategory(dir);
      const sourceFilePath = `${dir}/${file}`;

      // 检查是否已导入（通过 source_file_path 去重）
      const [existing] = await conn.execute(
        'SELECT id FROM agents WHERE source_file_path = ? LIMIT 1',
        [sourceFilePath]
      );

      if (existing.length > 0) {
        totalSkipped++;
        continue;
      }

      batchValues.push([
        name,
        description || null,
        systemPrompt,
        DEFAULT_MODEL_ID,
        0,                    // price_per_call
        adminId,              // creator_id
        'official',           // creator_type
        'published',          // status（直接上架）
        category,             // category
        'imported',           // source_type
        'agency-agents-zh',   // source_name
        REPO_URL,             // source_repo_url
        sourceFilePath,       // source_file_path
        dir,                  // source_category
        '1.0',                // source_version
        'openclaw',           // runtime_type
        true,                 // is_official
        true,                 // official_visible
        'pending',            // sync_status
        adminId,              // user_id
      ]);

      totalImported++;
    }
  }

  // 5. 批量插入
  if (batchValues.length === 0) {
    console.log('\n⚠️ 没有新 Agent 需要导入（全部已存在）');
  } else {
    console.log(`\n💾 批量插入 ${batchValues.length} 个 Agent...`);

    const sql = `
      INSERT INTO agents (
        name, description, system_prompt, model_id, price_per_call,
        creator_id, creator_type, status, category,
        source_type, source_name, source_repo_url, source_file_path,
        source_category, source_version, runtime_type,
        is_official, official_visible, sync_status, user_id,
        created_at, updated_at
      ) VALUES ?
    `;

    const now = new Date();
    const valuesWithDates = batchValues.map(v => [...v, now, now]);

    // 分批插入（每批 50 条）
    const BATCH_SIZE = 50;
    for (let i = 0; i < valuesWithDates.length; i += BATCH_SIZE) {
      const batch = valuesWithDates.slice(i, i + BATCH_SIZE);
      await conn.query(sql, [batch]);
      console.log(`  ✅ 已插入 ${Math.min(i + BATCH_SIZE, valuesWithDates.length)}/${valuesWithDates.length}`);
    }

    console.log(`\n🎉 导入完成！新导入: ${totalImported}，跳过(已存在): ${totalSkipped}`);
  }

  // 6. 统计
  const [countRows] = await conn.execute(
    "SELECT category, COUNT(*) as cnt FROM agents WHERE source_type = 'imported' GROUP BY category"
  );
  console.log('\n📊 导入统计:');
  for (const row of countRows) {
    console.log(`  ${row.category}: ${row.cnt} 个`);
  }

  const [totalRows] = await conn.execute(
    "SELECT COUNT(*) as total FROM agents WHERE source_type = 'imported'"
  );
  console.log(`  总计: ${totalRows[0].total} 个导入 Agent`);

  await conn.end();
  console.log('\n✅ 脚本执行完毕');
}

main().catch(err => {
  console.error('❌ 导入失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
