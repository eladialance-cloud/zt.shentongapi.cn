#!/usr/bin/env node
/**
 * translate-skill-names.js - 技能源(skill_sources)名称批量翻译成简体中文
 * 用法: node scripts/translate-skill-names.js [--batch 40]
 * 模型/中转: 默认复用「默认激活 chat 模型 + 带 api_key 的 active 中转」，也可环境变量覆盖:
 *   SKILL_TRANSLATE_BASE_URL / SKILL_TRANSLATE_API_KEY / SKILL_TRANSLATE_MODEL
 * 幂等: 已含中文的名称自动跳过; 原文备份到 analyze_result.enName
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const mysql = require('mysql2/promise');

const CJK_RE = /[\u4e00-\u9fff]/;
// markdown 代码块围栏（反引号 x3），避免在模板字符串中直接写字面反引号
const FENCE_RE = new RegExp('^' + '\\x60\\x60\\x60(?:json)?\\s*', 'i');
const FENCE_END_RE = new RegExp('\\s*\\x60\\x60\\x60\\s*$');

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

function findEnvFile() {
  const candidates = [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '.env')];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

/** AES-256-GCM 解密（与后端 EncryptionService 保持一致） */
function decryptAes(cipherText, aesKey) {
  const parts = String(cipherText).split(':');
  if (parts.length !== 3) throw new Error('无效的密文格式');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** 基于内置 http/https 的 POST JSON（兼容无全局 fetch 的 Node 版本） */
function postJson(url, headers, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(bodyObj);
    const req = lib.request(
      u,
      {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers, { 'Content-Length': Buffer.byteLength(body) }),
        timeout: timeoutMs || 60000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(text)); }
            catch (e) { reject(new Error('响应非JSON: ' + text.slice(0, 200))); }
          } else {
            reject(new Error('HTTP ' + res.statusCode + ': ' + text.slice(0, 200)));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', (e) => reject(e));
    req.end(body);
  });
}

/** 从模型响应中稳健提取 JSON 对象文本 */
function extractJson(text) {
  let t = String(text || '').trim();
  t = t.replace(FENCE_RE, '').replace(FENCE_END_RE, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  let cand = t.slice(first, last + 1);
  try { return JSON.parse(cand); } catch (e) { /* 继续尝试修复 */ }
  cand = cand.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]/g, ' ');
  try { return JSON.parse(cand); } catch (e) { return null; }
}

/** 翻译一批名称 → { id: '中文名' } */
async function translateBatch(url, apiKey, model, batch) {
  const items = batch.map((r) => ({ id: r.id, name: r.skill_name }));
  const prompt = [
    '你是技能名称翻译助手。把以下技能名称翻译成简体中文。',
    '要求：1) 保留品牌名、专有名词、技术缩写不翻译（如 GitHub、n8n、MCP、Claude、OpenAI、Chrome、iOS）；',
    '2) 通用词意译（如 Skills→技能、Workflow→工作流、Assistant→助手、Manager→管理器、Helper→助手）；',
    '3) 名称自然通顺，每个不超过 30 个汉字。',
    '输入是 JSON 数组：' + JSON.stringify(items),
    '只输出一个 JSON 对象，键为输入的 id，值为中文名，例如：{"12":"网页抓取助手"}。不要输出任何其他文字。',
  ].join('\n');
  const resp = await postJson(
    url,
    { Authorization: 'Bearer ' + apiKey },
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0,
      response_format: { type: 'json_object' },
    },
    60000,
  );
  const raw = resp && resp.choices && resp.choices[0] && resp.choices[0].message ? resp.choices[0].message.content : '';
  let text = '';
  if (Array.isArray(raw)) {
    text = raw.map((p) => (p && (p.text || p.content)) || '').join('');
  } else {
    text = String(raw || '');
  }
  if (!text.trim()) throw new Error('空响应');
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('未解析到JSON: ' + text.slice(0, 200));
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const batchSizeArg = args.find((a) => a.startsWith('--batch='));
  const batchSize = batchSizeArg ? (Number(batchSizeArg.split('=')[1]) || 40) : 40;

  const envFile = findEnvFile();
  const env = envFile ? loadEnv(envFile) : {};
  const aesKey = crypto.createHash('sha256').update(env.AES_KEY || 'dev-only-aes-key-not-for-production-32b').digest();

  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_DATABASE,
    charset: 'utf8mb4',
  });

  // 1) 解析中转与模型：环境变量优先，其次 DB「带 api_key 的 active 中转」+ 默认 chat 模型
  let baseUrl = env.SKILL_TRANSLATE_BASE_URL;
  let apiKey = env.SKILL_TRANSLATE_API_KEY;
  let model = env.SKILL_TRANSLATE_MODEL;
  if (!baseUrl || !model) {
    const [providers] = await conn.execute(
      "SELECT base_url, api_key FROM model_providers WHERE status='active' AND api_key IS NOT NULL AND TRIM(api_key) != '' ORDER BY (is_global=1) DESC, id ASC LIMIT 1",
    );
    const [models] = await conn.execute(
      "SELECT upstream_model_id, model_id FROM models WHERE is_active=1 AND model_type='chat' ORDER BY id ASC LIMIT 1",
    );
    if (!baseUrl) {
      if (!providers.length || !providers[0].base_url) throw new Error('未找到可用中转(model_providers)，请设置 SKILL_TRANSLATE_BASE_URL');
      baseUrl = String(providers[0].base_url).replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    }
    if (!apiKey) {
      if (!providers.length || !providers[0].api_key) throw new Error('中转无 api_key，请设置 SKILL_TRANSLATE_API_KEY');
      apiKey = decryptAes(providers[0].api_key, aesKey);
    }
    if (!model) {
      if (!models.length) throw new Error('未找到默认 chat 模型，请设置 SKILL_TRANSLATE_MODEL');
      model = models[0].upstream_model_id || models[0].model_id;
    }
  }
  const url = baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  console.log('中转: ' + url);
  console.log('模型: ' + model);
  console.log('批次: ' + batchSize);

  // 2) 取待翻译条目（跳过已含中文的，支持断点续跑）
  const [rows] = await conn.execute(
    "SELECT id, skill_name, analyze_result FROM skill_sources WHERE status='analyzed' ORDER BY id",
  );
  const todo = rows.filter((r) => !CJK_RE.test(String(r.skill_name || '')));
  console.log('待翻译: ' + todo.length + '/' + rows.length);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    let result = null;
    for (let attempt = 1; attempt <= 3 && !result; attempt++) {
      try {
        result = await translateBatch(url, apiKey, model, batch);
      } catch (e) {
        if (attempt === 3) {
          console.error('批次失败 id=' + batch[0].id + '..' + batch[batch.length - 1].id + ': ' + e.message);
          fail += batch.length;
        } else {
          console.warn('批次重试 ' + attempt + ' id=' + batch[0].id + ': ' + e.message);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }
    if (result) {
      for (const row of batch) {
        const zh = result[String(row.id)];
        if (zh && typeof zh === 'string' && zh.trim()) {
          let ar = row.analyze_result;
          try { ar = typeof ar === 'string' ? JSON.parse(ar) : (ar || {}); } catch { ar = {}; }
          const newAr = Object.assign({}, ar || {}, { enName: row.skill_name });
          await conn.execute(
            'UPDATE skill_sources SET skill_name=?, analyze_result=? WHERE id=?',
            [zh.trim().slice(0, 64), JSON.stringify(newAr), row.id],
          );
          ok++;
        } else {
          fail++;
        }
      }
    }
    if ((i + batchSize) % (batchSize * 5) === 0 || i + batchSize >= todo.length) {
      console.log('进度: ' + Math.min(i + batchSize, todo.length) + '/' + todo.length + ' 已翻译=' + ok + ' 失败=' + fail);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await conn.end();
  console.log('完成: 翻译=' + ok + ' 未翻译=' + fail);
  if (fail > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error('TRANSLATE ERROR:', e && (e.stack || e.message || e));
  process.exit(1);
});
