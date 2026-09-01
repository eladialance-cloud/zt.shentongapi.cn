#!/usr/bin/env node
/**
 * seed-skill-catalog.js - 技能目录清单入库「技能源」(eco_skill_sources)
 *
 * 输入：已解压的 awesome-openclaw-skills 目录（含 categories/*.md）
 * 用法：node scripts/seed-skill-catalog.js <extracted-dir>
 * 幂等：source_url 唯一冲突时更新名称/描述/分类（不重复插入）
 * 不依赖 GitHub API，规避服务器到 GitHub 的网络抖动
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const CATEGORY_MAP = {
  'ai-and-llms': 'AI与LLM',
  'apple-apps-and-services': '苹果应用与服务',
  'browser-and-automation': '浏览器与自动化',
  'calendar-and-scheduling': '日历与日程',
  'clawdbot-tools': 'Clawdbot工具',
  'cli-utilities': '命令行工具',
  'coding-agents-and-ides': '编程智能体与IDE',
  'communication': '通讯沟通',
  'data-and-analytics': '数据与分析',
  'devops-and-cloud': '运维与云服务',
  'gaming': '游戏',
  'git-and-github': 'Git与GitHub',
  'health-and-fitness': '健康与健身',
  'image-and-video-generation': '图像与视频生成',
  'ios-and-macos-development': 'iOS与macOS开发',
  'marketing-and-sales': '营销与销售',
  'media-and-streaming': '媒体与流媒体',
  'moltbook': 'Moltbook',
  'notes-and-pkm': '笔记与知识管理',
  'pdf-and-documents': 'PDF与文档',
  'personal-development': '个人成长',
  'productivity-and-tasks': '效率与任务',
  'search-and-research': '搜索与研究',
  'security-and-passwords': '安全与密码',
  'self-hosted-and-automation': '自托管与自动化',
  'shopping-and-e-commerce': '购物与电商',
  'smart-home-and-iot': '智能家居与物联网',
  'speech-and-transcription': '语音与转写',
  'transportation': '出行交通',
  'web-and-frontend-development': 'Web与前端开发',
};

function resolveCategory(cat) {
  if (!cat) return '其他';
  const v = CATEGORY_MAP[String(cat).toLowerCase()];
  return v || cat;
}

/** 解析链接 → GitHub 候选仓库列表（与后端 skill-catalog-parser 保持一致） */
function resolveRepoCandidates(url) {
  const u = (url || '').trim();
  let m = u.match(/^https?:\/\/clawhub\.ai\/([^/]+)\/([^/]+)\/?$/);
  if (m) return [{ owner: m[1], repo: m[2] }];
  m = u.match(/^https?:\/\/clawskills\.sh\/skills\/([^/]+)\/?$/);
  if (m) {
    const slug = m[1];
    const parts = slug.split('-').filter(Boolean);
    if (parts.length < 2) return [];
    const out = [];
    out.push({ owner: parts[0], repo: parts.slice(1).join('-') });
    if (parts.length >= 3) out.push({ owner: parts.slice(0, 2).join('-'), repo: parts.slice(2).join('-') });
    const seen = new Set();
    return out.filter(c => { const k = c.owner + '/' + c.repo; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (m) return [{ owner: m[1], repo: m[2].replace(/\.git$/, '') }];
  return [];
}

function loadEnv(file) {
  const env = {};
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

async function main() {
  const root = process.argv[2];
  if (!root) { console.error('用法: node seed-skill-catalog.js <awesome-openclaw-skills 解压目录>'); process.exit(1); }
  const catsDir = path.join(root, 'categories');
  if (!fs.existsSync(catsDir)) { console.error('未找到 categories 目录: ' + catsDir); process.exit(1); }

  const entries = [];
  const catFiles = fs.readdirSync(catsDir).filter(n => n.toLowerCase().endsWith('.md')).sort();
  for (const cf of catFiles) {
    const category = cf.toLowerCase().replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(catsDir, cf), 'utf8');
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*-\s*(.+)$/);
      if (!m) continue;
      const candidates = resolveRepoCandidates(m[2]);
      if (!candidates.length) continue;
      entries.push({
        name: (m[1].trim() || (candidates[0] && candidates[0].repo) || 'skill').slice(0, 64),
        description: (m[3].trim() || '').slice(0, 500),
        category: resolveCategory(category),
        sourceUrl: m[2].slice(0, 512),
        repoUrl: candidates.length ? 'https://github.com/' + candidates[0].owner + '/' + candidates[0].repo : m[2].slice(0, 512),
        candidates,
      });
    }
  }
  console.log('解析到技能条目: ' + entries.length);

  let env = {};
  const envCandidates = [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '.env')];
  const envFile = envCandidates.find((f) => fs.existsSync(f));
  if (envFile) env = loadEnv(envFile);
  else console.warn('[WARN] 未找到 .env，使用默认连接参数');
  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_DATABASE,
    charset: 'utf8mb4',
  });

  const sql = `INSERT INTO eco_skill_sources
    (source_url, source_type, skill_name, skill_desc, skill_type, category, status, analyze_result, created_at, updated_at)
    VALUES (?, 'github', ?, ?, 'skill', ?, 'analyzed', ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      skill_name = VALUES(skill_name),
      skill_desc = VALUES(skill_desc),
      category = VALUES(category),
      status = 'analyzed',
      analyze_result = VALUES(analyze_result),
      updated_at = NOW()`;

  let inserted = 0, updated = 0, failed = 0;
  const BATCH = 200;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    for (const e of batch) {
      try {
        const [res] = await conn.execute(sql, [
          e.sourceUrl,
          e.name,
          e.description,
          e.category,
          JSON.stringify({ repoCandidates: e.candidates, repoUrl: e.repoUrl, sourceUrl: e.sourceUrl, category: e.category }),
        ]);
        if (res.affectedRows === 1) inserted++;
        else updated++;
      } catch (err) {
        failed++;
        if (failed <= 5) console.error('插入失败: ' + e.sourceUrl + ' -> ' + (err && err.message));
      }
    }
    console.log('进度: ' + Math.min(i + BATCH, entries.length) + '/' + entries.length);
  }
  await conn.end();
  console.log('完成: 新增=' + inserted + ' 更新=' + updated + ' 失败=' + failed);
}

main().catch((e) => {
  console.error('SEED ERROR:', e && (e.stack || e.message || e));
  process.exit(1);
});
