/**
 * Hermes 工具卡（skill）脚本单元测试（node:test）
 * 运行: node --test tests/unit/hermes-skills.test.mjs
 *
 * 说明：本环境的进程隔离导致测试进程内 HTTP server 对 spawn 子进程不可达，
 *      因此 mock server 也以子进程方式启动（与真实部署形态一致）。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createCipheriv } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', '..', 'resources', 'hermes', 'skills', 'n8n-run-workflow', 'scripts', 'n8n-run-workflow.mjs');

const MOCK_SERVER_CODE = `
const http = require('node:http');
let webhookHits = 0;
const s = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/chat/accounting/tool')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 401, message: '未授权' }));
    return;
  }
  if (req.url && req.url.startsWith('/webhook/')) {
    webhookHits += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, executionId: 123, webhookHits }));
    return;
  }
  res.writeHead(404);
  res.end();
});
s.listen(0, '127.0.0.1', () => console.log('PORT=' + s.address().port));
`;

let serverChild = null;
let base = '';
let webhookHits = 0;
let tmp = '';

function waitForPortLine(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('mock server 启动超时')), timeoutMs);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/PORT=(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('mock server 退出 code=' + code));
    });
  });
}

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'st-hermes-skills-'));
  serverChild = spawn(process.execPath, ['-e', MOCK_SERVER_CODE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const port = await waitForPortLine(serverChild);
  base = 'http://127.0.0.1:' + port;
});

after(async () => {
  if (serverChild && serverChild.pid) {
    try { serverChild.kill(); } catch {}
  }
});

function runScript(env) {
  return execFileSync(
    process.execPath,
    [SCRIPT, '--workflow-id=1'],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 20000 },
  );
}

describe('hermes skills', () => {
  it('n8n-run-workflow 无记账单号时跳过记账直接执行', () => {
    const out = runScript({
      ST_ACCOUNTING_FILE: join(tmp, 'nonexistent-accounting.json'),
      ST_AUTH_FILE: join(tmp, 'nonexistent-auth.json'),
      ST_API_BASE: base,
      N8N_BASE_URL: base,
      N8N_API_KEY: '',
    });
    const parsed = JSON.parse(out.trim());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.webhookHits, 1);
  });

  it('记账失败（401 离线）时中止，不触发工作流', () => {
    const accFile = join(tmp, 'current-accounting.json');
    const authFile = join(tmp, 'auth.json');
    writeFileSync(accFile, JSON.stringify({ accountingId: 42 }), 'utf-8');
    writeFileSync(authFile, JSON.stringify({ token: 'st-token' }), 'utf-8');
    assert.throws(
      () =>
        runScript({
          ST_ACCOUNTING_FILE: accFile,
          ST_AUTH_FILE: authFile,
          ST_API_BASE: base,
          N8N_BASE_URL: base,
          N8N_API_KEY: '',
        }),
      /未登录或离线/,
    );
    // 第二次运行 webhookHits 仍为 1（未触发工作流）
    const out = runScript({
      ST_ACCOUNTING_FILE: join(tmp, 'nonexistent-accounting.json'),
      ST_AUTH_FILE: join(tmp, 'nonexistent-auth.json'),
      ST_API_BASE: base,
      N8N_BASE_URL: base,
      N8N_API_KEY: '',
    });
    assert.equal(JSON.parse(out.trim()).webhookHits, 2);
  });
});

// 端到端：auth.json 密文化后，工具卡脚本仍能取到 token（安全审计 S-05 回归护栏）
// 独立实现加密侧（node:crypto），验证 auth-file.mjs 文档声明的格式契约可从外部重放。
describe('hermes skills × 加密 auth.json（S-05）', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64');

  function sealForTest(plain) {
    const iv = Buffer.alloc(12, 3);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'base64'), iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
  }

  it('密文 auth.json + ST_AUTH_KEY：脚本能解出 token 并走到云端记账（401 中止）', () => {
    const accFile = join(tmp, 'current-accounting-enc.json');
    const authFile = join(tmp, 'auth-enc.json');
    writeFileSync(accFile, JSON.stringify({ accountingId: 77 }), 'utf-8');
    writeFileSync(
      authFile,
      JSON.stringify({ v: 1, enc: true, data: sealForTest(JSON.stringify({ token: 'st-token' })) }),
      'utf-8',
    );
    assert.throws(
      () =>
        runScript({
          ST_ACCOUNTING_FILE: accFile,
          ST_AUTH_FILE: authFile,
          ST_AUTH_KEY: KEY,
          ST_API_BASE: base,
          N8N_BASE_URL: base,
          N8N_API_KEY: '',
        }),
      /未登录或离线/,
    );
  });

  it('密文 auth.json 但缺 ST_AUTH_KEY：不猜、不回退，按未登录处理（仍能跑通工作流）', () => {
    const authFile = join(tmp, 'auth-enc-nokey.json');
    writeFileSync(
      authFile,
      JSON.stringify({ v: 1, enc: true, data: sealForTest(JSON.stringify({ token: 'st-token' })) }),
      'utf-8',
    );
    const out = runScript({
      ST_ACCOUNTING_FILE: join(tmp, 'nonexistent-accounting.json'),
      ST_AUTH_FILE: authFile,
      ST_API_BASE: base,
      N8N_BASE_URL: base,
      N8N_API_KEY: '',
    });
    assert.equal(JSON.parse(out.trim()).ok, true);
  });
});
