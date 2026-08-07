/**
 * 内容市场单元测试
 * 运行: node -r ts-node/register --test test/unit/market-purchase.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';

import { MarketService } from '../../src/modules/market/market.service';
import { canonicalJson, sortKeysRecursively, buildSkillPackage, buildAgentPackage } from '../../src/modules/market/packagers/package-builder';

/** 内存仓库 mock */
function mockRepo(rows: any[] = []) {
  return {
    findOne: async ({ where }: any) => rows.find((r) => (where.id ? r.id === where.id : true)) ?? null,
    find: async () => rows,
    create: (d: any) => ({ ...d }),
    save: async (d: any) => ({ ...d, id: 1 }),
  };
}

function makeService(overrides: Partial<any> = {}) {
  const skill = overrides.skill ?? { id: 1, name: '数据分析', description: 'd', author: 'a', pricePerMinute: 5, version: '1.0.0', isActive: true, execConfig: { type: 'script', language: 'javascript', code: 'return 1' }, category: 'analysis', tags: ['x'], icon: null };
  const plugin = overrides.plugin ?? { id: 1, name: 'web-search', description: 'd', version: '1.0.0', isActive: true, mcpServerUrl: 'http://127.0.0.1:9000/mcp', config: { key: 'v' }, isOfficial: true };
  const workflow = overrides.workflow ?? { id: 1, name: '数据清洗', description: 'd', engineType: 'n8n', category: 'data_processing', version: '1.0.0', workflowJson: '{"nodes":[]}', reviewStatus: 'approved', isActive: true, pricePerExecution: 3, tags: [], icon: null };
  const agent = overrides.agent ?? { id: 1, name: '客服助手', displayName: '客服助手', description: 'd', systemPrompt: '你是客服', modelId: 'gpt-4o-mini', pricePerCall: 2, status: 'published', version: 1, category: 'other', tags: [], runtimeType: 'hermes', pricingStrategy: 'model', modelConfig: null, outputRule: '', allowedPluginIds: [], allowedWorkflowIds: [], allowedKnowledgeBaseIds: [], avatar: null, usageExample: '' };

  const credits = {
    freezeCredits: async (userId: number, amount: number) => ({ id: 100, userId, amount }),
    settleCredits: async () => ({}),
  };

  const purchasedRepo = mockRepo(overrides.purchased ?? []);

  const service = new MarketService(
    purchasedRepo as any,
    mockRepo([skill]) as any,
    mockRepo([plugin]) as any,
    mockRepo([workflow]) as any,
    mockRepo([agent]) as any,
    credits as any,
  );
  return { service, purchasedRepo, credits };
}

describe('MarketService.resolveItem', () => {
  it('skill 返回价格/版本/安装包', async () => {
    const { service } = makeService();
    const r = await service.resolveItem('skill', 1);
    assert.equal(r.price, 5);
    assert.equal(r.version, '1.0.0');
    assert.equal(r.pkg.type, 'skill');
    assert.equal((r.pkg.payload as any).skill.name, '数据分析');
  });
  it('workflow 未审核通过抛 404', async () => {
    const { service } = makeService({ workflow: { id: 1, name: 'w', reviewStatus: 'pending_review', isActive: true, pricePerExecution: 1 } });
    await assert.rejects(() => service.resolveItem('workflow', 1), /不存在或未发布/);
  });
  it('agent 未发布抛 404', async () => {
    const { service } = makeService({ agent: { id: 1, name: 'a', status: 'draft' } });
    await assert.rejects(() => service.resolveItem('agent', 1), /不存在或未发布/);
  });
  it('不存在的类型抛 404', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.resolveItem('bogus' as any, 1), /不支持的内容类型/);
  });
});

describe('MarketService.purchase', () => {
  it('付费内容扣积分并写入已购', async () => {
    const { service, purchasedRepo } = makeService();
    let frozenCalls = 0;
    let settledCalls = 0;
    const svc = new MarketService(
      purchasedRepo as any,
      service['skillRepo'] as any,
      service['pluginRepo'] as any,
      service['workflowRepo'] as any,
      service['agentRepo'] as any,
      {
        freezeCredits: async (u: number, a: number) => { frozenCalls++; return { id: 100, userId: u, amount: a }; },
        settleCredits: async () => { settledCalls++; return {}; },
      } as any,
    );
    const rec = await svc.purchase(9, 'skill', 1);
    assert.equal(frozenCalls, 1);
    assert.equal(settledCalls, 1);
    assert.equal(rec.price, 5);
  });
  it('重复购买幂等不重复扣费', async () => {
    const { service, purchasedRepo, credits } = makeService({
      purchased: [{ id: 1, userId: 9, itemType: 'skill', itemId: 1, version: '1.0.0', price: 5 }],
    });
    let calls = 0;
    const svc = new MarketService(
      purchasedRepo as any,
      service['skillRepo'] as any,
      service['pluginRepo'] as any,
      service['workflowRepo'] as any,
      service['agentRepo'] as any,
      { freezeCredits: async () => { calls++; return { id: 1 }; }, settleCredits: async () => {} } as any,
    );
    const rec = await svc.purchase(9, 'skill', 1);
    assert.equal(calls, 0);
    assert.equal(rec.id, 1);
  });
  it('免费内容不扣积分', async () => {
    const { service, purchasedRepo } = makeService({ plugin: { id: 1, name: 'p', version: '1.0.0', isActive: true, mcpServerUrl: 'http://x' } });
    let calls = 0;
    const svc = new MarketService(
      purchasedRepo as any,
      service['skillRepo'] as any,
      service['pluginRepo'] as any,
      service['workflowRepo'] as any,
      service['agentRepo'] as any,
      { freezeCredits: async () => { calls++; return { id: 1 }; }, settleCredits: async () => {} } as any,
    );
    const rec = await svc.purchase(9, 'plugin', 1);
    assert.equal(calls, 0);
    assert.equal(rec.price, 0);
  });
});

describe('MarketService.getDownloadPackage', () => {
  it('未购买付费内容抛 402', async () => {
    const { service } = makeService();
    await assert.rejects(() => service.getDownloadPackage(9, 'skill', 1), (e: any) => {
      assert.ok(e instanceof HttpException);
      assert.equal(e.getStatus(), 402);
      return true;
    });
  });
  it('已购买返回 pkg + sha256 与 canonicalJson 一致', async () => {
    const { service, purchasedRepo } = makeService({
      purchased: [{ id: 1, userId: 9, itemType: 'skill', itemId: 1, version: '1.0.0', price: 5 }],
    });
    const svc = new MarketService(
      purchasedRepo as any,
      service['skillRepo'] as any,
      service['pluginRepo'] as any,
      service['workflowRepo'] as any,
      service['agentRepo'] as any,
      { freezeCredits: async () => ({ id: 1 }), settleCredits: async () => {} } as any,
    );
    const r = await svc.getDownloadPackage(9, 'skill', 1);
    assert.equal(r.sha256.length, 64);
    const expected = require('node:crypto').createHash('sha256').update(canonicalJson(r.pkg), 'utf8').digest('hex');
    assert.equal(r.sha256, expected);
    assert.equal(r.version, '1.0.0');
  });
  it('免费内容无需购买即可下载', async () => {
    const { service } = makeService();
    const r = await service.getDownloadPackage(9, 'plugin', 1);
    assert.equal(r.type, 'plugin');
    assert.ok(r.sha256);
  });
});

describe('package-builder', () => {
  it('canonicalJson 键排序确定', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), JSON.stringify({ a: 2, b: 1 }));
    assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  });
  it('buildSkillPackage 含 execConfig', () => {
    const p = buildSkillPackage({ id: 1, name: 'n', version: '2.0.0', execConfig: { type: 'shell', command: 'echo hi' }, pricePerMinute: 3 } as any);
    assert.equal(p.version, '2.0.0');
    assert.equal((p.payload as any).skill.execConfig.command, 'echo hi');
  });
  it('buildAgentPackage 含 systemPrompt/modelId/引用', () => {
    const p = buildAgentPackage({ id: 1, name: 'n', displayName: 'N', systemPrompt: 'sp', modelId: 'm1', allowedPluginIds: [1, 2], version: 3, pricePerCall: 4 } as any);
    assert.equal((p.payload as any).agent.systemPrompt, 'sp');
    assert.deepEqual((p.payload as any).agent.allowedPluginIds, [1, 2]);
    assert.equal(p.version, '3');
  });
  it('sortKeysRecursively 处理数组', () => {
    assert.deepEqual(sortKeysRecursively({ a: [{ x: 1, b: 2 }] }), { a: [{ b: 2, x: 1 }] });
  });
});
