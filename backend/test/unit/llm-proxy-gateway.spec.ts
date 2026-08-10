/** llm-proxy 多模态网关单元测试（分类路由 / 模型解析 / 按次预扣）
 * 运行: node -r ts-node/register --test test/unit/llm-proxy-gateway.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { LlmProxyService } from '../../src/modules/chat/services/llm-proxy.service';

function buildService() {
  const modelRepo: any = {
    find: async () => [],
    findOne: async () => null,
  };
  const svc = new LlmProxyService(
    {} as any,
    modelRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
    {
      freezeCredits: async () => ({ id: 777 }),
      settleCredits: async () => undefined,
      refundCredits: async () => undefined,
    } as any,
    {} as any,
  );
  return { svc, modelRepo };
}

describe('LlmProxyService.typeMatches 分类匹配', () => {
  it('image 匹配 image 与 image_edit', () => {
    const { svc } = buildService();
    assert.equal((svc as any).typeMatches('image', 'image'), true);
    assert.equal((svc as any).typeMatches('image_edit', 'image'), true);
    assert.equal((svc as any).typeMatches('video', 'image'), false);
  });
  it('video / tts 严格匹配', () => {
    const { svc } = buildService();
    assert.equal((svc as any).typeMatches('video', 'video'), true);
    assert.equal((svc as any).typeMatches('tts', 'tts'), true);
    assert.equal((svc as any).typeMatches('chat', 'tts'), false);
  });
});

describe('LlmProxyService.resolveMediaModel 模型解析', () => {
  it('显式 custom/<id> 命中启用模型', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'tts-1', modelType: 'tts', isActive: true });
    const m = await (svc as any).resolveMediaModel('tts', 'custom/tts-1');
    assert.equal(m.modelId, 'tts-1');
  });
  it('显式 image/<id> 前缀同样命中', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'img-1', modelType: 'image', isActive: true });
    const m = await (svc as any).resolveMediaModel('image', 'image/img-1');
    assert.equal(m.modelId, 'img-1');
  });
  it('未指定时取该类型 sortOrder 最小模型', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.find = async () => [
      { modelId: 'a', modelType: 'chat', sortOrder: 0 },
      { modelId: 'c', modelType: 'image_edit', sortOrder: 1 },
      { modelId: 'b', modelType: 'image', sortOrder: 5 },
    ];
    const m = await (svc as any).resolveMediaModel('image');
    assert.equal(m.modelId, 'c');
  });
  it('显式指定但类型不匹配报错', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'x', modelType: 'chat', isActive: true });
    await assert.rejects(
      (svc as any).resolveMediaModel('tts', 'x'),
      (e: any) => e instanceof BadRequestException,
    );
  });
  it('该类型无可用模型报错', async () => {
    const { svc } = buildService();
    await assert.rejects(
      (svc as any).resolveMediaModel('video'),
      (e: any) => e instanceof BadRequestException,
    );
  });
});

describe('LlmProxyService.freezePerCall 按次预扣', () => {
  it('0 价为免费，不冻结', async () => {
    const { svc } = buildService();
    let freezeCalled = false;
    (svc as any).creditsService.freezeCredits = async () => { freezeCalled = true; return { id: 1 }; };
    const r = await (svc as any).freezePerCall(1, 0, 'src');
    assert.equal(r.price, 0);
    assert.equal(r.frozenTxnId, null);
    assert.equal(freezeCalled, false);
  });
  it('正价按会员折扣后冻结', async () => {
    const { svc } = buildService();
    (svc as any).pricingService = {
      getUserLevel: async () => 1,
      applyDiscount: (p: number) => Math.round(p * 0.9),
    };
    const r = await (svc as any).freezePerCall(1, 10, 'src');
    assert.equal(r.price, 9);
    assert.equal(r.frozenTxnId, 777);
  });
});