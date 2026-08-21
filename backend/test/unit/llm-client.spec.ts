/**
 * LlmClientService 工具调用透传单元测试
 * 运行: node -r ts-node/register --test test/unit/llm-client.spec.ts
 *
 * 覆盖：
 *   1. 无 toolExecutor + 上游返回 tool_calls → onToolCallsDone 回调（替代 onDone），onDone 不被调用
 *   2. onToolCallDelta 收到流式原始 delta（代理网关原样转发给 OpenClaw）
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { LlmClientService, type StreamChatCallbacks } from '../../src/modules/chat/services/llm-client.service';

let server: Server | null = null;

function startSseMock(handler: (body: string, res: { write: (s: string) => void; end: () => void }) => void): Promise<string> {
  return new Promise((resolve) => {
    if (server) {
      server.closeAllConnections();
      server.close();
      server = null;
    }
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'close' });
        handler(body, {
          write: (s: string) => res.write(s),
          end: () => res.end(),
        });
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      resolve(typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '');
    });
  });
}

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server!.close(r));
    server = null;
  }
});

describe('LlmClientService 工具调用透传', () => {
  it('无 toolExecutor 且上游返回 tool_calls → onToolCallsDone 回调，onDone 不触发', async () => {
    const base = await startSseMock((_body, res) => {
      res.write('data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","function":{"name":"echo_test","arguments":"{}"}}]}}]}\n\n');
      res.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });

    const svc = new LlmClientService();
    let doneCalls = 0;
    let toolCallsDone: Array<{ id: string; name: string; args: string }> | null = null;
    const deltas: unknown[][] = [];
    const callbacks: StreamChatCallbacks = {
      onMessage: () => {},
      onToolCallDelta: (toolCalls: unknown[]) => { deltas.push(toolCalls); },
      onDone: async () => { doneCalls++; },
      onToolCallsDone: async (calls) => {
        toolCallsDone = calls;
      },
      onError: async () => {},
    };
    await svc.streamChat(
      {
        model: 'test-model',
        apiKey: 'sk-test',
        endpoint: base,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
      },
      callbacks,
    );
    assert.equal(doneCalls, 0);
    assert.ok(toolCallsDone);
    const calls = toolCallsDone as Array<{ id: string; name: string; args: string }>;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'echo_test');
    assert.equal(calls[0].args, '{}');
    assert.ok(deltas.length >= 1);
  });

  it('有 toolExecutor 时仍走工具执行（onToolCallsDone 不触发）', async () => {
    let callCount = 0;
    const base = await startSseMock((_body, res) => {
      callCount++;
      if (callCount === 1) {
        res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_2","function":{"name":"echo_test","arguments":"{}"}}]}}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      // 递归（工具结果回填）→ 纯文本回复
      res.write('data: {"choices":[{"delta":{"content":"final"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });
    const svc = new LlmClientService();
    let toolCallsDone = 0;
    const callbacks: StreamChatCallbacks = {
      onMessage: () => {},
      onToolCallsDone: async () => { toolCallsDone++; },
      onDone: async () => {},
      onError: async () => {},
    };
    await svc.streamChat(
      {
        model: 'test-model',
        apiKey: 'sk-test',
        endpoint: base,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        toolExecutor: async (toolName: string) => ({ output: 'ran:' + toolName }),
      },
      callbacks,
    );
    assert.equal(toolCallsDone, 0);
  });
});

describe('LlmClientService extraBody 合并', () => {
  it('extraBody 字段合并进上游请求体（不覆盖既有字段）', async () => {
    let capturedBody = '';
    const base = await startSseMock((body, res) => {
      capturedBody = body;
      res.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });
    const svc = new LlmClientService();
    const callbacks: StreamChatCallbacks = {
      onMessage: () => {},
      onDone: async () => {},
      onError: async () => {},
    };
    await svc.streamChat(
      {
        model: 'test-model',
        apiKey: 'sk-test',
        endpoint: base,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        extraBody: { files: ['file-fe-1'], target_lang: 'zh', stream: false, model: 'evil', messages: [{ role: 'user', content: 'overwrite' }] },
      },
      callbacks,
    );
    const parsed = JSON.parse(capturedBody);
    assert.deepEqual(parsed.files, ['file-fe-1']);
    assert.equal(parsed.target_lang, 'zh');
    assert.equal(parsed.model, 'test-model'); // 基础字段优先
    assert.equal(parsed.stream, true);        // 基础字段优先
    assert.deepEqual(parsed.messages, [{ role: 'system', content: '' }, { role: 'user', content: 'hi' }]); // 未被覆盖
  });
});