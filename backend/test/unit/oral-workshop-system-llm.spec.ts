/** SystemLlmService（口播工坊系统级 LLM 调用器）单元测试
 * 覆盖：供应商解析优先级、API Key 池兜底、直连 /chat/completions、错误处理
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SystemLlmService } from '../../src/modules/oral-workshop/system-llm.service';

type AnyRepo = any;

function makeService(providerRepo: AnyRepo, apiKeyPool: AnyRepo, encryption: AnyRepo): SystemLlmService {
  return new SystemLlmService(providerRepo, apiKeyPool, encryption);
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
});
