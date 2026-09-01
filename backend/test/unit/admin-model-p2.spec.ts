/** admin-model P2 扩展测试（DTO 校验 / 新字段落库 / 自动归类 / 模板 / 批量）
 * 运行: node -r ts-node/register --test test/unit/admin-model-p2.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { CreateModelDto } from '../../src/modules/admin-model/dto/create-model.dto';
import { UpdateModelDto } from '../../src/modules/admin-model/dto/update-model.dto';
import { CreateProviderDto } from '../../src/modules/admin-model/dto/create-provider.dto';
import { UpdateProviderDto } from '../../src/modules/admin-model/dto/update-provider.dto';
import { ModelEntity } from '../../src/modules/model/entities/model.entity';
import { ErrorCode } from '../../src/common/constants/error.constant';

describe('CreateModelDto 新字段校验', () => {
  it('合法 callMode/pricingMode/scenarioTags/pricePerMinute 通过', async () => {
    const dto = Object.assign(new CreateModelDto(), {
      provider: 'aliyun', modelId: 'm1', displayName: 'M', capabilities: [],
      enabled: true, minUserLevel: 1,
      callMode: 'image', pricingMode: 'per_image', scenarioTags: ['文生图'],
      pricePerMinute: 3, videoPerSecond: { '720P': 2, '1080P': 4 },
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 0);
  });
  it('非法 pricingMode 类型被拒', async () => {
    const dto = Object.assign(new CreateModelDto(), {
      provider: 'a', modelId: 'm', displayName: 'M', capabilities: [],
      enabled: true, minUserLevel: 1, pricingMode: 123 as any,
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 1);
    assert.equal(errs[0].property, 'pricingMode');
  });
});

describe('CreateProviderDto / UpdateProviderDto 余额监控与限流字段校验', () => {
  it('合法新字段通过校验（含空字符串 balanceUrl 关闭监控）', async () => {
    const dto = Object.assign(new CreateProviderDto(), {
      name: 'p', baseUrl: 'https://api.example.com/v1',
      apiStyle: 'openai_compatible', rateLimitPerMinute: 60, concurrencyLimit: 5,
      balanceUrl: '', balanceHeaders: { Authorization: 'Bearer x' },
      balanceExtra: { balancePath: 'data.balance' }, balanceAlertThreshold: 100,
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 0);
  });
  it('更新 DTO 合法值通过校验', async () => {
    const dto = Object.assign(new UpdateProviderDto(), {
      apiStyle: 'dashscope_native', rateLimitPerMinute: 0, concurrencyLimit: 0,
      balanceUrl: 'https://b.example.com/balance', balanceHeaders: { 'x-key': 'v' },
      balanceExtra: { body: { ak: 'k' } }, balanceAlertThreshold: 50,
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 0);
  });
  it('负整数限流/并发被拒', async () => {
    const dto = Object.assign(new CreateProviderDto(), {
      name: 'p', baseUrl: 'https://api.example.com/v1',
      rateLimitPerMinute: -1, concurrencyLimit: -1,
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 2);
    assert.deepEqual(errs.map((e) => e.property).sort(), ['concurrencyLimit', 'rateLimitPerMinute']);
  });
  it('balanceUrl 超长 / 非对象 JSON 字段被拒', async () => {
    const dto = Object.assign(new UpdateProviderDto(), {
      balanceUrl: 'x'.repeat(600),
      balanceHeaders: 'not-json' as any,
      balanceExtra: 123 as any,
    });
    const errs = await validate(dto);
    assert.equal(errs.length, 3);
    assert.ok(errs.some((e) => e.property === 'balanceUrl'));
    assert.ok(errs.some((e) => e.property === 'balanceHeaders'));
    assert.ok(errs.some((e) => e.property === 'balanceExtra'));
  });
  it('负告警阈值被拒', async () => {
    const dto = Object.assign(new UpdateProviderDto(), { balanceAlertThreshold: -0.01 });
    const errs = await validate(dto);
    assert.equal(errs.length, 1);
    assert.equal(errs[0].property, 'balanceAlertThreshold');
  });
});

import { AdminModelService } from '../../src/modules/admin-model/admin-model.service';
import { BusinessException } from '../../src/common/exceptions/business.exception';

function buildAdminService() {
  const modelRepo: any = {
    save: async (e: any) => e,
    findOne: async () => null,
    count: async () => 0,
    update: async () => ({ affected: 1 }),
    createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ orderBy: () => ({ skip: () => ({ take: () => ({ getManyAndCount: async () => [[], 0] }) }) }) }) }) }),
  };
  const providerRepo: any = { findOne: async () => null, save: async (e: any) => e, update: async () => ({ affected: 1 }) };
  const encryption: any = { encryptAes: (s: string) => s, decryptAes: (s: string) => s, maskKey: () => '****' };
  const generationClient: any = { submitVideo: async () => ({ taskId: 't1' }) };
  const pricingSetPatches: any[] = [];
  const pricingRepo: any = {
    createQueryBuilder: () => ({ update: () => ({ set: (patch: any) => { pricingSetPatches.push(patch); return { where: () => ({ execute: async () => ({ affected: 1 }) }) }; } }) }),
    create: (o: any) => o, save: async (e: any) => e, upsert: async () => ({ affected: 1 }),
  };
  const credentialsRepo: any = { create: (o: any) => o, save: async (e: any) => e, upsert: async () => ({ affected: 1 }) };
  const svc = new AdminModelService(modelRepo, providerRepo, pricingRepo, credentialsRepo, encryption, generationClient);
  return { svc, modelRepo, providerRepo, pricingRepo, pricingSetPatches, generationClient };
}

describe('AdminModelService P2 落库与自动归类', () => {
  it('create 落库新字段，callMode 自动归类 modelType/inputTypes/能力', async () => {
    const { svc, modelRepo } = buildAdminService();
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    const dto = Object.assign(new CreateModelDto(), {
      provider: 'aliyun', modelId: 'img-1', displayName: '图像模型', capabilities: [],
      enabled: true, minUserLevel: 0,
      callMode: 'image', pricingMode: 'per_image', scenarioTags: ['文生图'],
      videoPerSecond: undefined, specs: { resolutions: ['720P', '1080P'] },
      iconUrl: 'https://x/icon.png', costPrice: 0.5, remark: '测试', pricePerMinute: 3,
    });
    await svc.create(dto);
    const e = saved[0];
    assert.equal(e.callMode, 'image');
    assert.equal(e.modelType, 'image');
    assert.deepEqual(e.pricing.inputTypes, ['text']);
    assert.ok(e.pricing.advancedCapabilities.includes('prompt_rewrite'));
    assert.deepEqual(e.pricing.scenarioTags, ['文生图']);
    assert.equal(e.pricing.pricingMode, 'per_image');
    assert.deepEqual(e.specs, { resolutions: ['720P', '1080P'] });
    assert.equal(e.iconUrl, 'https://x/icon.png');
    assert.equal(e.pricing.costPrice, 0.5);
    assert.equal(e.remark, '测试');
    assert.equal(e.pricing.pricePerMinute, 3);
  });
  it('未知 callMode 创建被拒', async () => {
    const { svc } = buildAdminService();
    const dto = Object.assign(new CreateModelDto(), {
      provider: 'a', modelId: 'm', displayName: 'M', capabilities: [],
      enabled: true, minUserLevel: 0, callMode: 'not-exist',
    });
    await assert.rejects(() => svc.create(dto), (e: any) => e && /未知调用模式/.test(String(e.message ?? e)));
  });
});

describe('AdminModelService P2 更新路径（callMode 自动归类）', () => {
  it('update 切换 callMode（未传 advancedCapabilities）按新模式默认能力重新归类', async () => {
    const { svc, modelRepo } = buildAdminService();
    const model: any = new ModelEntity();
    model.callMode = 'text_chat';
    model.modelType = 'chat';
    model.inputTypes = ['text'];
    model.advancedCapabilities = ['function_calling'];
    modelRepo.findOne = async () => model;
    const dto = Object.assign(new UpdateModelDto(), { callMode: 'video' });
    await svc.update(1, dto);
    assert.equal(model.callMode, 'video');
    assert.equal(model.modelType, 'video');
    assert.deepEqual(model.pricing.inputTypes, ['text', 'image']);
    assert.deepEqual(model.pricing.advancedCapabilities, [
      'prompt_rewrite', 'multi_shot', 'audio_sync', 'custom_audio',
    ]);
    assert.equal(model.supportsVision, true);
  });

  it('update 同时传 callMode + advancedCapabilities 保留显式能力', async () => {
    const { svc, modelRepo } = buildAdminService();
    const model: any = new ModelEntity();
    model.callMode = 'text_chat';
    model.modelType = 'chat';
    model.inputTypes = ['text'];
    modelRepo.findOne = async () => model;
    const dto = Object.assign(new UpdateModelDto(), {
      callMode: 'image',
      advancedCapabilities: ['function_calling', 'streaming'],
    });
    await svc.update(1, dto);
    assert.equal(model.callMode, 'image');
    assert.equal(model.modelType, 'image');
    assert.deepEqual(model.pricing.inputTypes, ['text']);
    assert.deepEqual(model.pricing.advancedCapabilities, ['function_calling', 'streaming']);
    assert.equal(model.supportsFunctions, true);
  });

  it('update 未知 callMode 被拒', async () => {
    const { svc, modelRepo } = buildAdminService();
    const model: any = new ModelEntity();
    modelRepo.findOne = async () => model;
    const dto = Object.assign(new UpdateModelDto(), { callMode: 'not-exist' });
    await assert.rejects(
      () => svc.update(1, dto),
      (e: any) => e && /未知调用模式/.test(String(e.message ?? e)),
    );
  });
});

describe('AdminModelService P2 视图契约（toAdminModelItem）', () => {
  it('9 个新字段完整映射', async () => {
    const { svc, modelRepo } = buildAdminService();
    const model: any = new ModelEntity();
    model.id = 1;
    model.provider = 'aliyun';
    model.modelId = 'img-1';
    model.upstreamModelId = 'img-1';
    model.modelType = 'image';
    model.name = '图像模型';
    model.isActive = true;
    model.callMode = 'image';
    model.specs = { resolutions: ['720P', '1080P'] };
    model.iconUrl = 'https://x/icon.png';
    model.remark = '测试';
    model.pricing = {
      inputTypes: ['text'],
      advancedCapabilities: ['prompt_rewrite'],
      pricePer1kInput: 0,
      pricePer1kOutput: 0,
      minUserLevel: 0,
      scenarioTags: ['文生图'],
      pricingMode: 'per_image',
      videoPerSecond: { '720P': 2, '1080P': 4 },
      costPrice: 0.5,
      pricePerMinute: 3,
    };
    modelRepo.findOne = async () => model;
    const item: any = await svc.detail(1);
    assert.equal(item.callMode, 'image');
    assert.deepEqual(item.scenarioTags, ['文生图']);
    assert.equal(item.pricingMode, 'per_image');
    assert.deepEqual(item.videoPerSecond, { '720P': 2, '1080P': 4 });
    assert.deepEqual(item.specs, { resolutions: ['720P', '1080P'] });
    assert.equal(item.iconUrl, 'https://x/icon.png');
    assert.equal(item.costPrice, 0.5);
    assert.equal(item.remark, '测试');
    assert.equal(item.pricePerMinute, 3);
  });

  it('字段缺省回退 + callMode 按 modelType 回填', async () => {
    const { svc, modelRepo } = buildAdminService();
    const model: any = new ModelEntity();
    model.id = 2;
    model.provider = 'aliyun';
    model.modelId = 'chat-1';
    model.modelType = 'chat';
    model.name = '对话模型';
    model.pricePer1kInput = 0;
    model.pricePer1kOutput = 0;
    model.minUserLevel = 0;
    model.isActive = true;
    modelRepo.findOne = async () => model;
    const item: any = await svc.detail(2);
    assert.equal(item.callMode, 'text_chat'); // callModeFromModelType('chat')
    assert.deepEqual(item.scenarioTags, []);
    assert.equal(item.pricingMode, null);
    assert.equal(item.videoPerSecond, null);
    assert.equal(item.specs, null);
    assert.equal(item.iconUrl, null);
    assert.equal(item.costPrice, null);
    assert.equal(item.remark, null);
    assert.equal(item.pricePerMinute, null);
  });
});

describe('callModesMeta 动态表单元数据', () => {
  it('返回 14 模式 + schema + 场景标签 + 能力标签', async () => {
    const { svc } = buildAdminService();
    const meta = await svc.callModesMeta();
    assert.equal(meta.callModes.length, 14);
    assert.equal(new Set(meta.callModes.map((m) => m.key)).size, 14);
    for (const mode of meta.callModes) {
      for (const field of mode.specFields) {
        assert.ok(meta.specFieldSchemas[field], `specFields 缺失 schema: ${field}`);
      }
      for (const cap of mode.advancedCaps) {
        assert.ok(meta.advancedCapLabels[cap], `advancedCaps 缺失标签: ${cap}`);
      }
    }
    assert.ok(meta.specFieldSchemas.contextWindow);
    assert.ok(meta.advancedCapLabels.function_calling);
    assert.ok(meta.scenarioTags.includes('文生图'));
    assert.equal(new Set(meta.scenarioTags).size, meta.scenarioTags.length);
  });
});

describe('模板库接口', () => {
  it('templateList 返回 39 条模板', async () => {
    const { svc } = buildAdminService();
    const list = await svc.templateList();
    assert.equal(list.length, 39);
    assert.ok(list.some((t: any) => t.key === 'qwen-plus'));
    assert.ok(list.some((t: any) => t.key === 'wanx-sketch'), '缺少 wanx-sketch 模板');
  });
  it('createFromTemplate 按模板落库并默认下架', async () => {
    const { svc, modelRepo } = buildAdminService();
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    const item = await svc.createFromTemplate({ templateKey: 'qwen-ocr', modelId: 'ocr-9', providerId: 7 });
    assert.equal(saved[0].callMode, 'ocr');
    assert.equal(saved[0].modelType, 'vision');
    assert.deepEqual(saved[0].specs, { fileFormats: ['jpg', 'png', 'pdf'], maxPages: 10 });
    assert.equal(saved[0].pricing.pricePerImage, 2);
    assert.equal(saved[0].isActive, false);
    assert.equal(item.callMode, 'ocr');
  });
  it('createFromTemplate 映射视频模板参考价/生成参数并支持覆盖', async () => {
    const { svc, modelRepo } = buildAdminService();
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    const item = await svc.createFromTemplate({
      templateKey: 'wan2.2-t2v',
      modelId: 't2v-1',
      displayName: '自定义视频模型',
    });
    assert.deepEqual(saved[0].pricing.videoPerSecond, { '720P': 2, '1080P': 4 });
    assert.deepEqual(saved[0].pricing.generationParams, {
      video_resolutions: ['720P', '1080P'],
      video_durations: [5, 10, 15],
      video_fps: [24],
    });
    assert.equal(saved[0].provider, 'global');
    assert.equal(saved[0].providerId, undefined);
    assert.equal(saved[0].name, '自定义视频模型');
    assert.equal(saved[0].isActive, false);
    assert.equal(item.displayName, '自定义视频模型');
    const tpl: any = (await svc.templateList()).find((t: any) => t.key === 'wan2.2-t2v');
    assert.notStrictEqual(saved[0].pricing.videoPerSecond, tpl.referencePrice.videoPerSecond);
    assert.notStrictEqual(saved[0].pricing.generationParams, tpl.generationParams);
  });
  it('未知模板创建被拒', async () => {
    const { svc } = buildAdminService();
    await assert.rejects(
      () => svc.createFromTemplate({ templateKey: 'nope' } as any),
      (e: any) => e && /模板不存在|NOT_FOUND/.test(String(e.message ?? e)),
    );
  });
});

describe('批量操作', () => {
  it('batchEnable 批量上架/下架', async () => {
    const { svc, modelRepo } = buildAdminService();
    const updated: Array<[any, any]> = [];
    modelRepo.update = async (where: any, patch: any) => { updated.push([where, patch]); return { affected: 2 }; };
    const r = await svc.batchEnable({ ids: [1, 2], enabled: false });
    assert.equal(r.updated, 2);
    assert.equal((updated[0][0].id as any).constructor.name, 'FindOperator');
    assert.deepEqual((updated[0][0].id as any)._value, [1, 2]);
    assert.equal(updated[0][1].isActive, false);
  });
  it('batchUpdatePrice 按 DTO 字段批量改价', async () => {
    const { svc, pricingSetPatches } = buildAdminService();
    const r = await svc.batchUpdatePrice({ ids: [3], pricePerMinute: 5, videoPerSecond: { '720P': 2 } });
    assert.equal(r.updated, 1);
    assert.equal(pricingSetPatches[0].pricePerMinute, 5);
    assert.deepEqual(pricingSetPatches[0].videoPerSecond, { '720P': 2 });
  });
  it('importModelsJson 批量导入并返回数量', async () => {
    const { svc, modelRepo } = buildAdminService();
    let saves = 0;
    modelRepo.save = async (e: any) => { saves++; return e; };
    const r = await svc.importModelsJson({ items: [
      { modelId: 'a', displayName: 'A', callMode: 'text_chat', enabled: true, minUserLevel: 0, provider: 'x' },
      { modelId: 'b', displayName: 'B', callMode: 'image', enabled: true, minUserLevel: 0, provider: 'x' },
    ] });
    assert.equal(r.imported, 2);
    assert.equal(saves, 2);
  });
});

describe('批量操作（质量补强）', () => {
  it('exportModels 导出筛选条件下全部模型（不分页）', async () => {
    const { svc, modelRepo } = buildAdminService();
    const models: any[] = [
      { id: 1, provider: 'aliyun', modelId: 'm1', name: '模型1', modelType: 'chat', isActive: true, pricing: { pricePer1kInput: 0, pricePer1kOutput: 0, minUserLevel: 0 } },
      { id: 2, provider: 'aliyun', modelId: 'm2', name: '模型2', modelType: 'image', isActive: true, callMode: 'image', pricing: { pricePer1kInput: 0, pricePer1kOutput: 0, minUserLevel: 0, videoPerSecond: { '720P': 2 } } },
    ];
    let getManyCalled = false;
    const qbMock: any = {
      andWhere: () => { throw new Error('无筛选时不应调用 andWhere'); },
      leftJoinAndSelect: () => qbMock,
      orderBy: () => qbMock,
      addOrderBy: () => qbMock,
      getMany: async () => { getManyCalled = true; return models; },
    };
    modelRepo.createQueryBuilder = () => qbMock;
    const out: any[] = await svc.exportModels({});
    assert.equal(getManyCalled, true);
    assert.equal(out.length, 2);
    assert.equal(out[0].modelId, 'm1');
    assert.equal(out[0].displayName, '模型1');
    assert.deepEqual(out[1].videoPerSecond, { '720P': 2 });
  });

  it('importModelsJson 已存在按 modelId 合并更新（缺省字段保留）+ videoPrices 透传', async () => {
    const { svc, modelRepo } = buildAdminService();
    const existing: any = new ModelEntity();
    existing.id = 5;
    existing.provider = 'aliyun';
    existing.modelId = 'm1';
    existing.upstreamModelId = 'm1';
    existing.name = '旧名字';
    existing.modelType = 'chat';
    existing.isActive = true;
    existing.callMode = 'text_chat';
    existing.pricing = {
      inputTypes: ['text'],
      advancedCapabilities: [],
      pricePer1kInput: 99,
      pricePer1kOutput: 88,
      minUserLevel: 0,
    };
    let saved: any = null;
    modelRepo.findOne = async () => existing;
    modelRepo.save = async (e: any) => { saved = e; return e; };
    const r = await svc.importModelsJson({ items: [
      { provider: 'aliyun', modelId: 'm1', displayName: '新名字', videoPerSecond: { '720P': 3 }, videoPrices: { '720P': { '5': 10 } } },
    ] });
    assert.equal(r.imported, 0);
    assert.equal(r.updated, 1);
    assert.equal(r.errors.length, 0);
    assert.equal(saved.isActive, true);
    assert.equal(saved.pricing.pricePer1kInput, 99);
    assert.equal(saved.pricing.pricePer1kOutput, 88);
    assert.equal(saved.name, '新名字');
    assert.deepEqual(saved.pricing.videoPerSecond, { '720P': 3 });
    assert.deepEqual(saved.pricing.videoPrices, { '720P': { '5': 10 } });
  });

  it('importModelsJson 缺 provider 收集到 errors，其余行继续导入', async () => {
    const { svc, modelRepo } = buildAdminService();
    let saves = 0;
    modelRepo.save = async (e: any) => { saves++; return e; };
    const r = await svc.importModelsJson({ items: [
      { provider: 'aliyun', modelId: 'ok', displayName: 'OK', callMode: 'text_chat', enabled: true, minUserLevel: 0 },
      { modelId: 'bad', displayName: 'BAD', callMode: 'text_chat', enabled: true, minUserLevel: 0 },
    ] });
    assert.equal(r.imported, 1);
    assert.equal(r.updated, 0);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].index, 1);
    assert.ok(/provider/.test(r.errors[0].error));
    assert.equal(saves, 1);
  });

  it('batchEnable 空 ids 被拒', async () => {
    const { svc } = buildAdminService();
    await assert.rejects(
      () => svc.batchEnable({ ids: [], enabled: true } as any),
      (e: any) => e && /请至少选择一个模型/.test(String(e.message ?? e)),
    );
  });

  it('batchUpdatePrice 空 ids 被拒', async () => {
    const { svc } = buildAdminService();
    await assert.rejects(
      () => svc.batchUpdatePrice({ ids: [] } as any),
      (e: any) => e && /请至少选择一个模型/.test(String(e.message ?? e)),
    );
  });
});
describe('按 callMode 的测试调用', () => {
  it('image 模式走 images/generations，返回成功并更新连接状态', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, providerId: 1, callMode: 'image', modelType: 'image', modelId: 'img-1', upstreamModelId: 'img-1', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1' });
    let called: any = null;
    (svc as any).encryption.decryptAes = () => 'sk-test';
    (svc as any).callUpstreamRaw = async (url: string, key: string, body: any) => { called = { url, key, body }; return { data: [{ url: 'https://x/1.png' }] }; };
    const r = await svc.test(1, { input: '一只猫' });
    assert.equal(r.success, true);
    assert.ok(called.url.endsWith('/images/generations'));
    assert.equal(called.body.prompt, '一只猫');
  });
  it('未知 callMode 报错', async () => {
    const { svc, modelRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, callMode: 'nope', modelId: 'm', isActive: true });
    await assert.rejects(() => svc.test(1, { input: 'x' }), (e: any) => e && /未知调用模式/.test(String(e.message ?? e)));
  });
  it('video 模式走 GenerationClientService.submitVideo 并更新连接状态', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, providerId: 1, callMode: 'video', modelType: 'video', modelId: 'v-1', upstreamModelId: 'v-1', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1', config: {} });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let submitCfg: any = null;
    generationClient.submitVideo = async (cfg: any) => { submitCfg = cfg; return { taskId: 't1' }; };
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    const r = await svc.test(1, { input: '一只猫' });
    assert.equal(r.success, true);
    assert.equal((r.response as any).taskId, 't1');
    assert.equal(submitCfg.model, 'v-1');
    assert.equal(submitCfg.prompt, '一只猫');
    assert.equal(submitCfg.duration, 5);
    assert.equal(saved[0].connectionStatus, 'connected');
  });
  it('video_edit 模式同样走 submitVideo 异步提交', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 2, providerId: 1, callMode: 'video_edit', modelType: 'video', modelId: 've-1', upstreamModelId: 've-1', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1', config: {} });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let called = false;
    generationClient.submitVideo = async () => { called = true; return { taskId: 't2' }; };
    const r = await svc.test(2, { input: '剪辑' });
    assert.equal(called, true);
    assert.equal((r.response as any).taskId, 't2');
  });
  it('realtime 模式提示暂不支持测试', async () => {
    const { svc, modelRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, callMode: 'realtime', modelId: 'rt-1', isActive: true });
    await assert.rejects(() => svc.test(1, { input: 'x' }), (e: any) => e && /该模式暂不支持测试/.test(String(e.message ?? e)));
  });
  it('缺少供应商凭据时拒绝测试', async () => {
    const { svc, modelRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, callMode: 'text_chat', modelId: 'm', isActive: true });
    await assert.rejects(() => svc.test(1, { input: 'x' }), (e: any) => e && /模型未关联供应商凭据/.test(String(e.message ?? e)));
  });
  it('上游调用失败时标记 failed 并映射 THIRD_PARTY_ERROR', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, providerId: 1, callMode: 'text_chat', modelType: 'chat', modelId: 'm', upstreamModelId: 'm', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1' });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    (svc as any).callUpstreamRaw = async () => { throw new Error('boom'); };
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    await assert.rejects(
      () => svc.test(1, { input: 'x' }),
      (e: any) => e && /模型测试失败/.test(String(e.message ?? e)) && (e as any).code === 1106,
    );
    assert.equal(saved[0].connectionStatus, 'failed');
  });
  it('text_chat 模式按定义构建 body 且不报未知调用模式', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, providerId: 1, callMode: 'text_chat', modelType: 'chat', modelId: 'm', upstreamModelId: 'm', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1' });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let called: any = null;
    (svc as any).callUpstreamRaw = async (url: string, key: string, body: any) => { called = { url, key, body }; return { choices: [{ message: { content: 'hi' } }] }; };
    const r = await svc.test(1, { input: 'hello' });
    assert.equal(r.success, true);
    assert.ok(called.url.endsWith('/chat/completions'));
    assert.equal(called.body.model, 'm');
    assert.equal(called.body.messages[0].content, 'hello');
    assert.equal(called.body.max_tokens, 50);
    assert.equal(r.response, 'hi');
  });
  it('tts 非 JSON 响应按原始文本成功返回', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({ id: 1, providerId: 1, callMode: 'tts', modelType: 'tts', modelId: 't-1', upstreamModelId: 't-1', isActive: true });
    providerRepo.findOne = async () => ({ apiKey: 'enc-key', baseUrl: 'https://api.example.com/v1' });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    (svc as any).callUpstreamRaw = async () => '<raw-audio-bytes>';
    const r = await svc.test(1, { input: '你好' });
    assert.equal(r.success, true);
    assert.ok(String(r.response).includes('<raw-audio-bytes>'));
  });
});
describe('AdminModelService 余额监控（checkProviderBalance）', () => {
  function stubFetch(impl: any) {
    const orig = (globalThis as any).fetch;
    (globalThis as any).fetch = impl;
    return () => { (globalThis as any).fetch = orig; };
  }

  it('嵌套路径取余额成功：落库 + 低于阈值告警并输出日志', async () => {
    const { svc, providerRepo } = buildAdminService();
    const provider: any = {
      id: 7,
      balanceUrl: 'https://b.example.com/balance',
      balanceExtra: { balancePath: 'data.balance', body: { ak: 'x' } },
      balanceAlertThreshold: 10,
      lastBalance: null,
      balanceCheckedAt: null,
      apiKey: 'enc-key',
    };
    providerRepo.findOne = async () => provider;
    const saved: any[] = [];
    providerRepo.save = async (e: any) => { saved.push(e); return e; };
    const warns: string[] = [];
    (svc as any).logger = { warn: (m: string) => warns.push(String(m)) };
    const restore = stubFetch(async () => ({ ok: true, json: async () => ({ data: { balance: 8.5 } }) }));
    try {
      const r = await svc.checkProviderBalance(7);
      assert.equal(r.balance, 8.5);
      assert.equal(r.alert, true); // 8.5 < threshold 10 -> 告警
      assert.equal(r.threshold, 10);
      assert.equal(saved[0].lastBalance, 8.5);
      assert.ok(saved[0].balanceCheckedAt instanceof Date);
      assert.ok(warns.some((m) => m.includes('供应商余额不足') && m.includes('provider=7') && m.includes('balance=8.5') && m.includes('threshold=10')));
    } finally {
      restore();
    }
  });

  it('达到阈值不告警（alert=false）', async () => {
    const { svc, providerRepo } = buildAdminService();
    const provider: any = {
      id: 8,
      balanceUrl: 'https://b.example.com/balance',
      balanceAlertThreshold: 10,
    };
    providerRepo.findOne = async () => provider;
    const warns: string[] = [];
    (svc as any).logger = { warn: (m: string) => warns.push(String(m)) };
    const restore = stubFetch(async () => ({ ok: true, json: async () => ({ balance: 10 }) }));
    try {
      const r = await svc.checkProviderBalance(8);
      assert.equal(r.balance, 10);
      assert.equal(r.alert, false);
      assert.equal(warns.length, 0);
    } finally {
      restore();
    }
  });

  it('余额为 null 拒绝解析（THIRD_PARTY_ERROR）且不落库', async () => {
    const { svc, providerRepo } = buildAdminService();
    const provider: any = {
      id: 9,
      balanceUrl: 'https://b.example.com/balance',
      lastBalance: 100,
    };
    providerRepo.findOne = async () => provider;
    let saved = false;
    providerRepo.save = async () => { saved = true; };
    const restore = stubFetch(async () => ({ ok: true, json: async () => ({ balance: null }) }));
    try {
      await assert.rejects(
        () => svc.checkProviderBalance(9),
        (e: any) => e && (e as any).code === ErrorCode.THIRD_PARTY_ERROR && /无法解析/.test(String(e.message ?? e)),
      );
      assert.equal(provider.lastBalance, 100);
      assert.equal(saved, false);
    } finally {
      restore();
    }
  });

  it('fetch 网络错误映射 THIRD_PARTY_ERROR', async () => {
    const { svc, providerRepo } = buildAdminService();
    const provider: any = { id: 10, balanceUrl: 'https://b.example.com/balance' };
    providerRepo.findOne = async () => provider;
    const restore = stubFetch(async () => { throw new Error('network down'); });
    try {
      await assert.rejects(
        () => svc.checkProviderBalance(10),
        (e: any) => e && (e as any).code === ErrorCode.THIRD_PARTY_ERROR && /余额接口调用失败/.test(String(e.message ?? e)),
      );
    } finally {
      restore();
    }
  });
});

describe('AdminModelService 重复添加模型去重保护', () => {
  function buildService(overrides?: { modelRepo?: any; providerRepo?: any }) {
    const modelRepo: any = {
      findOne: async () => null,
      save: async (e: any) => ({ ...e, id: 99 }),
      count: async () => 1,
      ...(overrides?.modelRepo ?? {}),
    };
    const providerRepo: any = {
      update: async () => ({ affected: 1 }),
      ...(overrides?.providerRepo ?? {}),
    };
    const encryption: any = { encryptAes: (s: string) => 'enc:' + s };
    const generationClient: any = {};
    const pricingSetPatches: any[] = [];
  const pricingRepo: any = {
    createQueryBuilder: () => ({ update: () => ({ set: (patch: any) => { pricingSetPatches.push(patch); return { where: () => ({ execute: async () => ({ affected: 1 }) }) }; } }) }),
    create: (o: any) => o, save: async (e: any) => e, upsert: async () => ({ affected: 1 }),
  };
    const credentialsRepo: any = { create: (o: any) => o, save: async (e: any) => e, upsert: async () => ({ affected: 1 }) };
    return new AdminModelService(modelRepo, providerRepo, pricingRepo, credentialsRepo, encryption, generationClient);
  }

  const baseDto: any = {
    provider: 'qwen', displayName: 'M', capabilities: [], enabled: true, minUserLevel: 1,
  };

  it('create 时 modelId 已存在 -> 友好业务异常而非 500', async () => {
    const svc = buildService({
      modelRepo: { findOne: async () => ({ modelId: 'qwen-image-3.0-pro' }) },
    });
    await assert.rejects(
      () => svc.create({ ...baseDto, modelId: 'qwen-image-3.0-pro' }),
      (err: any) =>
        err instanceof BusinessException &&
        err.code === ErrorCode.VALIDATION_FAILED &&
        String((err.getResponse() as any).message).includes('已存在'),
    );
  });

  it('create 时数据库唯一索引冲突(errno=1062) -> 友好业务异常', async () => {
    const dupErr: any = new Error('Duplicate entry');
    dupErr.errno = 1062;
    dupErr.code = 'ER_DUP_ENTRY';
    dupErr.driverError = { errno: 1062 };
    const svc = buildService({ modelRepo: { save: async () => { throw dupErr; } } });
    await assert.rejects(
      () => svc.create({ ...baseDto, modelId: 'new-model' }),
      (err: any) =>
        err instanceof BusinessException &&
        String((err.getResponse() as any).message).includes('已存在'),
    );
  });

  it('create 正常路径保存成功并返回模型项', async () => {
    const svc = buildService();
    const res = await svc.create({
      ...baseDto, modelId: 'brand-new', inputPricePerToken: 2, outputPricePerToken: 8,
    });
    assert.equal(res.modelId, 'brand-new');
  });
});

describe('按 callMode 的测试调用 - 存量供应商模板兜底', () => {
  it('image 模式：供应商存旧图片端点时自动用最新厂商模板（不再 404）', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 1, providerId: 1, callMode: 'image', modelType: 'image',
      modelId: 'qwen-image-3.0-pro', upstreamModelId: 'wanx2.1-t2i-turbo', isActive: true,
    });
    providerRepo.findOne = async () => ({
      apiKey: 'enc-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: {
        vendorKey: 'aliyun-dashscope',
        generation: { imagesPath: 'https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations' },
      },
    });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let genCfg: any = null;
    generationClient.generateImage = async (cfg: any) => { genCfg = cfg; return { url: 'https://x/1.png' }; };
    const saved: any[] = [];
    modelRepo.save = async (e: any) => { saved.push(e); return e; };
    const r = await svc.test(1, { input: '一只猫' });
    assert.equal(r.success, true);
    assert.equal(
      genCfg.adapter.imagesPath,
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation',
    );
    assert.equal(genCfg.model, 'wanx2.1-t2i-turbo');
    assert.equal(saved[0].connectionStatus, 'connected');
  });
});

describe('按 callMode 的测试调用 - 图像编辑参考图', () => {
  it('image_edit 未传参考图 -> 友好提示且不调用上游', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 9, providerId: 1, callMode: 'image_edit', modelType: 'image_edit',
      modelId: 'sketch', upstreamModelId: 'wanx-sketch', isActive: true,
    });
    providerRepo.findOne = async () => ({
      apiKey: 'enc-key', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: { vendorKey: 'aliyun-dashscope', generation: {} },
    });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let called = false;
    generationClient.generateImage = async () => { called = true; return { url: 'x' }; };
    await assert.rejects(
      () => svc.test(9, { input: '上色' }),
      (err: any) => err instanceof BusinessException && String((err.getResponse() as any).message).includes('参考图'),
    );
    assert.equal(called, false, '不应调用上游');
  });

  it('image_edit 传公网参考图 URL -> generateImage 收到 inputImages 并成功', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 10, providerId: 1, callMode: 'image_edit', modelType: 'image_edit',
      modelId: 'sketch', upstreamModelId: 'wanx-sketch', isActive: true,
    });
    providerRepo.findOne = async () => ({
      apiKey: 'enc-key', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: { vendorKey: 'aliyun-dashscope', generation: {} },
    });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    let genCfg: any = null;
    generationClient.generateImage = async (cfg: any) => { genCfg = cfg; return { url: 'https://x/1.png' }; };
    modelRepo.save = async (e: any) => e;
    const r = await svc.test(10, { input: '上色', inputImages: ['https://cdn.example.com/sketch.png'] });
    assert.equal(r.success, true);
    assert.deepEqual(genCfg.inputImages, ['https://cdn.example.com/sketch.png']);
  });

  it('image_edit 传 data URI 参考图 -> 被拒并提示公网 URL', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 11, providerId: 1, callMode: 'image_edit', modelType: 'image_edit',
      modelId: 'sketch', upstreamModelId: 'wanx-sketch', isActive: true,
    });
    providerRepo.findOne = async () => ({
      apiKey: 'enc-key', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: { vendorKey: 'aliyun-dashscope', generation: {} },
    });
    (svc as any).encryption.decryptAes = () => 'sk-test';
    await assert.rejects(
      () => svc.test(11, { input: '上色', inputImages: ['data:image/png;base64,aGVsbG8='] }),
      (err: any) => err instanceof BusinessException && String((err.getResponse() as any).message).includes('http'),
    );
  });
});
