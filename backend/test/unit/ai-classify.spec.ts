import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AiClassifyService } from '../../src/modules/admin-classify/ai-classify.service';

test('classify: 无可用模型/中转时回退 other + 空 tags', async () => {
  const svc = new AiClassifyService(
    { findOne: async () => null } as never,
    { findOne: async () => null } as never,
    { decryptAes: (k: string) => k } as never,
    null as never,
  );
  const r = await svc.classify('某内容', 'agent');
  assert.deepEqual(r, { category: 'other', tags: [] });
});

test('classify: 有中转+模型时调用 chat/completions 并解析 JSON 输出', async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: (init.headers ?? {}) as Record<string, string>, body: String(init.body) });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{\"category\":\"copywriting\",\"tags\":[\"文案\",\"营销\"]}' } }] }) } as never;
  });
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'qwen-max', upstreamModelId: 'qwen-max' }) } as never,
    { findOne: async () => ({ isGlobal: true, status: 'active', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'enc' }) } as never,
    { decryptAes: (k: string) => 'sk-decrypted' } as never,
    null as never,
  );
  const r = await svc.classify('写一篇小红书文案', 'agent');
  assert.equal(r.category, 'copywriting');
  assert.deepEqual(r.tags, ['文案', '营销']);
  assert.ok(calls[0].url.endsWith('/v1/chat/completions'));
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-decrypted');
});

test('classify: 上游返回非 JSON 时回退 other', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '抱歉，无法分类' } }] }) }) as never);
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'm', upstreamModelId: 'm' }) } as never,
    { findOne: async () => ({ status: 'active', baseUrl: 'https://x/v1', apiKey: 'e' }) } as never,
    { decryptAes: () => 'k' } as never,
    null as never,
  );
  assert.deepEqual(await svc.classify('x', 'mcp'), { category: 'other', tags: [] });
});
test('classify: 上游返回非法枚举分类时回退 other', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"category":"bogus","tags":["x"]}' } }] }) }) as never);
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'm', upstreamModelId: 'm' }) } as never,
    { findOne: async () => ({ status: 'active', baseUrl: 'https://x/v1', apiKey: 'e' }) } as never,
    { decryptAes: () => 'k' } as never,
  );
  assert.deepEqual(await svc.classify('x', 'agent'), { category: 'other', tags: [] });
});

test('classifyAndUpdate: 分类成功按 id 写回 category/tags', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"category":"programming","tags":["typescript"]}' } }] }) }) as never);
  const updated: Array<{ criteria: { id: number }; data: { category?: string; tags?: string[] } }> = [];
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'm', upstreamModelId: 'm' }) } as never,
    { findOne: async () => ({ status: 'active', baseUrl: 'https://x/v1', apiKey: 'e' }) } as never,
    { decryptAes: () => 'k' } as never,
    { findOne: async () => ({ id: 7, name: 't', systemPrompt: 'hello' }), update: async (criteria: { id: number }, data: { category?: string; tags?: string[] }) => { updated.push({ criteria, data }); return { affected: 1 }; } } as never,
  );
  await svc.classifyAndUpdate('agent', 7);
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].criteria, { id: 7 });
  assert.deepEqual(updated[0].data, { category: 'programming', tags: ['typescript'] });
});

test('classifyAndUpdate: AI 回退 other 时不写回', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '抱歉，无法分类' } }] }) }) as never);
  let updated = 0;
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'm', upstreamModelId: 'm' }) } as never,
    { findOne: async () => ({ status: 'active', baseUrl: 'https://x/v1', apiKey: 'e' }) } as never,
    { decryptAes: () => 'k' } as never,
    { findOne: async () => ({ id: 7, name: 't', systemPrompt: 'hello' }), update: async () => { updated++; return { affected: 1 }; } } as never,
  );
  await svc.classifyAndUpdate('agent', 7);
  assert.equal(updated, 0);
});

test('reclassify: plugin 类型读 eco_plugins 表并仅写回 category（无 tags 列）', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"category":"database","tags":["db"]}' } }] }) }) as never);
  const updated: Array<{ criteria: { id: number }; data: { category?: string } }> = [];
  const svc = new AiClassifyService(
    { findOne: async () => ({ isActive: true, modelType: 'chat', providerId: 1, modelId: 'm', upstreamModelId: 'm' }) } as never,
    { findOne: async () => ({ status: 'active', baseUrl: 'https://x/v1', apiKey: 'e' }) } as never,
    { decryptAes: () => 'k' } as never,
    { findOne: async () => null } as never,
    { findOne: async () => null } as never,
    { findOne: async () => null } as never,
    { findOne: async () => null } as never,
    { findOne: async () => ({ id: 3, name: 'pg', description: 'db tool' }), update: async (criteria: { id: number }, data: { category?: string }) => { updated.push({ criteria, data }); return { affected: 1 }; } } as never,
  );
  const r = await svc.reclassify('plugin', 3);
  assert.equal(r.category, 'database');
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].data, { category: 'database' });
});
