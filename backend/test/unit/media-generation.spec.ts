/** media-generation 模块单元测试
 * 运行: node -r ts-node/register --test test/unit/media-generation.spec.ts
 *
 * 覆盖：
 * - GenerationClientService 纯逻辑（占位符替换 / 路径取值 / 默认模板）
 * - MediaGenerationService.charge 定价矩阵计算（图片固定积分 / 视频矩阵 / 会员折扣）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { GenerationClientService, GenerationAdapterConfig } from '../../src/modules/media-generation/generation-client.service';
import { MediaGenerationService } from '../../src/modules/media-generation/media-generation.service';
import { PricingService } from '../../src/modules/credits/services/pricing.service';

// 不触发网络：仅测纯方法
const client = new GenerationClientService();

describe('GenerationClientService.getByPath', () => {
  it('点号路径取值', () => {
    assert.equal(client.getByPath({ data: { task_id: 'abc' } }, 'data.task_id'), 'abc');
  });
  it('数组下标取值 data.task_result.videos[0].url', () => {
    const obj = { data: { task_result: { videos: [{ url: 'https://x/v.mp4' }] } } };
    assert.equal(client.getByPath(obj, 'data.task_result.videos[0].url'), 'https://x/v.mp4');
  });
  it('路径不存在返回 undefined', () => {
    assert.equal(client.getByPath({ a: 1 }, 'b.c'), undefined);
    assert.equal(client.getByPath(null, 'a.b'), undefined);
  });
});

describe('GenerationClientService.buildBody', () => {
  it('整串占位符替换为对应类型（number 不转字符串）', () => {
    const body = client.buildBody(
      { model: '{upstreamModelId}', duration: '{duration}', resolution: '{resolution}' },
      { upstreamModelId: 'wan2.2', duration: 10, resolution: '1080p' },
    );
    assert.deepEqual(body, { model: 'wan2.2', duration: 10, resolution: '1080p' });
  });
  it('内嵌占位符拼接替换', () => {
    const body = client.buildBody({ prompt: 'a {prompt} b' }, { prompt: 'cat' });
    assert.deepEqual(body, { prompt: 'a cat b' });
  });
  it('嵌套对象与数组递归替换', () => {
    const body = client.buildBody(
      { input: { prompt: '{prompt}', params: { duration: '{duration}' } }, tags: ['{prompt}'] },
      { prompt: 'p', duration: 5 },
    );
    assert.deepEqual(body, { input: { prompt: 'p', params: { duration: 5 } }, tags: ['p'] });
  });
  it('无模板返回空对象', () => {
    assert.deepEqual(client.buildBody(undefined, { prompt: 'x' }), {});
  });
});

describe('MediaGenerationService.charge 定价与冻结', () => {
  // 用真实 PricingService（会员折扣）驱动扣费逻辑，避免测试与生产定价实现分叉
  function buildService() {
    const userService = { findById: async () => ({ id: 1, level: 0 }) };
    const pricing = new PricingService({} as any, {} as any, {} as any, {} as any, userService as any);
    const jobRepo: any = {
      find: async () => [],
      findOne: async () => null,
      findAndCount: async () => [[], 0],
      save: async (e: any) => e,
      update: async () => ({ affected: 1 }),
      create: (e: any) => e,
    };
    const modelRepo: any = { find: async () => [], findOne: async () => null };
    const providerRepo: any = { findOne: async () => null };
    const fileRepo: any = { save: async (e: any) => e, create: (e: any) => e };
    const genClient: any = {
      generateImage: async () => ({ b64: 'x' }),
      submitVideo: async () => ({ taskId: 't' }),
      pollVideoTask: async () => ({ status: 'processing' }),
    };
    const credits: any = {
      freezeCredits: async () => ({ id: 777 }),
      settleCredits: async () => undefined,
      refundCredits: async () => undefined,
    };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing,
    );
    return { svc, jobRepo, credits };
  }

  it('图片：未配置单价使用默认 10 积分', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(1, { modelType: 'image', pricePerImage: null, videoPrices: null }, {}, 'src-1');
    assert.equal(res.price, 10);
    assert.ok(res.frozenTxnId);
  });

  it('图片：配置单价 25.5 积分/张 → 四舍五入 26', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(1, { modelType: 'image', pricePerImage: 25.5, videoPrices: null }, {}, 'src-1');
    assert.equal(res.price, 26);
    assert.ok(res.frozenTxnId);
  });

  it('图片：单价 0 为免费模型，跳过冻结（不调用 freezeCredits）', async () => {
    const { svc, credits } = buildService();
    let freezeCalled = false;
    credits.freezeCredits = async () => { freezeCalled = true; return { id: 777 }; };
    const res = await (svc as any).charge(1, { modelType: 'image', pricePerImage: 0, videoPrices: null }, {}, 'src-1');
    assert.equal(res.price, 0);
    assert.equal(res.frozenTxnId, null);
    assert.equal(freezeCalled, false);
  });

  it('视频：矩阵命中 1080p/10s=36', async () => {
    const { svc } = buildService();
    const videoPrices = { '720p': { '5': 10, '10': 18 }, '1080p': { '5': 20, '10': 36 } };
    const res = await (svc as any).charge(1, { modelType: 'video', pricePerImage: null, videoPrices }, { resolution: '1080p', duration: 10 }, 'src-1');
    assert.equal(res.price, 36);
    assert.ok(res.frozenTxnId);
  });

  it('视频：矩阵未配置的规格直接拒绝，不再静默扣默认价', async () => {
    const { svc } = buildService();
    const videoPrices = { '720p': { '5': 10 } };
    await assert.rejects(
      (svc as any).charge(1, { modelType: 'video', pricePerImage: null, videoPrices }, { resolution: '4k', duration: 30 }, 'src-1'),
      (e: any) => e instanceof BadRequestException && /未配置/.test(e.message || ''),
    );
  });

  it('视频：未配置价格矩阵同样拒绝', async () => {
    const { svc } = buildService();
    await assert.rejects(
      (svc as any).charge(1, { modelType: 'video', pricePerImage: null, videoPrices: null }, { resolution: '720p', duration: 5 }, 'src-1'),
      (e: any) => e instanceof BadRequestException,
    );
  });
});

describe('MediaGenerationService 失败退款与启动回收', () => {
  function buildService() {
    const userService = { findById: async () => ({ id: 1, level: 0 }) };
    const pricing = new PricingService({} as any, {} as any, {} as any, {} as any, userService as any);
    const jobRepo: any = {
      find: async () => [],
      findOne: async () => null,
      findAndCount: async () => [[], 0],
      save: async (e: any) => e,
      update: async () => ({ affected: 1 }),
      create: (e: any) => e,
    };
    const modelRepo: any = { find: async () => [], findOne: async () => null };
    const providerRepo: any = { findOne: async () => null };
    const fileRepo: any = { save: async (e: any) => e, create: (e: any) => e };
    const genClient: any = {
      generateImage: async () => ({ b64: 'x' }),
      submitVideo: async () => ({ taskId: 't' }),
      pollVideoTask: async () => ({ status: 'processing' }),
    };
    const credits: any = {
      freezeCredits: async () => ({ id: 777 }),
      settleCredits: async () => undefined,
      refundCredits: async () => undefined,
    };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing,
    );
    return { svc, jobRepo, credits };
  }

  it('视频任务提交失败：job 置为 failed 并退还冻结积分', async () => {
    const { svc, jobRepo, credits } = buildService();
    const saved: any[] = [];
    const refunded: Array<[number, number]> = [];
    jobRepo.findOne = async () => ({ id: 1, userId: 9, status: 'pending', frozenTxnId: 42, creditsCost: 20 });
    jobRepo.save = async (e: any) => { saved.push(e); return e; };
    credits.refundCredits = async (uid: number, tid: number) => { refunded.push([uid, tid]); };
    (svc as any).genClient.submitVideo = async () => { throw new Error('upstream boom'); };
    await (svc as any).runVideoJob(1, { endpoint: 'https://x', apiKey: 'k', adapter: {}, model: 'm', prompt: 'p', duration: 5 });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'failed');
    assert.match(saved[0].error || '', /upstream boom/);
    assert.deepEqual(refunded, [[9, 42]]);
  });

  it('启动回收：pending/processing 孤儿任务退款，免费任务不产生退款', async () => {
    const { svc, jobRepo, credits } = buildService();
    const saved: any[] = [];
    const refunded: Array<[number, number]> = [];
    jobRepo.find = async () => [
      { id: 1, userId: 9, status: 'pending', frozenTxnId: 42, creditsCost: 20 },
      { id: 2, userId: 9, status: 'processing', frozenTxnId: null, creditsCost: 0 },
      { id: 3, userId: 9, status: 'processing', frozenTxnId: 43, creditsCost: 20 },
    ];
    jobRepo.save = async (e: any) => { saved.push(e); return e; };
    credits.refundCredits = async (uid: number, tid: number) => { refunded.push([uid, tid]); };
    await (svc as any).onModuleInit();
    assert.equal(saved.length, 3);
    assert.ok(saved.every((j) => j.status === 'failed'));
    assert.match(saved[0].error || '', /服务重启/);
    assert.deepEqual(refunded, [[9, 42], [9, 43]]);
  });
});

describe('GenerationAdapterConfig 模板解析（文档示例）', () => {
  it('通义万相模板路径映射', () => {
    const adapter: GenerationAdapterConfig = {
      videosPath: '/api/v1/services/aigc/video-generation/video-synthesis',
      taskPath: '/api/v1/services/aigc/video-generation/tasks/{id}',
      extraHeaders: { 'X-DashScope-Async': 'enable' },
      requestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}', parameters: { resolution: '{resolution}', duration: '{duration}', fps: '{fps}' } } },
      taskIdPath: 'output.task_id',
      statusPath: 'output.task_status',
      successValues: ['SUCCEEDED'],
      failedValues: ['FAILED'],
      resultUrlPath: 'output.video_url',
    };
    const body = client.buildBody(adapter.requestTemplate, {
      upstreamModelId: 'wan2.2-t2v-plus',
      prompt: 'cat',
      resolution: '1080p',
      duration: 5,
      fps: 24,
    });
    assert.deepEqual(body, {
      model: 'wan2.2-t2v-plus',
      input: { prompt: 'cat', parameters: { resolution: '1080p', duration: 5, fps: 24 } },
    });
    assert.equal(client.getByPath({ output: { task_id: 't-1' } }, adapter.taskIdPath), 't-1');
    assert.equal(client.getByPath({ output: { video_url: 'https://x.mp4' } }, adapter.resultUrlPath), 'https://x.mp4');
    assert.equal((adapter.taskPath || '').replace('{id}', 't-1'), '/api/v1/services/aigc/video-generation/tasks/t-1');
  });
  it('可灵模板路径映射', () => {
    const adapter: GenerationAdapterConfig = {
      videosPath: '/v1/videos/text2video',
      taskPath: '/v1/videos/text2video/{id}',
      requestTemplate: { model_name: '{upstreamModelId}', prompt: '{prompt}', duration: '{duration}', aspect_ratio: '16:9', mode: 'std' },
      taskIdPath: 'data.task_id',
      statusPath: 'data.task_status',
      successValues: ['succeed'],
      resultUrlPath: 'data.task_result.videos[0].url',
    };
    const body = client.buildBody(adapter.requestTemplate, {
      upstreamModelId: 'kling-v1-6',
      prompt: 'cat',
      duration: 10,
    });
    assert.deepEqual(body, {
      model_name: 'kling-v1-6',
      prompt: 'cat',
      duration: 10,
      aspect_ratio: '16:9',
      mode: 'std',
    });
    const resp = { data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://x/k.mp4' }] } } };
    assert.equal(client.getByPath(resp, adapter.statusPath), 'succeed');
    assert.equal(client.getByPath(resp, adapter.resultUrlPath), 'https://x/k.mp4');
  });
});
