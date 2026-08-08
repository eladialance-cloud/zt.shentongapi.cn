/**
 * OpenClaw 对话主进程服务单测（node:test + tsx）
 * 运行: npx tsx --test tests/unit/openclaw-chat.test.ts
 *
 * v2 链路：扣费收敛到云端 llm-proxy（OpenClaw 内部经 openai provider 直连），
 * 本服务只负责「确保本地 OpenClaw 运行 → 本地流式对话 + 写上下文(auth.json)」。
 *
 * 覆盖：
 *   1. send 流程：ensure → 本地 OpenClaw 流式 → 返回 chunk（无云端 start/settle）
 *   2. 本地调用出错 → 抛原始错误（无退款逻辑，扣费由 llm-proxy 自己处理）
 *   3. abort 中断 → 正常结束（aborted=true，不抛错）
 *   4. 未登录（无 token）→ 拒绝，不做任何本地调用
 *   5. 上下文写入：auth.json 含 token（工具卡扣费用）
 *   6. SSE 帧解析：文本块 / 工具调用聚合 / usage / [DONE] / CRLF
 *   7. 本地 OpenClaw 401（未配置模型/登录过期）→ 抛可读错误（mock HTTP 集成）
 */
import { test, it, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OpenClawChatService,
  createLocalOpenClawCaller,
  parseSseFrame,
  type OpenClawChatEvent,
  type OpenClawSendParams,
} from '../../electron/main/openclaw-chat';

function makeDeps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const contextDir = mkdtempSync(join(tmpdir(), 'st-openclaw-chat-'));
  const deps = {
    callOpenClaw: async function* (params: OpenClawSendParams): AsyncGenerator<string> {
      calls.push('openclaw:' + params.text);
      yield '你';
      yield '好';
    },
    ensureOpenClaw: async () => {
      calls.push('ensure');
    },
    contextDir,
    ...overrides,
  };
  return { deps, calls, contextDir };
}

describe('OpenClawChatService', () => {
  it('send 流程：ensure → 本地 OpenClaw 流式 → 返回 chunk（无云端记账）', async () => {
    const { deps, calls } = makeDeps();
    const svc = new OpenClawChatService(deps as never);
    const chunks: string[] = [];
    const events: OpenClawChatEvent[] = [];
    const result = await svc.send(
      { text: 'hello', token: 'tok-1' },
      (c) => chunks.push(c),
      (e) => events.push(e),
    );
    assert.deepEqual(calls, ['ensure', 'openclaw:hello']);
    assert.deepEqual(chunks, ['你', '好']);
    assert.equal(result.aborted, false);
    assert.equal(result.usage, undefined);
  });

  it('上下文写入：auth.json 含 token（工具卡扣费用）', async () => {
    const { deps, contextDir } = makeDeps();
    const svc = new OpenClawChatService(deps as never);
    await svc.send({ text: 'hi', token: 'tok-auth' }, () => {}, () => {});
    const auth = JSON.parse(readFileSync(join(contextDir, 'auth.json'), 'utf8'));
    assert.equal(auth.token, 'tok-auth');
  });

  it('本地调用出错 → 抛原始错误（退款由 llm-proxy 冻结/结算自行处理）', async () => {
    const { deps, calls } = makeDeps({
      callOpenClaw: async function* () {
        throw new Error('本地 OpenClaw 连接失败');
      },
    });
    const svc = new OpenClawChatService(deps as never);
    await assert.rejects(
      svc.send({ text: 'x', token: 'tok-3' }, () => {}, () => {}),
      /连接失败/,
    );
    assert.deepEqual(calls, ['ensure']);
  });

  it('abort 中断 → 正常结束（aborted=true，不抛错）', async () => {
    const { deps, calls } = makeDeps({
      callOpenClaw: async function* (
        _params: OpenClawSendParams,
        _onEvent: never,
        signal: AbortSignal,
      ): AsyncGenerator<string> {
        calls.push('openclaw:y');
        yield '部分内容';
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      },
    });
    const svc = new OpenClawChatService(deps as never);
    const chunks: string[] = [];
    const promise = svc.send({ text: 'y', token: 'tok-4' }, (c) => chunks.push(c), () => {});
    setTimeout(() => svc.abort(), 50);
    const result = await promise;
    assert.equal(result.aborted, true);
    assert.deepEqual(chunks, ['部分内容']);
    assert.ok(calls.includes('openclaw:y'));
  });

  it('未登录（无 token）直接拒绝，不做任何本地调用', async () => {
    const { deps, calls } = makeDeps();
    const svc = new OpenClawChatService(deps as never);
    await assert.rejects(svc.send({ text: 'hi', token: '' }, () => {}, () => {}), /未登录/);
    assert.deepEqual(calls, []);
  });
});

describe('parseSseFrame 解析', () => {
  it('流式帧：文本块 + 工具调用聚合 + usage + [DONE] 结束', () => {
    const events: OpenClawChatEvent[] = [];
    const toolAccum: Record<number, { id: string; name: string; args: string }> = {};
    const frames: string[] = [
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"你"}}]}',
      'data: {"choices":[{"index":0,"delta":{"content":"好"}}]}',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"n8n-run-workflow","arguments":"{}"}}]}}]}',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      'data: [DONE]',
    ];
    const chunks: string[] = [];
    for (const f of frames) {
      for (const c of parseSseFrame(f, (e) => events.push(e), toolAccum)) chunks.push(c);
    }
    assert.deepEqual(chunks, ['你', '好']);
    const toolEvt = events.find((e) => e.type === 'tool-call');
    assert.ok(toolEvt && toolEvt.type === 'tool-call');
    assert.equal(toolEvt.toolCall?.name, 'n8n-run-workflow');
    assert.equal(toolEvt.toolCall?.id, 'call_1');
    assert.equal(String(toolEvt.toolCall?.input), '{}');
    const doneEvt = events.find((e) => e.type === 'done');
    assert.ok(doneEvt && doneEvt.type === 'done');
    assert.equal(doneEvt.usage?.total, 15);
  });

  it('CRLF 帧也能解析', () => {
    const events: OpenClawChatEvent[] = [];
    const toolAccum: Record<number, { id: string; name: string; args: string }> = {};
    const frame = 'data: {"choices":[{"delta":{"content":"ok"}}]}\r\n\r\n';
    const chunks = parseSseFrame(frame, (e) => events.push(e), toolAccum);
    assert.deepEqual(chunks, ['ok']);
  });
});

describe('createLocalOpenClawCaller mock 集成', () => {
  let serverChild: ReturnType<typeof spawn> | null = null;

  function startMock(code: string): Promise<string> {
    if (serverChild && serverChild.pid) {
      try { serverChild.kill(); } catch {}
    }
    const child = spawn(process.execPath, ['-e', code], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    serverChild = child;
    return waitForPortLine(child);
  }

  after(async () => {
    if (serverChild && serverChild.pid) {
      try { serverChild.kill(); } catch {}
    }
    serverChild = null;
  });

  it('OpenAI 兼容 SSE 全链路：模型名校验 + 流式文本 + 工具调用 + usage', async () => {
    const base = await startMock(MOCK_200);
    const caller = createLocalOpenClawCaller('http://127.0.0.1:' + base);
    const events: OpenClawChatEvent[] = [];
    const chunks: string[] = [];
    for await (const c of caller(
      { text: 'hi', token: 'x' },
      (e) => events.push(e),
      new AbortController().signal,
    )) {
      chunks.push(c);
    }
    assert.deepEqual(chunks, ['你', '好']);
    assert.ok(events.some((e) => e.type === 'tool-call'));
    assert.ok(events.some((e) => e.type === 'done' && e.usage?.total === 15));
  });

  it('OpenClaw 返回 401（未配置模型/登录过期）→ 抛可读错误', async () => {
    const base = await startMock(MOCK_401);
    const caller = createLocalOpenClawCaller('http://127.0.0.1:' + base);
    await assert.rejects(
      (async () => {
        for await (const _c of caller({ text: 'hi', token: 'x' }, () => {}, new AbortController().signal)) {
          // 不消费
        }
      })(),
      /未配置模型/,
    );
  });
});

const MOCK_200 = "const http = require('node:http');\nconst s = http.createServer((req, res) => {\n  if (req.url !== '/v1/chat/completions') {\n    res.writeHead(404); res.end(); return;\n  }\n  let body = '';\n  req.on('data', (d) => (body += d));\n  req.on('end', () => {\n    const payload = JSON.parse(body || '{}');\n    if (payload.model !== 'openclaw/default') {\n      res.writeHead(400, { 'Content-Type': 'application/json' });\n      res.end(JSON.stringify({ error: 'bad model' })); return;\n    }\n    res.writeHead(200, { 'Content-Type': 'text/event-stream' });\n    res.write('data: {\\\"choices\\\":[{\\\"index\\\":0,\\\"delta\\\":{\\\"role\\\":\\\"assistant\\\",\\\"content\\\":\\\"你\\\"}}]}\\n\\n');\n    res.write('data: {\\\"choices\\\":[{\\\"index\\\":0,\\\"delta\\\":{\\\"content\\\":\\\"好\\\"}}]}\\n\\n');\n    res.write('data: {\\\"choices\\\":[{\\\"index\\\":0,\\\"delta\\\":{\\\"tool_calls\\\":[{\\\"index\\\":0,\\\"id\\\":\\\"call_1\\\",\\\"function\\\":{\\\"name\\\":\\\"n8n-run-workflow\\\",\\\"arguments\\\":\\\"{}\\\"}}]}}]}\\n\\n');\n    res.write('data: {\\\"choices\\\":[{\\\"index\\\":0,\\\"delta\\\":{},\\\"finish_reason\\\":\\\"stop\\\"}],\\\"usage\\\":{\\\"prompt_tokens\\\":10,\\\"completion_tokens\\\":5,\\\"total_tokens\\\":15}}\\n\\n');\n    res.write('data: [DONE]\\n\\n');\n    res.end();\n  });\n});\ns.listen(0, '127.0.0.1', () => console.log('PORT=' + s.address().port));";
const MOCK_401 = "const http = require('node:http');\nconst s = http.createServer((req, res) => {\n  if (req.url !== '/v1/chat/completions') {\n    res.writeHead(404); res.end(); return;\n  }\n  let body = '';\n  req.on('data', (d) => (body += d));\n  req.on('end', () => {\n    const payload = JSON.parse(body || '{}');\n    if (payload.model !== 'openclaw/default') {\n      res.writeHead(400, { 'Content-Type': 'application/json' });\n      res.end(JSON.stringify({ error: 'bad model' })); return;\n    }\n    res.writeHead(401, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'missing api key' })); return;\n  });\n});\ns.listen(0, '127.0.0.1', () => console.log('PORT=' + s.address().port));";

function waitForPortLine(child: ReturnType<typeof spawn>, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('mock server 启动超时')), timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/PORT=(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('mock server 退出 code=' + code));
    });
  });
}

