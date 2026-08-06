// 本地 MCP Gateway SSE 桥（由 service-manager 以 ELECTRON_RUN_AS_NODE 方式启动）
//
// 背景：OpenClaw 2026.7.1 的 MCP 服务为 stdio 模式（openclaw mcp serve），
// 并不提供 HTTP/SSE 端点；旧的 mcp-gateway 包假设存在远程 SSE 后端，导致
// MCP Gateway 一直报 “无法连接 SSE 后端”。本桥把 OpenClaw 的 stdio MCP 服务
// 暴露为本地 SSE 端点（默认 127.0.0.1:3100），协议遵循 MCP SSE transport：
//   - GET  /sse              -> SSE 流（event: endpoint / message）
//   - POST /message?sessionId=xxx -> JSON-RPC 转发给 OpenClaw stdio
//   - GET  /health           -> 健康检查
//
// 只依赖 Node 内置模块，可直接用任意 node 运行。
'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');

function parseArgs(argv) {
  const opts = {
    port: 3100,
    gatewayWsUrl: 'ws://127.0.0.1:8080',
    openclawDir: '',
    openclawHome: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') opts.port = parseInt(argv[++i], 10) || 3100;
    else if (a === '--gateway-ws') opts.gatewayWsUrl = argv[++i] || opts.gatewayWsUrl;
    else if (a === '--openclaw-dir') opts.openclawDir = argv[++i] || '';
    else if (a === '--openclaw-home') opts.openclawHome = argv[++i] || '';
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const log = (...args) => console.error('[mcp-gateway]', ...args);

// ---- 1) 校验 OpenClaw 运行时 ----
const nodeExe = path.join(opts.openclawDir, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const openclawMjs = path.join(opts.openclawDir, 'node_modules', 'openclaw', 'openclaw.mjs');
const missing = [];
if (!opts.openclawDir || !fs.existsSync(opts.openclawDir)) missing.push('openclaw 运行时目录: ' + opts.openclawDir);
if (!fs.existsSync(nodeExe)) missing.push('openclaw node: ' + nodeExe);
if (!fs.existsSync(openclawMjs)) missing.push('openclaw 入口: ' + openclawMjs);
if (missing.length) {
  log('OpenClaw 运行时缺失：', missing.join('；'));
  console.error('MCP Gateway 启动失败：OpenClaw 运行时未安装，请先下载/修复 OpenClaw');
  process.exit(1);
}

// ---- 2) SSE 客户端表（sessionId -> http.ServerResponse） ----
const clients = new Map();
let child = null;
let readyPrinted = false;

function printReady() {
  if (readyPrinted) return;
  readyPrinted = true;
  // service-manager 通过 stdout/stderr 的就绪标记识别 MCP Gateway 已就绪
  console.log('MCP Gateway is running');
  console.log('SSE backend connected');
  log('SSE 服务已就绪，后端 OpenClaw mcp serve 已连接');
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch (e) {
    res.writeHead(400); res.end(); return;
  }
  const p = url.pathname;

  // GET /sse 或 /api/mcp/sse：SSE 长连接
  if (req.method === 'GET' && (p === '/sse' || p === '/api/mcp/sse')) {
    const sessionId = crypto.randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.write('event: endpoint\ndata: /message?sessionId=' + sessionId + '\n\n');
    clients.set(sessionId, res);
    const drop = () => clients.delete(sessionId);
    req.on('close', drop);
    res.on('close', drop);
    res.on('error', drop);
    return;
  }

  // POST /message：转发 JSON-RPC 给 OpenClaw stdio
  if (req.method === 'POST' && (p === '/message' || p === '/api/mcp/message')) {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId || !clients.has(sessionId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown session' }));
      return;
    }
    let body = '';
    let aborted = false;
    req.on('data', (d) => {
      body += d.toString('utf8');
      if (body.length > 8 * 1024 * 1024) {
        aborted = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        if (child && child.stdin && child.stdin.writable) {
          child.stdin.write(body + (body.endsWith('\n') ? '' : '\n'));
        }
        res.writeHead(202, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      }
    });
    return;
  }

  // GET /health
  if (req.method === 'GET' && (p === '/health' || p === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, service: 'mcp-gateway' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.on('clientError', (err, socket) => {
  try { socket.destroy(); } catch (e) { /* ignore */ }
});

// ---- 3) 转发 OpenClaw stdout（MCP JSON-RPC）到所有 SSE 客户端 ----
let outBuf = '';
function broadcast(line) {
  const text = line.trim();
  if (!text) return;
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* not json */ }
  if (!parsed) {
    log('忽略 OpenClaw 非 JSON 输出：', text.slice(0, 200));
    return;
  }
  for (const res of clients.values()) {
    try { res.write('event: message\ndata: ' + text + '\n\n'); } catch (e) { /* ignore */ }
  }
}

// ---- 4) 启动 OpenClaw stdio MCP 服务 ----
const childEnv = Object.assign({}, process.env, { OPENCLAW_HOME: opts.openclawHome || process.env.OPENCLAW_HOME || '' });
try { fs.mkdirSync(opts.openclawHome, { recursive: true }); } catch (e) { /* ignore */ }

child = spawn(nodeExe, [openclawMjs, 'mcp', 'serve', '--url', opts.gatewayWsUrl], {
  env: childEnv,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', (d) => {
  outBuf += d.toString('utf8');
  let idx;
  while ((idx = outBuf.indexOf('\n')) >= 0) {
    const line = outBuf.slice(0, idx);
    outBuf = outBuf.slice(idx + 1);
    broadcast(line);
  }
});
child.stderr.on('data', (d) => {
  const t = d.toString('utf8');
  if (t.trim()) {
    log(t.trim());
    // 转发给父进程 stderr，让 service-manager 捕获真实错误详情
    process.stderr.write(d);
  }
});

let settled = false;
function shutdown(code) {
  if (settled) return;
  settled = true;
  try { server.close(); } catch (e) { /* ignore */ }
  try { if (child) child.kill(); } catch (e) { /* ignore */ }
  process.exit(code);
}

// 后端已连接判定：子进程存活超过 3 秒且未退出，视为已连上 OpenClaw Gateway
setTimeout(() => {
  if (!settled && child && child.exitCode === null) {
    printReady();
  }
}, 3000);

child.on('error', (err) => {
  log('OpenClaw 子进程启动失败：', err && err.message);
  process.stderr.write('MCP Gateway 启动失败：无法启动 OpenClaw mcp serve（' + (err && err.message) + '）\n');
  shutdown(1);
});
child.on('exit', (code, signal) => {
  log('OpenClaw mcp serve 退出 code=' + code + ' signal=' + signal);
  shutdown(code || 1);
});

server.listen(opts.port, '127.0.0.1', () => {
  log('MCP Gateway SSE 服务已监听 http://127.0.0.1:' + opts.port);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // 端口已被占用（例如已有网关在跑）：视为已就绪，交给 service-manager 探测端口
    log('端口 ' + opts.port + ' 已被占用，按就绪处理');
    printReady();
    return;
  }
  log('HTTP 服务启动失败：', err && err.message);
  process.stderr.write('MCP Gateway 启动失败：' + (err && err.message) + '\n');
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
