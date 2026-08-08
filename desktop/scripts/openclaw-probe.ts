/**
 * OpenClaw L0 探针（Task 1 实施计划）
 *
 * 运行: cd D:\二次开发\desktop && npx tsx scripts/openclaw-probe.ts
 * 作用: 实测本地 OpenClaw/Hermes/N8N/MCP 真实接口，输出 JSON 结论
 * 用途: 决定 Chat 页接入 OpenClaw 的方式（WebChat WS / admin RPC / 其他）
 *
 * 说明: 请在 OpenClaw 正在运行的电脑上执行；各服务未启动时输出 error 属正常，
 *       关键看"服务是否活着"和"接口是否存在"。
 */
// @ts-ignore - ws 无类型声明（探针脚本，仅本机运行）
import { WebSocket } from 'ws';

const OPENCLAW_BASE = process.env.OPENCLAW_BASE ?? 'http://127.0.0.1:8080';
const HERMES_BASE = 'http://127.0.0.1:8642';
const N8N_BASE = 'http://127.0.0.1:5678';
const MCP_BASE = 'http://127.0.0.1:3100';

const out: Record<string, unknown> = {};

async function probe(name: string, fn: () => Promise<unknown>) {
  try {
    out[name] = await fn();
  } catch (e) {
    out[name] = { error: (e as Error).message };
  }
  console.log('[' + name + '] =>', JSON.stringify(out[name])?.slice(0, 400));
}

async function httpStatus(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = (await r.text().catch(() => '')).slice(0, 200);
  return { status: r.status, body: text };
}

function wsProbe(url: string, payload: unknown, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames: unknown[] = [];
    const timer = setTimeout(() => { try { ws.terminate(); } catch {} resolve({ frames, error: 'timeout' }); }, timeoutMs);
    ws.on('open', () => {
      try { ws.send(JSON.stringify(payload)); } catch (e) { clearTimeout(timer); resolve({ error: 'send failed: ' + (e as Error).message }); try { ws.terminate(); } catch {} }
    });
    ws.on('message', (data: { toString(): string }) => {
      let j: any = null;
      try { j = JSON.parse(data.toString()); } catch {}
      frames.push(j ? (j.payload && typeof j.payload === 'object' ? { type: j.type, id: j.id, event: j.event, ok: j.ok, error: j.error, payloadType: j.payload?.type, payload: j.payload } : j) : data.toString().slice(0, 200));
      if (j?.type === 'res' && j.id && payload && typeof payload === 'object' && (payload as any).id === j.id) {
        clearTimeout(timer); try { ws.close(); } catch {} resolve({ frames });
      } else if (j?.type === 'event' && j.event === 'connect.challenge') {
        clearTimeout(timer); try { ws.close(); } catch {} resolve({ frames });
      }
    });
    ws.on('error', (e: Error) => { clearTimeout(timer); resolve({ frames, error: e.message }); });
    ws.on('close', () => { clearTimeout(timer); resolve({ frames, closed: true }); });
  });
}

async function main() {
  console.log('=== OpenClaw HTTP 接口 ===');
  await probe('openclaw.health', () => httpStatus(OPENCLAW_BASE + '/api/health'));
  await probe('openclaw.legacy-api-chat', () => httpStatus(OPENCLAW_BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"hi"}' }));
  await probe('openclaw.legacy-api-agents', () => httpStatus(OPENCLAW_BASE + '/api/agents'));
  await probe('openclaw.admin-rpc', () => httpStatus(OPENCLAW_BASE + '/api/v1/admin/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await probe('openclaw.root-page', () => httpStatus(OPENCLAW_BASE + '/'));
  await probe('openclaw.webchat-page', () => httpStatus(OPENCLAW_BASE + '/web/webchat'));
  await probe('openclaw.control-page', () => httpStatus(OPENCLAW_BASE + '/control'));

  console.log('\n=== OpenClaw OpenAI 兼容端点 ===');
  await probe('openclaw.v1-chat-completions', () => httpStatus(OPENCLAW_BASE + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openclaw/default', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }) }));
  await probe('openclaw.v1-models', () => httpStatus(OPENCLAW_BASE + '/v1/models'));

  console.log('\n=== OpenClaw Gateway WebSocket（gateway-client/backend 握手）===');
  await probe('openclaw.ws-handshake', () => wsProbe('ws://127.0.0.1:8080/', {
    type: 'req', id: 'probe-connect', method: 'connect',
    params: {
      minProtocol: 4, maxProtocol: 4,
      client: { id: 'gateway-client', displayName: 'st-probe', version: '0.0.1', platform: 'win32', mode: 'backend' },
      role: 'operator', scopes: ['operator.read', 'operator.write'], caps: [], commands: [], permissions: {}, auth: {},
      locale: 'zh-CN', userAgent: 'st-probe/0.0.1'
    }
  }));
  console.log('\n=== 本地工具服务 ===');
  await probe('hermes.root', () => httpStatus(HERMES_BASE + '/'));
  await probe('hermes.health', () => httpStatus(HERMES_BASE + '/health'));
  await probe('hermes.v1-models', () => httpStatus(HERMES_BASE + '/v1/models'));
  await probe('hermes.chat-openai', () => httpStatus(HERMES_BASE + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'custom/deep-shentong', messages: [{ role: 'user', content: 'hi' }] }) }));
  await probe('hermes.chat-plain', () => httpStatus(HERMES_BASE + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  // 注：Hermes serve 无 OpenAI 兼容端点（405/404），实际调用走 CLI：hermes chat -q "<task>"
  await probe('n8n.healthz', () => httpStatus(N8N_BASE + '/healthz'));
  await probe('mcp.health', () => httpStatus(MCP_BASE + '/health'));

  console.log('\n=== 结论 ===');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('探针异常:', e); process.exit(1); });
