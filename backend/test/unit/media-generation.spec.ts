/** media-generation 模块单元测试
 * 运行: node -r ts-node/register --test test/unit/media-generation.spec.ts
 *
 * 覆盖：
 * - GenerationClientService 纯逻辑（占位符替换 / 路径取值 / 默认模板）
 * - MediaGenerationService.charge 定价矩阵计算（图片固定积分 / 视频矩阵 / 会员折扣）
 */
import * as fs from 'fs';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { GenerationClientService, GenerationAdapterConfig, buildMediaGenerationAdapter, mergeGenerationAdapter } from '../../src/modules/media-generation/generation-client.service';
import { MediaGenerationService } from '../../src/modules/media-generation/media-generation.service';
import { PricingService } from '../../src/modules/credits/services/pricing.service';
import { MediaJobEntity } from '../../src/modules/media-generation/entities/media-job.entity';

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
  it('数组占位符注入 input.media（图生视频首帧图）', () => {
    const body = client.buildBody(
      { model: '{upstreamModelId}', input: { prompt: '{prompt}', media: '{media}' }, parameters: { resolution: '{resolution}' } },
      { upstreamModelId: 'happyhorse-1.1-i2v', prompt: 'cat run', resolution: '720P', media: [{ type: 'first_frame', url: 'https://cdn/x.png' }] },
    );
    assert.deepEqual(body, {
      model: 'happyhorse-1.1-i2v',
      input: { prompt: 'cat run', media: [{ type: 'first_frame', url: 'https://cdn/x.png' }] },
      parameters: { resolution: '720P' },
    });
  });
  it('curl 解析出的 i2v 模板用 {imageUrl0} 占位（图生视频首帧图）', () => {
    const body = client.buildBody(
      {
        model: '{upstreamModelId}',
        input: { prompt: '{prompt}', media: [{ type: 'first_frame', url: '{imageUrl0}' }] },
        parameters: { resolution: '{resolution}', duration: '{duration}' },
      },
      { upstreamModelId: 'happyhorse-1.1-i2v', prompt: 'cat', resolution: '720P', duration: 5, imageUrl0: 'https://cdn/x.png' },
    );
    assert.deepEqual(body, {
      model: 'happyhorse-1.1-i2v',
      input: { prompt: 'cat', media: [{ type: 'first_frame', url: 'https://cdn/x.png' }] },
      parameters: { resolution: '720P', duration: 5 },
    });
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
    const ossUpload: any = { upload: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing, ossUpload,
    );
    return { svc, jobRepo, credits };
  }

  it('图片：未配置单价使用默认 10 积分', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(1, { modelType: 'image', pricing: { pricePerImage: null, videoPrices: null } }, {}, 'src-1');
    assert.equal(res.price, 10);
    assert.ok(res.frozenTxnId);
  });

  it('图片：配置单价 25.5 积分/张 → 四舍五入 26', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(1, { modelType: 'image', pricing: { pricePerImage: 25.5, videoPrices: null } }, {}, 'src-1');
    assert.equal(res.price, 26);
    assert.ok(res.frozenTxnId);
  });

  it('图片：单价 0 为免费模型，跳过冻结（不调用 freezeCredits）', async () => {
    const { svc, credits } = buildService();
    let freezeCalled = false;
    credits.freezeCredits = async () => { freezeCalled = true; return { id: 777 }; };
    const res = await (svc as any).charge(1, { modelType: 'image', pricing: { pricePerImage: 0, videoPrices: null } }, {}, 'src-1');
    assert.equal(res.price, 0);
    assert.equal(res.frozenTxnId, null);
    assert.equal(freezeCalled, false);
  });

  it('视频：per_second 档位归一化（配置 720P/1080P，用户传 720p 也能命中）', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(1, { modelType: 'video', pricing: { pricingMode: 'per_second', videoPerSecond: { '720P': 2, '1080P': 4 }, videoPrices: null } }, { resolution: '720p', duration: 10 }, 'src-1');
    assert.equal(res.price, 20);
    assert.ok(res.frozenTxnId);
  });

  it('视频：per_second 矩阵未配置的规格直接拒绝', async () => {
    const { svc } = buildService();
    await assert.rejects(
      (svc as any).charge(1, { modelType: 'video', pricing: { pricingMode: 'per_second', videoPerSecond: { '720P': 2 }, videoPrices: null } }, { resolution: '4k', duration: 10 }, 'src-1'),
      (e: any) => e instanceof BadRequestException && /未配置/.test(e.message || ''),
    );
  });

  it('视频：矩阵命中 1080p/10s=36', async () => {
    const { svc } = buildService();
    const videoPrices = { '720p': { '5': 10, '10': 18 }, '1080p': { '5': 20, '10': 36 } };
    const res = await (svc as any).charge(1, { modelType: 'video', pricing: { pricePerImage: null, videoPrices } }, { resolution: '1080p', duration: 10 }, 'src-1');
    assert.equal(res.price, 36);
    assert.ok(res.frozenTxnId);
  });

  it('视频：矩阵未配置的规格直接拒绝，不再静默扣默认价', async () => {
    const { svc } = buildService();
    const videoPrices = { '720p': { '5': 10 } };
    await assert.rejects(
      (svc as any).charge(1, { modelType: 'video', pricing: { pricePerImage: null, videoPrices } }, { resolution: '4k', duration: 30 }, 'src-1'),
      (e: any) => e instanceof BadRequestException && /未配置/.test(e.message || ''),
    );
  });

  it('视频：未配置价格矩阵同样拒绝', async () => {
    const { svc } = buildService();
    await assert.rejects(
      (svc as any).charge(1, { modelType: 'video', pricing: { pricePerImage: null, videoPrices: null } }, { resolution: '720p', duration: 5 }, 'src-1'),
      (e: any) => e instanceof BadRequestException,
    );
  });

  it('image_edit：按 pricePerImage 计费（不落入视频计费分支）', async () => {
    const { svc } = buildService();
    const res = await (svc as any).charge(
      1,
      { modelType: 'image_edit', pricing: { pricePerImage: 25.5, videoPrices: null, videoPerSecond: null } },
      {},
      'src-1',
    );
    assert.equal(res.price, 26);
    assert.ok(res.frozenTxnId);
  });
});

describe('MediaGenerationService.resolveModel 类型校验（image_edit）', () => {
  function buildResolveService() {
    const userService = { findById: async () => ({ id: 1, level: 0 }) };
    const pricing = new PricingService({} as any, {} as any, {} as any, {} as any, userService as any);
    const jobRepo: any = { find: async () => [], save: async (e: any) => e };
    const provider: any = {
      id: 1, status: 'active', baseUrl: 'https://api.example.com/v1',
      apiKey: 'enc-key', config: { generation: {} },
    };
    const modelRepo: any = { findOne: async () => null };
    const providerRepo: any = { findOne: async () => provider };
    const fileRepo: any = {};
    const genClient: any = {};
    const encryption: any = { decryptAes: (s: string) => s };
    const credits: any = {};
    const ossUpload: any = {};
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, encryption, credits, pricing, ossUpload,
    );
    return { svc, modelRepo };
  }

  it("image_edit 模型在 type='image' 下解析通过", async () => {
    const { svc, modelRepo } = buildResolveService();
    modelRepo.findOne = async () => ({ modelId: 'edit-1', modelType: 'image_edit', isActive: true, providerId: 1, pricing: { generationParams: null } });
    const r = await (svc as any).resolveModel('edit-1', 'image');
    assert.equal(r.model.modelType, 'image_edit');
    assert.ok(r.decryptedKey);
  });

  it("image_edit 模型在 type='video' 下被拒绝", async () => {
    const { svc, modelRepo } = buildResolveService();
    modelRepo.findOne = async () => ({ modelId: 'edit-1', modelType: 'image_edit', isActive: true, providerId: 1 });
    await assert.rejects(
      (svc as any).resolveModel('edit-1', 'video'),
      (e: any) => e instanceof BadRequestException && /模型类型不匹配/.test(e.message || ''),
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
    const ossUpload: any = { upload: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing, ossUpload,
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


describe('media_jobs 泛化（createCallModeJob）', () => {
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
    const ossUpload: any = { upload: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing, ossUpload,
    );
    return { svc, jobRepo, credits };
  }

  it('type 可存任意调用模式字符串', () => {
    const job = new MediaJobEntity();
    job.type = 'music';
    job.callMode = 'music';
    assert.equal(job.type, 'music');
    assert.equal(job.callMode, 'music');
  });
  it('createCallModeJob 登记任意调用模式任务并记录 callMode', async () => {
    const { svc, jobRepo } = buildService();
    const created: any[] = [];
    jobRepo.create = (e: any) => { created.push(e); return e; };
    jobRepo.save = async (e: any) => e;
    const item = await svc.createCallModeJob(9, { modelId: 'm-1', prompt: 'lofi', params: { duration: 30 } }, 'music');
    assert.equal(created[0].type, 'music');
    assert.equal(created[0].callMode, 'music');
    assert.equal(created[0].status, 'pending');
    assert.equal(item.type, 'music');
    assert.equal(item.callMode, 'music');
  });
});

describe('saveGeneratedMedia OSS 管线', () => {
  function buildService() {
    const userService = { findById: async () => ({ id: 1, level: 0 }) };
    const pricing = new PricingService({} as any, {} as any, {} as any, {} as any, userService as any);
    const jobRepo: any = {
      find: async () => [], findOne: async () => null, findAndCount: async () => [[], 0],
      save: async (e: any) => e, update: async () => ({ affected: 1 }), create: (e: any) => e,
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
    const ossUpload: any = { upload: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, {} as any, credits, pricing, ossUpload,
    );
    return { svc, jobRepo, credits, fileRepo, ossUpload };
  }

  const GENERATED_DIR = './uploads/files/generated';

  function localPathOf(url: string): string {
    return url.replace(/^\//, '');
  }

  function snapshotLocalDir(): string[] {
    return fs.existsSync(GENERATED_DIR) ? fs.readdirSync(GENERATED_DIR).sort() : [];
  }

  it('配置 OSS 时上传云 URL 并写回 files.storageType（不触碰本地磁盘）', async () => {
    const { svc, fileRepo } = buildService();
    const saved: any[] = [];
    fileRepo.save = async (e: any) => { saved.push(e); return e; };
    (svc as any).ossUpload.upload = async () => ({
      url: 'https://cdn.x.com/generated/9/image/20260814/abc.png',
      storageType: 'oss',
      objectKey: 'generated/9/image/20260814/abc.png',
    });
    const before = snapshotLocalDir();
    const url = await (svc as any).saveGeneratedMedia(9, 'image', 'image', { b64: 'aGVsbG8=' });
    assert.equal(url, 'https://cdn.x.com/generated/9/image/20260814/abc.png');
    assert.equal(saved[0].storageType, 'oss');
    assert.equal(saved[0].path, url);
    assert.deepEqual(snapshotLocalDir(), before);
  });

  it('未配置 OSS 时回退本地落盘（storageType 保持占位 minio）并记录 debug 日志', async () => {
    const { svc, fileRepo } = buildService();
    const saved: any[] = [];
    const debugMsgs: string[] = [];
    fileRepo.save = async (e: any) => { saved.push(e); return e; };
    (svc as any).ossUpload.upload = async () => null;
    (svc as any).logger = { debug: (m: string) => debugMsgs.push(m), warn: () => undefined };
    let url = '';
    try {
      url = await (svc as any).saveGeneratedMedia(9, 'video', 'video', { b64: 'aGVsbG8=' });
      assert.match(url, /^\/uploads\/files\/generated\//);
      assert.equal(saved[0].storageType, 'minio');
      assert.equal(saved[0].path, url);
      assert.ok(debugMsgs.some((m) => m.includes('回退本地落盘')));
    } finally {
      if (url) fs.rmSync(localPathOf(url), { force: true });
    }
  });

  it('OSS 上传抛错时降级本地落盘并记录 warn 日志', async () => {
    const { svc, fileRepo } = buildService();
    const saved: any[] = [];
    const warnMsgs: string[] = [];
    fileRepo.save = async (e: any) => { saved.push(e); return e; };
    (svc as any).ossUpload.upload = async () => { throw new Error('sdk not installed'); };
    (svc as any).logger = { debug: () => undefined, warn: (m: string) => warnMsgs.push(m) };
    let url = '';
    try {
      url = await (svc as any).saveGeneratedMedia(9, 'video', 'video', { b64: 'aGVsbG8=' });
      assert.match(url, /^\/uploads\/files\/generated\//);
      assert.equal(saved[0].storageType, 'minio');
      assert.equal(saved[0].path, url);
      assert.ok(warnMsgs.some((m) => m.includes('OSS 上传失败') && m.includes('sdk not installed')));
    } finally {
      if (url) fs.rmSync(localPathOf(url), { force: true });
    }
  });
});

describe('validateInputImages 输入图校验', () => {
  function buildSvc() {
    const svc = new MediaGenerationService(
      { find: async () => [], findOne: async () => null, findAndCount: async () => [[], 0], save: async (e: any) => e, update: async () => ({ affected: 1 }), create: (e: any) => e } as any,
      { find: async () => [], findOne: async () => null } as any,
      { findOne: async () => null } as any,
      { save: async (e: any) => e, create: (e: any) => e } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return svc;
  }

  it('undefined / 空数组返回空', async () => {
    const svc = buildSvc();
    assert.deepEqual(await (svc as any).validateInputImages(undefined), []);
    assert.deepEqual(await (svc as any).validateInputImages([]), []);
  });
  it('data:image 数据 URI 放行', async () => {
    const svc = buildSvc();
    const out = await (svc as any).validateInputImages(['data:image/png;base64,aGVsbG8=']);
    assert.equal(out.length, 1);
    assert.ok(out[0].startsWith('data:image/png'));
  });
  it('公网 http(s) URL 放行（复用 SSRF 校验，IP 形式避免 DNS）', async () => {
    const svc = buildSvc();
    const out = await (svc as any).validateInputImages(['https://8.8.8.8/a.png']);
    assert.equal(out[0], 'https://8.8.8.8/a.png');
  });
  it('内网 URL 拒绝', async () => {
    const svc = buildSvc();
    await assert.rejects(
      (svc as any).validateInputImages(['https://127.0.0.1/a.png']),
      (e: any) => e instanceof BadRequestException && /内网/.test(e.message),
    );
  });
  it('非法协议拒绝', async () => {
    const svc = buildSvc();
    await assert.rejects(
      (svc as any).validateInputImages(['ftp://x/a.png']),
      (e: any) => e instanceof BadRequestException && /仅支持/.test(e.message),
    );
  });
  it('超过 4 张拒绝', async () => {
    const svc = buildSvc();
    const many = Array.from({ length: 5 }, (_, i) => `data:image/png;base64,${i}`);
    await assert.rejects(
      (svc as any).validateInputImages(many),
      (e: any) => e instanceof BadRequestException && /最多 4/.test(e.message),
    );
  });
});

describe('GenerationClientService.buildImageRequest 请求形状构造', () => {
  const client2 = new GenerationClientService();

  it('JSON 分支：模板占位符 imageUrl0 / imageB640 / imageCount 替换', async () => {
    const req = await client2.buildImageRequest({
      endpoint: 'https://x.com/v1',
      adapter: {
        imagesPath: '/images/edits',
        requestTemplate: {
          model: '{upstreamModelId}',
          prompt: '{prompt}',
          sketch: '{imageUrl0}',
          sketch_b64: '{imageB640}',
          n: '{imageCount}',
        },
      },
      model: 'sketch-1',
      prompt: '上色',
      inputImages: ['data:image/png;base64,aGVsbG8='],
    });
    const body = JSON.parse(req.body as string) as Record<string, unknown>;
    assert.equal(req.url, 'https://x.com/v1/images/edits');
    assert.equal(body.model, 'sketch-1');
    assert.equal(body.sketch, ''); // data URI 不会进入 imageUrl 占位
    assert.equal(body.sketch_b64, 'data:image/png;base64,aGVsbG8=');
    assert.equal(body.n, 1);
  });

  it('JSON 分支：http URL 进入 imageUrl 占位', async () => {
    const req = await client2.buildImageRequest({
      endpoint: 'https://x.com/v1',
      adapter: { requestTemplate: { image: '{imageUrl0}' } },
      model: 'm',
      prompt: 'p',
      inputImages: ['https://cdn.x.com/a.png'],
    });
    const body = JSON.parse(req.body as string) as Record<string, unknown>;
    assert.equal(body.image, 'https://cdn.x.com/a.png');
  });

  it('JSON 分支：无模板且无输入图 → 默认文生图体（向后兼容）', async () => {
    const req = await client2.buildImageRequest({
      endpoint: 'https://x.com/v1',
      adapter: {},
      model: 'm',
      prompt: 'cat',
      size: '1024x1024',
    });
    const body = JSON.parse(req.body as string) as Record<string, unknown>;
    assert.equal(body.model, 'm');
    assert.equal(body.prompt, 'cat');
    assert.equal(body.response_format, 'b64_json');
    assert.equal(body.size, '1024x1024');
    assert.equal(body.image, undefined);
  });

  it('multipart 分支：imagesStyle=multipart 时 FormData 含文本字段与 Blob 文件', async () => {
    const req = await client2.buildImageRequest({
      endpoint: 'https://x.com/v1',
      adapter: {
        imagesStyle: 'multipart',
        imageFields: ['sketch', 'ref'],
        multipartFields: { negative_prompt: 'blurry' },
      },
      model: 'edit-1',
      prompt: '上色',
      size: '1024x1024',
      inputImages: ['data:image/png;base64,aGVsbG8=', 'data:image/png;base64,d29ybGQ='],
    });
    const form = req.body as FormData;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('model'), 'edit-1');
    assert.equal(form.get('prompt'), '上色');
    assert.equal(form.get('size'), '1024x1024');
    assert.equal(form.get('negative_prompt'), 'blurry');
    const f0 = form.get('sketch') as Blob;
    const f1 = form.get('ref') as Blob;
    assert.ok(f0 instanceof Blob);
    assert.ok(f1 instanceof Blob);
    assert.equal(Buffer.from(await f0.arrayBuffer()).toString('utf8'), 'hello');
    assert.equal(Buffer.from(await f1.arrayBuffer()).toString('utf8'), 'world');
    assert.ok(!req.headers['Content-Type'], 'multipart 不应设置 Content-Type（fetch 自动带 boundary）');
  });

  it('multipart 分支：无模板但有输入图 → 默认 multipart（OpenAI 兼容 image 字段）', async () => {
    const req = await client2.buildImageRequest({
      endpoint: 'https://x.com/v1',
      adapter: {},
      model: 'edit-1',
      prompt: 'p',
      inputImages: ['data:image/png;base64,aGVsbG8='],
    });
    const form = req.body as FormData;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('model'), 'edit-1');
    assert.equal(form.get('prompt'), 'p');
    const f = form.get('image') as Blob;
    assert.ok(f instanceof Blob);
  });
});
describe('GenerationClientService.generateImage 端到端请求构造', () => {
  const client3 = new GenerationClientService();
  const originalFetch = globalThis.fetch;

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('multipart 输入图：fetch 收到 FormData，响应 b64_json 返回 b64', async () => {
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedBody = opts.body;
      assert.ok(capturedBody instanceof FormData);
      assert.equal(opts.headers.Authorization, 'Bearer k');
      assert.ok(!opts.headers['Content-Type']);
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }),
        json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }),
        headers: new Headers(),
      };
    };
    const out = await client3.generateImage({
      endpoint: 'https://x.com/v1',
      apiKey: 'k',
      adapter: { imagesStyle: 'multipart' },
      model: 'edit-1',
      prompt: '上色',
      inputImages: ['data:image/png;base64,aGVsbG8='],
    });
    assert.equal(out.b64, 'aGVsbG8=');
    assert.ok(capturedBody instanceof FormData);
  });

  it('JSON 输入图：fetch 收到 JSON 字符串体且占位符已替换', async () => {
    let capturedBody = '';
    let capturedHeaders: any = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedBody = opts.body;
      capturedHeaders = opts.headers;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ data: [{ url: 'https://cdn.x.com/out.png' }] }),
        json: async () => ({ data: [{ url: 'https://cdn.x.com/out.png' }] }),
        headers: new Headers(),
      };
    };
    const out = await client3.generateImage({
      endpoint: 'https://x.com/v1',
      apiKey: 'k',
      adapter: { requestTemplate: { model: '{upstreamModelId}', prompt: '{prompt}', sketch: '{imageB640}' } },
      model: 'sketch-1',
      prompt: '上色',
      inputImages: ['data:image/png;base64,aGVsbG8='],
    });
    assert.equal(out.url, 'https://cdn.x.com/out.png');
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.sketch, 'data:image/png;base64,aGVsbG8=');
    assert.match(capturedHeaders['Content-Type'], /application\/json/);
  });

  it('无输入图：默认 JSON 文生图体（向后兼容）', async () => {
    let capturedBody = '';
    (globalThis as any).fetch = async (url: string, opts: any) => {
      capturedBody = opts.body;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: 'eA==' }] }),
        json: async () => ({ data: [{ b64_json: 'eA==' }] }),
        headers: new Headers(),
      };
    };
    const out = await client3.generateImage({
      endpoint: 'https://x.com/v1',
      apiKey: 'k',
      adapter: {},
      model: 'img-1',
      prompt: 'cat',
    });
    assert.equal(out.b64, 'eA==');
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.model, 'img-1');
    assert.equal(parsed.response_format, 'b64_json');
    assert.equal(parsed.image, undefined);
  });

  it('DashScope 原生异步文生图：提交 task_id 后轮询返回图片 URL', async () => {
    let calls = 0;
    let postBody = '';
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if ((opts?.method || 'GET').toUpperCase() === 'POST') {
        calls++;
        postBody = opts.body;
        assert.equal(String(url), 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis');
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({ output: { task_id: 't1', task_status: 'PENDING' } }),
          json: async () => ({ output: { task_id: 't1', task_status: 'PENDING' } }),
          headers: new Headers(),
        };
      }
      calls++;
      assert.equal(String(url), 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/task/t1');
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.x.com/1.png' }] } }),
        json: async () => ({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.x.com/1.png' }] } }),
        headers: new Headers(),
      };
    };
    const out = await client3.generateImage({
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'k',
      adapter: {
        imagesPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
        imageTaskPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/task/{id}',
        imageResultUrlPath: 'output.results[0].url',
        imageRequestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}' }, parameters: { n: 1 } },
        async: true,
        successValues: ['SUCCEEDED'],
        failedValues: ['FAILED', 'CANCELED'],
        pollInterval: 1,
        timeoutMs: 5000,
      },
      model: 'wanx2.1-t2i-turbo',
      prompt: '一只猫',
    });
    assert.equal(out.url, 'https://cdn.x.com/1.png');
    assert.ok(calls >= 2, '应提交一次并至少轮询一次');
    const parsed = JSON.parse(postBody);
    assert.equal(parsed.model, 'wanx2.1-t2i-turbo');
    assert.equal(parsed.input.prompt, '一只猫');
  });
});
describe('GenerationClientService.submitVideo 视频请求构造（分辨率映射 + 顶层 parameters）', () => {
  const client4 = new GenerationClientService();
  const originalFetch = globalThis.fetch;

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('DashScope 模板：720P 映射 1280*720，parameters 在顶层，带异步头', async () => {
    let captured: { url: string; body: any; headers: any } | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      captured = { url: String(url), body: JSON.parse(opts.body), headers: opts.headers };
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ output: { task_id: 't1', task_status: 'PENDING' } }),
        json: async () => ({ output: { task_id: 't1', task_status: 'PENDING' } }),
        headers: new Headers(),
      };
    };
    const out = await client4.submitVideo({
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'k',
      adapter: {
        videosPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        requestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}' }, parameters: { resolution: '{resolution}', duration: '{duration}', fps: '{fps}' } },
        taskIdPath: 'output.task_id',
        extraHeaders: { 'X-DashScope-Async': 'enable' },
      },
      model: 'qwen-video-plus',
      prompt: '一只猫',
      resolution: '720P',
      duration: 5,
      fps: 24,
    });
    assert.equal(out.taskId, 't1');
    assert.equal(captured!.url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
    assert.equal(captured!.headers.Authorization, 'Bearer k');
    assert.equal(captured!.headers['X-DashScope-Async'], 'enable');
    assert.deepEqual(captured!.body, {
      model: 'qwen-video-plus',
      input: { prompt: '一只猫' },
      parameters: { resolution: '1280*720', duration: 5, fps: 24 },
    });
  });

  it('1080p 小写输入自动归一化为 1920*1080', async () => {
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { task_id: 't2' } }), json: async () => ({ data: { task_id: 't2' } }), headers: new Headers() };
    };
    const out = await client4.submitVideo({
      endpoint: 'https://x.com', apiKey: 'k',
      adapter: { requestTemplate: { parameters: { resolution: '{resolution}' } }, taskIdPath: 'data.task_id' },
      model: 'm', prompt: 'p', resolution: '1080p', duration: 10,
    });
    assert.equal(out.taskId, 't2');
    assert.equal(capturedBody.parameters.resolution, '1920*1080');
  });

  it('未传分辨率：空串占位被剔除，不发送 parameters.resolution', async () => {
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { task_id: 't3' } }), json: async () => ({ data: { task_id: 't3' } }), headers: new Headers() };
    };
    await client4.submitVideo({
      endpoint: 'https://x.com', apiKey: 'k',
      adapter: { requestTemplate: { model: '{upstreamModelId}', input: { prompt: '{prompt}' }, parameters: { resolution: '{resolution}', duration: '{duration}' } }, taskIdPath: 'data.task_id' },
      model: 'm', prompt: 'p', duration: 5,
    });
    assert.equal(capturedBody.parameters.resolution, undefined);
    assert.equal(capturedBody.parameters.duration, 5);
  });
});

describe('GenerationClientService.pollVideoTask 任务查询（taskMethod + 结果路径兜底）', () => {
  const client5 = new GenerationClientService();
  const originalFetch = globalThis.fetch;

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('默认 GET 查询，结果从配置的 resultUrlPath 取', async () => {
    let method = '';
    (globalThis as any).fetch = async (url: string, opts: any) => {
      method = opts?.method || 'GET';
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ output: { task_status: 'SUCCEEDED', video_url: 'https://cdn.x.com/v.mp4' } }),
        json: async () => ({ output: { task_status: 'SUCCEEDED', video_url: 'https://cdn.x.com/v.mp4' } }),
        headers: new Headers(),
      };
    };
    const out = await client5.pollVideoTask({
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'k',
      adapter: { taskPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/tasks/{id}', statusPath: 'output.task_status', successValues: ['SUCCEEDED'], resultUrlPath: 'output.video_url' },
      taskId: 't-1',
    });
    assert.equal(method, 'GET');
    assert.equal(out.status, 'done');
    assert.equal(out.url, 'https://cdn.x.com/v.mp4');
  });

  it('taskMethod=POST 时用 POST 查询（无配置 resultUrlPath 时兜底 output.results[0].url）', async () => {
    let method = '';
    let sentBody: any = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      method = opts?.method || 'GET';
      sentBody = opts?.body;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.x.com/out.png' }] } }),
        json: async () => ({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.x.com/out.png' }] } }),
        headers: new Headers(),
      };
    };
    const out = await client5.pollVideoTask({
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'k',
      adapter: { taskPath: 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}', taskMethod: 'POST', statusPath: 'output.task_status', successValues: ['SUCCEEDED'] },
      taskId: 't-2',
    });
    assert.equal(method, 'POST');
    assert.equal(sentBody, '{}');
    assert.equal(out.status, 'done');
    assert.equal(out.url, 'https://cdn.x.com/out.png');
  });

  it('任务失败返回 failed', async () => {
    (globalThis as any).fetch = async (_url: string, _opts: any) => {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ output: { task_status: 'FAILED' } }),
        json: async () => ({ output: { task_status: 'FAILED' } }),
        headers: new Headers(),
      };
    };
    const out = await client5.pollVideoTask({
      endpoint: 'https://x.com', apiKey: 'k',
      adapter: { statusPath: 'output.task_status', successValues: ['SUCCEEDED'], failedValues: ['FAILED'] },
      taskId: 't-3',
    });
    assert.equal(out.status, 'failed');
  });
});

describe('MediaGenerationService image_edit 适配合入与传参', () => {
  function buildEditSvc() {
    const encryption: any = { decryptAes: () => 'decrypted-key' };
    const jobRepo: any = {
      find: async () => [], findOne: async () => null, findAndCount: async () => [[], 0],
      save: async (e: any) => e, update: async () => ({ affected: 1 }), create: (e: any) => e,
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
    const pricing: any = { getUserLevel: async () => 0, applyDiscount: (p: number) => p };
    const ossUpload: any = { upload: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, encryption, credits, pricing, ossUpload,
    );
    return { svc, jobRepo, modelRepo, providerRepo, genClient };
  }

  it('resolveModel 把模型 generationParams 的 image 适配键合入 adapter', async () => {
    const { svc, modelRepo, providerRepo } = buildEditSvc();
    modelRepo.findOne = async () => ({
      modelId: 'sketch-1', modelType: 'image_edit', isActive: true,
      providerId: 5, upstreamModelId: 'wanx-sketch',
      pricing: {
        generationParams: {
          images_style: 'json', images_path: '/images/edits',
          image_fields: ['sketch'], prompt_field: 'prompt', model_field: 'model',
          multipart_fields: { negative_prompt: 'blurry' },
        },
      },
    });
    providerRepo.findOne = async () => ({ id: 5, status: 'active', slug: 'qwen', baseUrl: 'https://x.com/v1', apiKey: 'enc', config: {} });
    const resolved = await (svc as any).resolveModel('sketch-1', 'image');
    assert.equal(resolved.adapter.imagesStyle, 'json');
    assert.equal(resolved.adapter.imagesPath, '/images/edits');
    assert.deepEqual(resolved.adapter.imageFields, ['sketch']);
    assert.equal(resolved.adapter.promptField, 'prompt');
    assert.equal(resolved.adapter.modelField, 'model');
    assert.deepEqual(resolved.adapter.multipartFields, { negative_prompt: 'blurry' });
  });

  it('generateImage 传 inputImages 给 genClient 并记录 params', async () => {
    const { svc, modelRepo, providerRepo, genClient, jobRepo } = buildEditSvc();
    modelRepo.findOne = async () => ({
      modelId: 'sketch-1', modelType: 'image_edit', isActive: true,
      providerId: 5, upstreamModelId: 'wanx-sketch',
      pricing: { pricePerImage: 10, generationParams: { images_style: 'multipart' } },
    });
    providerRepo.findOne = async () => ({ id: 5, status: 'active', slug: 'qwen', baseUrl: 'https://x.com/v1', apiKey: 'enc', config: {} });
    const created: any[] = [];
    jobRepo.create = (e: any) => { created.push(e); return e; };
    jobRepo.save = async (e: any) => e;
    const captured: any = {};
    genClient.generateImage = async (cfg: any) => { captured.inputImages = cfg.inputImages; return { b64: 'aGVsbG8=' }; };
    (svc as any).saveGeneratedMedia = async () => 'https://cdn.x.com/out.png';
    await svc.generateImage(1, {
      modelId: 'sketch-1',
      prompt: '上色',
      inputImages: ['data:image/png;base64,aGVsbG8='],
    });
    assert.deepEqual(captured.inputImages, ['data:image/png;base64,aGVsbG8=']);
    assert.ok(created[0].params.inputImages);
  });
});

describe('buildMediaGenerationAdapter 厂商模板兜底合并（测试=运行）', () => {
  it('存量 DashScope 供应商存旧图片端点时，自动采用最新模板端点', () => {
    const adapter = buildMediaGenerationAdapter(
      {
        slug: 'qwen-dashscope',
        config: {
          vendorKey: 'aliyun-dashscope',
          generation: {
            imagesPath: 'https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations',
            videosPath: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          },
        },
      },
      null,
    );
    assert.equal(adapter.imagesPath, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation');
    assert.equal(adapter.imageTaskPath, 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}');
    assert.equal(adapter.imageResultUrlPath, 'output.choices[0].message.content[0].image');
    assert.equal((adapter.imageRequestTemplate as Record<string, unknown>)?.model, '{upstreamModelId}');
    assert.equal(adapter.async, true);
    assert.equal(adapter.videosPath, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
  });
  it('供应商没有厂商模板时，存量 config 原样保留', () => {
    const adapter = buildMediaGenerationAdapter(
      { slug: 'custom', config: { generation: { imagesPath: 'https://g.example.com/gen' } } },
      null,
    );
    assert.equal(adapter.imagesPath, 'https://g.example.com/gen');
  });
  it('模型级 generationParams 最后覆盖模板与存量', () => {
    const adapter = buildMediaGenerationAdapter(
      { slug: 'qwen', config: { vendorKey: 'aliyun-dashscope', generation: {} } },
      { images_path: 'https://custom.example.com/text2image', poll_interval: 500 },
    );
    assert.equal(adapter.imagesPath, 'https://custom.example.com/text2image');
    assert.equal(adapter.pollInterval, 500);
  });
});

describe('图像编辑参考图校验与 OSS 上传', () => {
  function buildEditSvc2() {
    const modelRepo: any = { findOne: async () => null, save: async (e: any) => e, create: (e: any) => e };
    const providerRepo: any = { findOne: async () => null };
    const jobRepo: any = {
      find: async () => [], findOne: async () => null, findAndCount: async () => [[], 0],
      save: async (e: any) => e, update: async () => ({ affected: 1 }), create: (e: any) => e,
    };
    const fileRepo: any = { save: async (e: any) => e, create: (e: any) => e };
    const genClient: any = { generateImage: async () => ({ url: 'https://x/1.png' }) };
    const credits: any = {
      freezeCredits: async () => ({ id: 777 }), settleCredits: async () => undefined, refundCredits: async () => undefined,
    };
    const pricing: any = { getUserLevel: async () => 0, applyDiscount: (p: number) => p };
    const encryption: any = { decryptAes: () => 'decrypted-key' };
    return { modelRepo, providerRepo, jobRepo, fileRepo, genClient, credits, pricing, encryption };
  }

  function makeSvc(ossUpload: any, genClient: any, modelRepo: any, providerRepo: any, jobRepo: any, fileRepo: any, credits: any, pricing: any, encryption: any) {
    return new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, fileRepo, genClient, encryption, credits, pricing, ossUpload,
    );
  }

  it('image_edit 无参考图 -> 拒绝（提示需参考图）', async () => {
    const m = buildEditSvc2();
    m.modelRepo.findOne = async () => ({
      modelId: 'sketch', modelType: 'image_edit', isActive: true, providerId: 5,
      upstreamModelId: 'wanx-sketch', pricing: { pricePerImage: 10 },
    });
    m.providerRepo.findOne = async () => ({ id: 5, status: 'active', slug: 'qwen', baseUrl: 'https://x.com/v1', apiKey: 'enc', config: {} });
    const svc = makeSvc({ upload: async () => null }, m.genClient, m.modelRepo, m.providerRepo, m.jobRepo, m.fileRepo, m.credits, m.pricing, m.encryption);
    (svc as any).saveGeneratedMedia = async () => 'https://cdn.x.com/out.png';
    await assert.rejects(
      () => svc.generateImage(1, { modelId: 'sketch', prompt: '上色' }),
      (e: any) => e instanceof BadRequestException && /参考图/.test(e.message),
    );
  });

  it('data URI 参考图 + 模板适配 -> 先传 OSS 换公网 URL 再调上游', async () => {
    const m = buildEditSvc2();
    const captured: any = {};
    m.genClient.generateImage = async (cfg: any) => { captured.cfg = cfg; return { url: 'https://x/1.png' }; };
    m.modelRepo.findOne = async () => ({
      modelId: 'sketch', modelType: 'image_edit', isActive: true, providerId: 5,
      upstreamModelId: 'wanx-sketch',
      pricing: { pricePerImage: 10, generationParams: { images_style: 'json', image_request_template: { input: { base_image_url: '{imageUrl0}' } } } },
    });
    m.providerRepo.findOne = async () => ({ id: 5, status: 'active', slug: 'qwen', baseUrl: 'https://x.com/v1', apiKey: 'enc', config: { vendorKey: 'aliyun-dashscope' } });
    let ossCalls = 0;
    const ossUpload = { upload: async () => { ossCalls++; return { url: 'https://oss.example.com/input.png', storageType: 'oss' as const }; } };
    const svc = makeSvc(ossUpload, m.genClient, m.modelRepo, m.providerRepo, m.jobRepo, m.fileRepo, m.credits, m.pricing, m.encryption);
    (svc as any).saveGeneratedMedia = async () => 'https://cdn.x.com/out.png';
    await svc.generateImage(1, { modelId: 'sketch', prompt: '上色', inputImages: ['data:image/png;base64,aGVsbG8='] });
    assert.equal(ossCalls, 1, '应上传一次 OSS');
    assert.deepEqual(captured.cfg.inputImages, ['https://oss.example.com/input.png']);
  });

  it('imageRequestTemplate 空占位字段被剔除（不发送 base_image_url=""）', async () => {
    let postBody = '';
    (globalThis as any).fetch = async (url: string, opts: any) => {
      postBody = opts.body;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }),
        json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }),
        headers: new Headers(),
      };
    };
    const out = await client.generateImage({
      endpoint: 'https://x.com/v1',
      apiKey: 'k',
      adapter: {
        imagesPath: '/images/edits',
        imageRequestTemplate: {
          model: '{upstreamModelId}',
          input: { prompt: '{prompt}', base_image_url: '{imageUrl0}' },
        },
      },
      model: 'wanx-sketch',
      prompt: '上色',
    });
    assert.equal(out.b64, 'aGVsbG8=');
    const parsed = JSON.parse(postBody);
    assert.equal(parsed.input.base_image_url, undefined, '空 base_image_url 不应发送');
    assert.equal(parsed.input.prompt, '上色');
    assert.equal(parsed.model, 'wanx-sketch');
  });
});

describe('mergeGenerationAdapter', () => {
  it('模型级 async 布尔可覆盖供应商级 async（false 关闭 / true 开启）', () => {
    const base = { async: true } as GenerationAdapterConfig;
    const off = mergeGenerationAdapter(base, { async: false });
    assert.equal(off.async, false);
    const on = mergeGenerationAdapter(base, { async: true });
    assert.equal(on.async, true);
    // 未设置时保留供应商级
    const keep = mergeGenerationAdapter(base, { video_submit_path: 'https://x/v' });
    assert.equal(keep.async, true);
  });
  it('snake_case 键映射到适配器（任务查询URL/状态/成功值/结果URL）', () => {
    const a = mergeGenerationAdapter({}, {
      video_submit_path: 'https://x/api/v3/tasks',
      video_query_path: 'https://x/api/v3/tasks/{id}',
      task_id_path: 'data.id',
      task_status_path: 'data.state',
      success_values: ['SUCCEEDED', 'done'],
      failed_values: ['FAILED'],
      result_url_path: 'data.video.url',
      task_method: 'GET',
      poll_interval: 2000,
      timeout_ms: 90000,
    });
    assert.equal(a.videosPath, 'https://x/api/v3/tasks');
    assert.equal(a.taskPath, 'https://x/api/v3/tasks/{id}');
    assert.equal(a.taskIdPath, 'data.id');
    assert.equal(a.statusPath, 'data.state');
    assert.deepEqual(a.successValues, ['SUCCEEDED', 'done']);
    assert.deepEqual(a.failedValues, ['FAILED']);
    assert.equal(a.resultUrlPath, 'data.video.url');
    assert.equal(a.taskMethod, 'GET');
    assert.equal(a.pollInterval, 2000);
    assert.equal(a.timeoutMs, 90000);
  });
});
describe('MediaGenerationService.listGenerationModels 桌面端模型列表', () => {
  function buildListService() {
    const userService = { findById: async () => ({ id: 1, level: 0 }) };
    const pricing = new PricingService({} as any, {} as any, {} as any, {} as any, userService as any);
    const jobRepo: any = { find: async () => [], save: async (e: any) => e };
    const modelRepo: any = { find: async () => [], findOne: async () => null };
    const providerRepo: any = { findOne: async () => null };
    const svc = new MediaGenerationService(
      jobRepo, modelRepo, providerRepo, {} as any, {} as any,
      { decryptAes: (s: string) => s } as any, {} as any, pricing, {} as any,
    );
    return { svc, modelRepo, providerRepo };
  }
  it('模型绑定有效供应商 → 出现在列表', async () => {
    const { svc, modelRepo, providerRepo } = buildListService();
    modelRepo.find = async () => [
      { modelId: 'vid-1', name: '视频模型', modelType: 'video', isActive: true, providerId: 7, pricing: { generationParams: {}, pricePerImage: null, videoPrices: {} } },
      { modelId: 'img-edit-1', name: '图生图', modelType: 'image_edit', isActive: true, providerId: 7, pricing: { generationParams: {}, pricePerImage: 12, videoPrices: {} } },
    ];
    providerRepo.findOne = async () => ({ id: 7, status: 'active', baseUrl: 'https://x/v1', apiKey: 'enc', slug: 'dashscope' });
    const list = await (svc as any).listGenerationModels();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'vid-1');
    assert.equal(list[0].type, 'video');
    assert.equal(list[1].type, 'image'); // image_edit 归一为 image
    assert.equal(list[1].provider, 'dashscope');
  });
  it('模型未绑定供应商但存在全局中转 → relay 兜底出现在列表（与生成时一致）', async () => {
    const { svc, modelRepo, providerRepo } = buildListService();
    modelRepo.find = async () => [
      { modelId: 'img-1', name: '图片模型', modelType: 'image', isActive: true, providerId: null, pricing: { generationParams: {}, pricePerImage: 10, videoPrices: {} } },
    ];
    let calls = 0;
    providerRepo.findOne = async () => {
      calls += 1;
      return { id: 9, status: 'active', baseUrl: 'https://relay/v1', apiKey: 'enc', slug: 'relay' };
    };
    const list = await (svc as any).listGenerationModels();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'img-1');
    assert.equal(list[0].provider, 'relay');
    assert.ok(calls >= 1, 'resolveRelay 应解析到可用供应商');
  });
  it('无任何可用供应商 → 列表为空', async () => {
    const { svc, modelRepo } = buildListService();
    modelRepo.find = async () => [
      { modelId: 'vid-2', name: 'V', modelType: 'video', isActive: true, providerId: null, pricing: { generationParams: {} } },
    ];
    const list = await (svc as any).listGenerationModels();
    assert.deepEqual(list, []);
  });
});
