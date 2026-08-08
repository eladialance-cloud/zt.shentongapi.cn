/**
 * OpenClaw 对话记账单元测试（v2：扣费收敛到 llm-proxy）
 * 运行: node -r ts-node/register --test test/unit/chat-accounting.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ChatAccountingService } from '../../src/modules/chat/services/chat-accounting.service';

function makeService(overrides: Partial<any> = {}) {
  const credits = overrides.credits ?? {
    freezeCredits: async () => ({ id: 99 }),
    settleCredits: async () => ({}),
    refundCredits: async () => ({}),
    getAccount: async () => ({ balance: 100 }),
  };
  const workflowRepo = overrides.workflowRepo ?? {
    findOne: async () => null,
  };
  const modelRepo = overrides.modelRepo ?? {
    findOne: async () => ({ modelId: 'deepseek-chat', isActive: true }),
  };
  const userRepo = overrides.userRepo ?? {
    update: async () => ({}),
  };
  const llmProxy = overrides.llmProxy ?? {
    ensureLlmProxyKey: async () => 'sk-shentong-test',
  };
  const svc = new ChatAccountingService(
    credits as any,
    workflowRepo as any,
    modelRepo as any,
    userRepo as any,
    llmProxy as any,
  );
  return { svc, credits, workflowRepo, modelRepo, userRepo, llmProxy };
}

describe('ChatAccountingService.chargeTool', () => {
  it('工作流有定价(20) → 冻结并结算 20', async () => {
    const freezeCalls: any[] = [];
    const settleCalls: any[] = [];
    const { svc } = makeService({
      credits: {
        freezeCredits: async (userId: number, amount: number, source: string, sourceId: string) => {
          freezeCalls.push({ userId, amount, source, sourceId });
          return { id: 99 };
        },
        settleCredits: async (userId: number, id: number, amount: number) => { settleCalls.push({ userId, id, amount }); },
      },
      workflowRepo: { findOne: async () => ({ id: 20, pricePerExecution: 20 }) },
    });
    const r = await svc.chargeTool(1, 20);
    assert.equal(r.charged, 20);
    assert.equal(freezeCalls[0].amount, 20);
    assert.match(freezeCalls[0].sourceId, /^openclaw_tool_/);
    assert.equal(settleCalls[0].id, 99);
  });

  it('工作流定价 0 → 不扣费', async () => {
    const freezeCalls: any[] = [];
    const { svc } = makeService({
      credits: { freezeCredits: async () => { freezeCalls.push(1); }, settleCredits: async () => {} },
      workflowRepo: { findOne: async () => ({ id: 21, pricePerExecution: 0 }) },
    });
    const r = await svc.chargeTool(1, 21);
    assert.equal(r.charged, 0);
    assert.equal(freezeCalls.length, 0);
  });

  it('工作流不存在 → 抛 NotFound', async () => {
    const { svc } = makeService({ workflowRepo: { findOne: async () => null } });
    await assert.rejects(() => svc.chargeTool(1, 999), /工作流不存在/);
  });
});

describe('ChatAccountingService.getOrCreateProxyKey', () => {
  it('返回 llm-proxy 静态 Key（复用 llmProxy.ensureLlmProxyKey）', async () => {
    const { svc, llmProxy } = makeService({});
    const r = await svc.getOrCreateProxyKey(7);
    assert.equal(r.llmProxyKey, 'sk-shentong-test');
  });
});

describe('ChatAccountingService.setPreferredModel', () => {
  it('模型启用时保存为用户默认对话模型', async () => {
    const updates: any[] = [];
    const { svc } = makeService({
      modelRepo: { findOne: async () => ({ modelId: 'deepseek-chat', isActive: true }) },
      userRepo: { update: async (userId: number, data: any) => updates.push({ userId, data }) },
    });
    const r = await svc.setPreferredModel(1, 'deepseek-chat');
    assert.equal(r.modelId, 'deepseek-chat');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.defaultChatModel, 'deepseek-chat');
  });

  it('模型未启用或不存在 → 抛 BadRequest', async () => {
    const { svc } = makeService({
      modelRepo: { findOne: async () => null },
    });
    await assert.rejects(() => svc.setPreferredModel(1, 'not-exist'), /模型不存在或未启用/);
  });

  it('空 modelId → 抛 BadRequest', async () => {
    const { svc } = makeService({});
    await assert.rejects(() => svc.setPreferredModel(1, ''), /模型 ID 不能为空/);
  });
});