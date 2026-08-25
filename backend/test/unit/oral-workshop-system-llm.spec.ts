/** SystemLlmService（口播工坊系统级 LLM 调用器）单元测试
 * 覆盖：供应商解析优先级、API Key 池兜底、直连 /chat/completions、错误处理
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SystemLlmService, extractModelIds } from '../../src/modules/oral-workshop/system-llm.service';

type AnyRepo = any;

function makeService(providerRepo: AnyRepo, apiKeyPool: AnyRepo, encryption: AnyRepo, configRepo: AnyRepo = null): SystemLlmService {
  const cfgRepo = configRepo ?? { findOne: async () => null };
  return new SystemLlmService(providerRepo, cfgRepo as any, apiKeyPool, encryption);
}

const decrypt = (c: string) => c.replace('enc-', 'sk-');

describe('SystemLlmService', () => {
  it('resolveTarget：优先 active 供应商并按 deepseek>openai>qwen>doubao 偏好排序', async () => {
    const providers = [
      { slug: 'qwen', status: 'active', apiKey: 'enc-qwen', baseUrl: 'https://qwen.example/v1/' },
      { slug: 'deepseek', status: 'active', apiKey: 'enc-ds', baseUrl: 'https://ds.example/v1/' },
      { slug: 'openai', status: 'disabled', apiKey: 'enc-oa', baseUrl: 'https://oa.example/v1/' },
    ];
    const svc = makeService({ find: async () => providers }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    const t = await svc.resolveTarget();
    assert.equal(t?.endpoint, 'https://ds.example/v1');
    assert.equal(t?.apiKey, 'sk-ds');
    assert.equal(t?.model, 'deepseek-chat');
  });

  it('resolveTarget：供应商无 key 时回退 API Key 池', async () => {
    const providers = [{ slug: 'deepseek', status: 'active', apiKey: null, baseUrl: 'https://ds.example/v1/' }];
    const svc = makeService(
      { find: async () => providers },
      { getNextAvailableKey: async (slug: string) => (slug === 'deepseek' ? { apiKey: 'enc-pool' } : null) },
      { decryptAes: decrypt },
    );
    const t = await svc.resolveTarget();
    assert.equal(t?.apiKey, 'sk-pool');
    // 供应商存在 baseUrl 时优先复用其端点（仅 key 走池兜底）
    assert.equal(t?.endpoint, 'https://ds.example/v1');
  });

  it('resolveTarget：全部不可用时返回 null', async () => {
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    assert.equal(await svc.resolveTarget(), null);
  });

  it('chat：直连 OpenAI 兼容端点并返回 content（不冻结 Credits）', async () => {
    const svc = makeService(
      { find: async () => [{ slug: 'deepseek', status: 'active', apiKey: 'enc-k', baseUrl: 'http://mock/v1/' }] },
      { getNextAvailableKey: async () => null },
      { decryptAes: decrypt },
    );
    let captured: { url: string; opts: { headers: Record<string, string>; body: string } } | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: '改写结果' } }] }) };
    };
    const out = await svc.chat([{ role: 'user', content: 'hello' }], { temperature: 0.3 });
    assert.equal(out, '改写结果');
    assert.ok(captured!.url.endsWith('/v1/chat/completions'));
    assert.ok(captured!.opts.headers.Authorization.startsWith('Bearer sk-'));
    const body = JSON.parse(captured!.opts.body);
    assert.equal(body.model, 'deepseek-chat');
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0.3);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'hello' }]);
    delete (globalThis as any).fetch;
  });

  it('chat：上游非 2xx 抛 ServiceUnavailableException（含状态码）', async () => {
    const svc = makeService(
      { find: async () => [{ slug: 'deepseek', status: 'active', apiKey: 'enc-k', baseUrl: 'http://mock/v1/' }] },
      { getNextAvailableKey: async () => null },
      { decryptAes: decrypt },
    );
    (globalThis as any).fetch = async () => ({ ok: false, status: 502, text: async () => 'bad gateway' });
    await assert.rejects(() => svc.chat([{ role: 'user', content: 'x' }]), /HTTP 502/);
    delete (globalThis as any).fetch;
  });

  it('chat：未配置供应商时抛 ServiceUnavailableException', async () => {
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    await assert.rejects(() => svc.chat([{ role: 'user', content: 'x' }]), /未配置可用的大模型供应商/);
  });

  it('embed：管理后台 embeddingProvider/embeddingModel/embeddingApiKey 配置直连（无供应商行）', async () => {
    const cfgRepo = { findOne: async () => ({ configValue: { embeddingProvider: 'qwen', embeddingModel: 'my-embed-model', embeddingApiKey: 'sk-cfg', embeddingEndpoint: 'https://embed.example/v1/' } }) };
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt }, cfgRepo);
    let captured: { url: string; opts: { headers: Record<string, string>; body: string } } | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) };
    };
    const out = await svc.embed(['素材文本']);
    assert.equal(out.length, 1);
    assert.equal(captured!.url, 'https://embed.example/v1/embeddings');
    assert.equal(captured!.opts.headers.Authorization, 'Bearer sk-cfg');
    assert.equal(JSON.parse(captured!.opts.body).model, 'my-embed-model');
    delete (globalThis as any).fetch;
  });

  it('embed：doubao 默认端点 + llmApiKey 兜底（未填 embeddingApiKey）', async () => {
    const cfgRepo = { findOne: async () => ({ configValue: { embeddingProvider: 'doubao', embeddingModel: 'doubao-embedding-text-240715', llmApiKey: 'sk-llm' } }) };
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt }, cfgRepo);
    let captured: { url: string; opts: { headers: Record<string, string>; body: string } } | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ data: [{ embedding: [0.1] }] }) };
    };
    await svc.embed(['x']);
    assert.equal(captured!.url, 'https://ark.cn-beijing.volces.com/api/v3/embeddings');
    assert.equal(captured!.opts.headers.Authorization, 'Bearer sk-llm');
    assert.equal(JSON.parse(captured!.opts.body).model, 'doubao-embedding-text-240715');
    delete (globalThis as any).fetch;
  });

});
describe('extractModelIds', () => {
  it('OpenAI 兼容 data[].id 形态', () => {
    assert.deepEqual(extractModelIds({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: '' }] }), ['gpt-4o', 'gpt-4o-mini']);
  });
  it('火山方舟 ListModels 形态（data[].id + model_name）', () => {
    assert.deepEqual(extractModelIds({ data: [{ id: 'ep-20240815-abc', model_name: 'doubao-pro-32k' }] }), ['ep-20240815-abc']);
  });
  it('models[] 与 model_list[] 形态兜底', () => {
    assert.deepEqual(extractModelIds({ models: ['a', 'b'] }), ['a', 'b']);
    assert.deepEqual(extractModelIds({ model_list: [{ model: 'c' }] }), ['c']);
  });
  it('非法输入返回空数组', () => {
    assert.deepEqual(extractModelIds(null), []);
    assert.deepEqual(extractModelIds('nope'), []);
    assert.deepEqual(extractModelIds({}), []);
  });
  it('去重并排序', () => {
    assert.deepEqual(extractModelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] }), ['a', 'b']);
  });
});

describe('SystemLlmService.listModels', () => {
  it('无 Key 时直接失败', async () => {
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    const out = await svc.listModels({ baseUrl: 'https://x/v1', apiKey: '' });
    assert.equal(out.success, false);
    assert.match(out.message || '', /API Key/);
  });
  it('默认火山端点 + Bearer 鉴权拉取模型', async () => {
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    let captured: { url: string; opts: { headers: Record<string, string> } } | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ data: [{ id: 'doubao-seed-1-6-250615' }, { id: 'doubao-pro-32k' }] }) };
    };
    const out = await svc.listModels({ apiKey: 'sk-ark' });
    assert.equal(out.success, true);
    assert.deepEqual(out.models, ['doubao-pro-32k', 'doubao-seed-1-6-250615']);
    assert.equal(captured!.url, 'https://ark.cn-beijing.volces.com/api/v3/models');
    assert.equal(captured!.opts.headers.Authorization, 'Bearer sk-ark');
    delete (globalThis as any).fetch;
  });
  it('HTTP 非 200 返回错误信息', async () => {
    const svc = makeService({ find: async () => [] }, { getNextAvailableKey: async () => null }, { decryptAes: decrypt });
    (globalThis as any).fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
    const out = await svc.listModels({ baseUrl: 'https://x/v1', apiKey: 'bad' });
    assert.equal(out.success, false);
    assert.match(out.message || '', /401/);
    delete (globalThis as any).fetch;
  });
});

