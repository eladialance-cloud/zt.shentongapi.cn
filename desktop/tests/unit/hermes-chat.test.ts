/**
 * Hermes 对话主进程桥接单测（node:test + tsx）
 * 运行: npx tsx --test tests/unit/hermes-chat.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HermesChatService,
  HERMES_CHAT_MODEL,
  buildHermesMessages,
  type HermesChatEvent,
} from '../../electron/main/hermes-chat';

function makeSse(frames: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f + '\n\n'));
      controller.close();
    },
  });
  const fetchImpl = async () =>
    new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  return { fetchImpl };
}

describe('HermesChatService', () => {
  test('send 流式返回文本 chunk + done(usage；走 custom/deep-shentong)', async () => {
    const { fetchImpl } = makeSse([
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
      'data: [DONE]',
    ]);
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl });
    const chunks: string[] = [];
    const events: HermesChatEvent[] = [];
    const result = await svc.send(
      { text: '你好', token: 'tok-1' },
      (c) => chunks.push(c),
      (e) => events.push(e),
    );
    assert.deepEqual(chunks, ['你', '好']);
    const done = events.find((e) => e.type === 'done') as Extract<HermesChatEvent, { type: 'done' }>;
    assert.ok(done, 'expect done event');
    assert.equal(done.usage?.total, 5);
    assert.equal(result.aborted, false);
  });
  test('send 携带 reasoning_effort 到请求体（非 auto）', async () => {
    let capturedBody: string | null = null;
    const fetchImpl = async (_url: URL | RequestInfo, init?: RequestInit) => {
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      const stream = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl });
    const events: HermesChatEvent[] = [];
    await svc.send({ text: 'hi', token: 'tok-1', reasoningEffort: 'high' }, () => {}, (e) => events.push(e));
    assert.ok(capturedBody, 'expect body captured');
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.reasoning_effort, 'high');
    const ev = events.find((e) => e.type === 'done');
    assert.ok(ev, 'expect done event');
  });

  test('send 解析工具调用为 tool-call 事件并标记运行态', async () => {
    const { fetchImpl } = makeSse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"knowledge-query","arguments":"{}"}}]}}]}',
      'data: [DONE]',
    ]);
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl });
    const events: HermesChatEvent[] = [];
    await svc.send({ text: '查资料', token: 'tok-1' }, () => {}, (e) => events.push(e));
    const tc = events.find((e) => e.type === 'tool-call') as Extract<HermesChatEvent, { type: 'tool-call' }>;
    assert.ok(tc, 'expect tool-call event');
    assert.equal(tc.toolCall.name, 'knowledge-query');
    assert.equal(tc.toolCall.state, 'running');
  });

  test('未登录(无 sessionToken/token)拒绝调用', async () => {
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => '', fetchImpl: makeSse([]).fetchImpl });
    await assert.rejects(() => svc.send({ text: 'hi' }, () => {}, () => {}), /登录|token/i);
  });
  test('send 含工具调用时在 done 前补发 finishing/finalize(终审+来源标注)', async () => {
    const { fetchImpl } = makeSse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"knowledge-query","arguments":"{}"}}]}}]}',
      'data: {"choices":[{"delta":{"content":"查询完成。"}}]}',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}',
      'data: [DONE]',
    ]);
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl });
    const events: HermesChatEvent[] = [];
    await svc.send({ text: '查资料', token: 'tok-1' }, () => {}, (e) => events.push(e));

    const phases = events
      .filter((e) => e.type === 'lifecycle')
      .map((e) => (e as Extract<HermesChatEvent, { type: 'lifecycle' }>).lifecycle.phase);
    assert.ok(phases.includes('finishing'), 'expect finishing lifecycle before done');
    assert.ok(phases.includes('end'), 'expect end lifecycle before done');

    const fin = events.find((e) => e.type === 'finalize') as Extract<HermesChatEvent, { type: 'finalize' }> | undefined;
    assert.ok(fin, 'expect finalize event when tool used');
    assert.ok(fin.content.includes('📊 数据来源: 知识库'), 'finalize content has source annotation');

    const done = events.find((e) => e.type === 'done') as Extract<HermesChatEvent, { type: 'done' }> | undefined;
    assert.ok(done, 'expect done event');
    assert.equal(done.usage?.total, 7);
  });

  test('send 中断(AbortError)不抛出，返回 aborted=true 并补发 error/lifecycle', async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error('fetch aborted'), { name: 'AbortError' })
    }
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl })
    const events: HermesChatEvent[] = []
    const result = await svc.send({ text: 'hi', token: 'tok-1' }, () => {}, (e) => events.push(e))
    assert.equal(result.aborted, true)
    assert.ok(events.some((e) => e.type === 'error'), 'expect error event')
    assert.ok(
      events.some((e) => e.type === 'lifecycle' && (e as Extract<HermesChatEvent, { type: 'lifecycle' }>).lifecycle.phase === 'error'),
      'expect error lifecycle',
    )
  })

  test('send 空结果触发终审兜底 finalize', async () => {
    const { fetchImpl } = makeSse(['data: [DONE]'])
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl })
    const events: HermesChatEvent[] = []
    await svc.send({ text: 'hi', token: 'tok-1' }, () => {}, (e) => events.push(e))
    const fin = events.find((e) => e.type === 'finalize') as Extract<HermesChatEvent, { type: 'finalize' }> | undefined
    assert.ok(fin, 'expect finalize when empty result')
    assert.equal(fin.content, '(结果为空，请检查输入或重试)')
  })

  test('send HTTP 非 OK 抛错并补发 error/lifecycle', async () => {
    const fetchImpl = async () => new Response('bad gateway', { status: 500 })
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl })
    const events: HermesChatEvent[] = []
    await assert.rejects(() => svc.send({ text: 'hi', token: 'tok-1' }, () => {}, (e) => events.push(e)), /500|Hermes/)
    assert.ok(events.some((e) => e.type === 'error'), 'expect error event on non-ok')
  })

  test('send 无工具调用且内容完整不触发 finalize', async () => {
    const { fetchImpl } = makeSse([
      'data: {"choices":[{"delta":{"content":"这是一段比较长的回答内容超过二十个字了"}}]}',
      'data: [DONE]',
    ])
    const svc = new HermesChatService({ baseUrl: 'http://127.0.0.1:8642', sessionToken: () => 'sess-1', fetchImpl })
    const events: HermesChatEvent[] = []
    await svc.send({ text: 'hi', token: 'tok-1' }, () => {}, (e) => events.push(e))
    assert.ok(!events.some((e) => e.type === 'finalize'), 'no finalize when text unchanged')
  })

  test('send 写入工具卡上下文（auth/accounting/knowledge-scope）', async () => {
    const { fetchImpl } = makeSse(['data: [DONE]'])
    const dir = mkdtempSync(join(tmpdir(), 'hermes-chat-ctx-'))
    try {
      const svc = new HermesChatService({
        baseUrl: 'http://127.0.0.1:8642',
        sessionToken: () => 'sess-1',
        fetchImpl,
        contextDir: dir,
      })
      await svc.send(
        { text: '查资料', token: 'tok-abc', modelId: 'custom/deep-shentong', knowledgeBaseId: 3 },
        () => {},
        () => {},
      )
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'auth.json'), 'utf8')), { token: 'tok-abc' })
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'current-accounting.json'), 'utf8')), { modelId: 'custom/deep-shentong' })
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'knowledge-scope.json'), 'utf8')), { mode: 'kb', kbId: 3 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

});

describe('buildHermesMessages', () => {
  test('无 soul 时仅 history + user', () => {
    const msgs = buildHermesMessages('你好', [{ role: 'assistant', content: '嗨' }]);
    assert.deepEqual(msgs, [{ role: 'assistant', content: '嗨' }, { role: 'user', content: '你好' }]);
  });
  test('有 soul 时作为第一条 system 人设', () => {
    const msgs = buildHermesMessages('帮我看需求', undefined, '你是中书省，负责规划决策。');
    assert.deepEqual(msgs[0], { role: 'system', content: '你是中书省，负责规划决策。' });
    assert.equal(msgs[msgs.length - 1].role, 'user');
  });
  test('history 可含 system 仍保持顺序', () => {
    const msgs = buildHermesMessages('继续', [{ role: 'system', content: '前置系统' }], '人设');
    assert.equal(msgs.length, 3);
    assert.equal(msgs[0].content, '人设');
    assert.equal(msgs[1].content, '前置系统');
    assert.equal(msgs[2].role, 'user');
  });
});
