/** 口播工坊：声音/形象资产 + 选题灵感（对标参考软件）单元测试 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OralWorkshopService } from '../../src/modules/oral-workshop/oral-workshop.service';
import { OralWorkshopExecutor } from '../../src/modules/oral-workshop/oral-workshop.executor';
import type { OralWorkshopLlmService } from '../../src/modules/oral-workshop/llm';

// ===== fakes =====
/** where 值匹配：支持 TypeORM FindOperator（In），其余按全等 */
function matchVal(actual: any, want: any): boolean {
  if (want && typeof want === 'object' && (want as any)._type === 'in') {
    return ((want as any)._value as any[]).includes(actual);
  }
  return actual === want;
}

function matchRow(row: any, where: any): boolean {
  return Object.keys(where ?? {}).every((k) => matchVal(row?.[k], where[k]));
}

function makeRepo<T extends { id?: number }>(seed: T[] = []) {
  const rows: T[] = [...seed];
  let nextId = seed.length + 1;
  return {
    rows,
    find: async (opts: any) => rows.filter((r: any) => matchRow(r, opts?.where ?? {})),
    findOne: async (opts: any) => rows.find((r: any) => matchRow(r, opts?.where ?? {})) ?? null,
    create: (d: any) => ({ id: nextId++, ...d }),
    save: async (e: any) => {
      const idx = rows.findIndex((r: any) => r.id === e.id);
      if (idx >= 0) rows[idx] = e; else rows.push(e);
      return e;
    },
    remove: async (e: any) => {
      const idx = rows.findIndex((r: any) => r.id === e.id);
      if (idx >= 0) rows.splice(idx, 1);
    },
  };
}

function fakeJobRepo() {
  return {
    find: async () => [],
    findOne: async () => null,
    create: (d: any) => d,
    save: async (j: any) => j,
  };
}

function fakeStepRepo() {
  return {
    find: async () => [],
    create: (d: any) => d,
    save: async (rows: any[]) => rows,
  };
}

function fakeBilling() {
  return {
    estimateAndFreeze: async () => ({ id: 1 }),
    settleActualCost: async () => undefined,
    refund: async () => undefined,
  };
}

const fakeSystemLlm = {
  stt: async () => 'x',
  chat: async () => 'x',
  embed: async () => [[]],
  resolveTarget: async () => null,
} as any;

const fakeLlm = {
  generateTopics: async (keywords: string, opts?: { persona?: string; count?: number }) => [
    { title: 'AI 效率工具盘点（' + keywords + '）', persona_angle: opts?.persona, hook: '3 个工具' },
  ],
  keywordTopics: async () => ({ keyword_analysis: 'x', topics: [] }),
  rewriteScript: async () => 'x',
  createScript: async () => 'x',
  styleAnalysis: async () => ({ style_analysis: 'x', topics: [] }),
  generateTitle: async () => '标题',
  legalReview: async () => ({ risk_level: 'low', issues: [], safe_script: 'x' }),
};

function newService(voiceRows: any[] = [], dhRows: any[] = []) {
  const voiceRepo = makeRepo(voiceRows);
  const dhRepo = makeRepo(dhRows);
  const service = new OralWorkshopService(
    fakeJobRepo() as any,
    fakeStepRepo() as any,
    dhRepo as any,
    makeRepo<any>() as any,
    makeRepo<any>() as any,
    fakeBilling() as any,
    fakeLlm as unknown as OralWorkshopLlmService,
    fakeSystemLlm as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    voiceRepo as any,
  );
  return { service, voiceRepo, dhRepo };
}

afterEach(() => {
  delete process.env.VOLCANO_ARK_API_KEY;
  delete process.env.VOLCANO_VOICE_MODEL;
  delete process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT;
  delete process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ID;
});

describe('OralWorkshopService 声音资产', () => {
  it('createVoice：保存用户声音（name/refAudioUrl/status=ready）', async () => {
    const { service, voiceRepo } = newService();
    const created = await service.createVoice(7, { name: '我的声音', refAudioUrl: 'https://oss/x/ref.mp3' });
    assert.ok(created.id >= 1);
    assert.equal(created.name, '我的声音');
    assert.equal(voiceRepo.rows.length, 1);
    assert.equal((voiceRepo.rows[0] as any).userId, 7);
  });

  it('createVoice：空名称/URL 抛 BadRequest', async () => {
    const { service } = newService();
    await assert.rejects(() => service.createVoice(7, { name: '', refAudioUrl: 'u' }), BadRequestException);
    await assert.rejects(() => service.createVoice(7, { name: 'n', refAudioUrl: '' }), BadRequestException);
  });

  it('listVoices：只返回当前用户的声音', async () => {
    const { service, voiceRepo } = newService();
    voiceRepo.rows.push({ id: 1, userId: 7, bizType: 'voice_asset', title: 'a', url: 'u1', meta: { status: 'ready' } } as any);
    voiceRepo.rows.push({ id: 2, userId: 8, bizType: 'voice_asset', title: 'b', url: 'u2', meta: { status: 'ready' } } as any);
    const list = await service.listVoices(7);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 1);
  });

  it('deleteVoice：删除不存在的声音抛 NotFound', async () => {
    const { service } = newService();
    await assert.rejects(() => service.deleteVoice(7, 999), NotFoundException);
  });
});

describe('OralWorkshopService 数字人形象（两库：media_assets + media_asset_avatar）', () => {
  it('createDigitalHuman：主体写输入库·avatar，扩展写形象表', async () => {
    const { service, dhRepo, voiceRepo } = newService();
    const created = await service.createDigitalHuman(7, { name: '主播小美', cloudId: 'dh_001' });
    assert.ok(created.id >= 1);
    assert.equal(created.cloudId, 'dh_001');
    assert.equal(created.authorized, true);
    assert.equal(dhRepo.rows.length, 1); // 扩展行
    assert.equal(voiceRepo.rows.length, 1); // 素材主体行（media_assets）
    const asset: any = voiceRepo.rows[0];
    assert.equal(asset.library, 'input');
    assert.equal(asset.kind, 'avatar');
    assert.equal(asset.bizType, 'avatar');
    // cloud 类形象无可直链媒体文件 → 占位 URL
    assert.equal(asset.url, 'avatar://cloud/dh_001');
    assert.equal((dhRepo.rows[0] as any).assetId, created.id);
    assert.equal((dhRepo.rows[0] as any).dhKind, 'cloud');
  });

  it('createDigitalHuman：video 形象主体 assetType=video，url=视频直链', async () => {
    const { service, voiceRepo, dhRepo } = newService();
    const created = await service.createDigitalHuman(7, {
      name: '真人视频',
      kind: 'video',
      videoUrl: 'https://oss/x/a.mp4',
    });
    const asset: any = voiceRepo.rows[0];
    assert.equal(asset.assetType, 'video');
    assert.equal(asset.url, 'https://oss/x/a.mp4');
    assert.equal((dhRepo.rows[0] as any).videoUrl, 'https://oss/x/a.mp4');
    assert.ok(created.cloudId.startsWith('local-video-'));
  });

  it('listDigitalHumans：按 media_assets(kind=avatar) 过滤并合并扩展字段', async () => {
    const { service, voiceRepo, dhRepo } = newService();
    // 其他 kind / 其他用户的素材不应出现
    voiceRepo.rows.push({ id: 1, userId: 7, library: 'input', kind: 'avatar', title: 'A', url: 'avatar://cloud/a', createdAt: new Date('2026-08-01') } as any);
    voiceRepo.rows.push({ id: 2, userId: 7, library: 'input', kind: 'voice', title: '声音', url: 'u', createdAt: new Date('2026-08-02') } as any);
    voiceRepo.rows.push({ id: 3, userId: 8, library: 'input', kind: 'avatar', title: 'B', url: 'avatar://cloud/b', createdAt: new Date('2026-08-03') } as any);
    dhRepo.rows.push({ assetId: 1, dhKind: 'cloud', cloudId: 'a', authorized: true, status: 'ready', createdAt: new Date('2026-08-01') } as any);
    dhRepo.rows.push({ assetId: 3, dhKind: 'cloud', cloudId: 'b', authorized: true, status: 'ready', createdAt: new Date('2026-08-03') } as any);
    const list = await service.listDigitalHumans(7);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 1);
    assert.equal(list[0].name, 'A');
    assert.equal(list[0].cloudId, 'a');
  });

  it('deleteDigitalHuman：同时删除素材主体与扩展行', async () => {
    const { service, voiceRepo, dhRepo } = newService();
    voiceRepo.rows.push({ id: 5, userId: 7, library: 'input', kind: 'avatar', title: 'A', url: 'avatar://cloud/a' } as any);
    dhRepo.rows.push({ assetId: 5, dhKind: 'cloud', cloudId: 'a', authorized: true, status: 'ready' } as any);
    await service.deleteDigitalHuman(7, 5);
    assert.equal(voiceRepo.rows.length, 0);
    assert.equal(dhRepo.rows.length, 0);
  });

  it('deleteDigitalHuman：删除不存在抛 NotFound', async () => {
    const { service } = newService();
    await assert.rejects(() => service.deleteDigitalHuman(7, 999), NotFoundException);
  });
});

describe('OralWorkshopService 选题灵感', () => {
  it('generateTopics：调用 LLM 返回选题（人设透传）', async () => {
    const { service } = newService();
    const topics = await service.generateTopics(7, { keywords: 'AI', persona: '职场人', count: 3 });
    assert.ok(Array.isArray(topics));
    assert.ok(topics[0].title.includes('AI'));
  });

  it('generateTopics：空关键词抛 BadRequest', async () => {
    const { service } = newService();
    await assert.rejects(() => service.generateTopics(7, { keywords: '  ' }), BadRequestException);
  });
});

describe('OralWorkshopExecutor 资产接线', () => {
  it('voiceClone：voiceId 指向不存在的声音 → markStepFailed（可读错误，不发起 HTTP）', async () => {
    process.env.VOLCANO_ARK_API_KEY = 'k';
    process.env.VOLCANO_VOICE_MODEL = 'm';
    const mediaAssetRepo = { findOne: async () => null };
    const service: any = {
      nextPendingStepOf: async () => 'voiceClone',
      getStepResults: async () => ({}),
      markStepRunning: async () => undefined,
      markStepDone: async () => undefined,
      markStepFailed: async (_id: number, _step: string, error: string) => { failed = error; },
    };
    let failed = '';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, undefined as any, undefined as any, mediaAssetRepo as any);
    await exec.processJob({ id: 1, userId: 7, voiceId: 99, scriptInput: 'x' } as any);
    assert.ok(failed.includes('声音资产不存在'));
  });

  it('digitalHuman：digitalHumanId 指向不存在的形象 → markStepFailed（可读错误，不发起 HTTP）', async () => {
    process.env.VOLCANO_ARK_API_KEY = 'k';
    process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT = 'https://example.com/dh';
    // 两库合并后：形象主体在 media_assets(kind=avatar)，扩展在 media_asset_avatar
    const dhAssetRepo = { findOne: async () => null };
    const mediaAssetRepo = { findOne: async () => null };
    const service: any = {
      nextPendingStepOf: async () => 'digitalHuman',
      parseShots: () => null,
      getStepResults: async () => ({ voiceClone: { audio_path: 'https://oss/x/voice.mp3' } }),
      markStepRunning: async () => undefined,
      markStepDone: async () => undefined,
      markStepFailed: async (_id: number, _step: string, error: string) => { failed = error; },
    };
    let failed = '';
    const exec = new OralWorkshopExecutor(
      service,
      null as unknown as OralWorkshopLlmService,
      undefined as any,
      undefined as any,
      mediaAssetRepo as any,
      dhAssetRepo as any,
    );
    await exec.processJob({ id: 1, userId: 7, digitalHumanId: 99 } as any);
    assert.ok(failed.includes('数字人形象不存在'));
  });
});

// ===== 批量矩阵化建单（对标参考软件 draft:batch-create）=====
function fakeJobRepoForBatch() {
  const jobs: any[] = [];
  let nextId = 1;
  return {
    rows: jobs,
    find: async (opts: any) => {
      const w = opts?.where ?? {};
      return jobs.filter((r: any) => Object.keys(w).every((k) => r[k] === w[k]));
    },
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      return jobs.find((r: any) => Object.keys(w).every((k) => r[k] === w[k])) ?? null;
    },
    create: (d: any) => ({ id: nextId++, createdAt: new Date(), updatedAt: new Date(), status: 'pending', creditsCost: 0, ...d }),
    save: async (j: any) => {
      const idx = jobs.findIndex((r: any) => r.id === j.id);
      if (idx >= 0) jobs[idx] = j; else jobs.push(j);
      return j;
    },
  };
}

function newBatchService() {
  const jobRepo = fakeJobRepoForBatch();
  const stepRepo = fakeStepRepo();
  const voiceRepo = makeRepo<any>();
  const dhRepo = makeRepo<any>();
  const service = new OralWorkshopService(
    jobRepo as any,
    stepRepo as any,
    dhRepo as any,
    makeRepo<any>() as any,
    makeRepo<any>() as any,
    fakeBilling() as any,
    fakeLlm as unknown as OralWorkshopLlmService,
    fakeSystemLlm as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    voiceRepo as any,
  );
  return { service, jobRepo };
}

describe('OralWorkshopService 批量矩阵化建单', () => {
  it('createBatch：3 条文案 × 2 模板 = 6 单（逐单预扣 Credits 幂等键唯一）', async () => {
    const { service, jobRepo } = newBatchService();
    const res = await service.createBatch(7, {
      topics: ['选题A', '选题B', '选题C'],
      templateIds: [1, 2],
      persona: 'AI 产品经理',
    });
    assert.equal(res.total, 6);
    assert.equal(res.created.length, 6);
    assert.equal(res.skipped, 0);
    assert.equal(res.errors.length, 0);
    assert.equal(jobRepo.rows.length, 6);
    assert.equal(jobRepo.rows[0].userId, 7);
    assert.equal(jobRepo.rows[0].templateId, 1);
    assert.equal(jobRepo.rows[1].templateId, 2);
    assert.equal(jobRepo.rows[2].templateId, 1);
    assert.equal(jobRepo.rows[0].persona, 'AI 产品经理');
  });

  it('createBatch：声音 × 形象矩阵正确组合', async () => {
    const { service, jobRepo } = newBatchService();
    const res = await service.createBatch(7, {
      topics: ['T1'],
      voiceIds: [10, 11],
      digitalHumanIds: [20],
    });
    assert.equal(res.total, 2);
    const combos = jobRepo.rows.map((r: any) => [r.voiceId, r.digitalHumanId]);
    assert.deepEqual(combos, [[10, 20], [11, 20]]);
  });

  it('createBatch：组合数超过 50 抛 BadRequest', async () => {
    const { service } = newBatchService();
    await assert.rejects(
      () => service.createBatch(7, { topics: ['a', 'b', 'c', 'd'], templateIds: [1, 2, 3], voiceIds: [1, 2, 3, 4, 5] }),
      BadRequestException,
    );
  });

  it('createBatch：同 batchTxnId 重复提交幂等（不重复建单）', async () => {
    const { service, jobRepo } = newBatchService();
    const dto = { topics: ['A', 'B'], templateIds: [1], batchTxnId: 'ow-batch-test-1' };
    const r1 = await service.createBatch(7, dto);
    const r2 = await service.createBatch(7, dto);
    assert.equal(r1.created.length, 2);
    assert.equal(r2.created.length, 2);
    assert.equal(jobRepo.rows.length, 2);
    assert.equal(r2.created[0].id, r1.created[0].id);
  });

  it('createBatch：某单预扣失败（余额不足）不影响其他单，错误可读', async () => {
    let billingCalls = 0;
    const failingBilling = {
      estimateAndFreeze: async () => {
        billingCalls += 1;
        if (billingCalls === 2) throw new BadRequestException('余额不足，请先充值');
        return { id: billingCalls };
      },
      settleActualCost: async () => undefined,
      refund: async () => undefined,
    };
    const service = new OralWorkshopService(
      fakeJobRepoForBatch() as any,
      fakeStepRepo() as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      makeRepo<any>() as any,
      failingBilling as any,
      fakeLlm as unknown as OralWorkshopLlmService,
      fakeSystemLlm as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      makeRepo<any>() as any,
    );
    const res = await service.createBatch(7, { topics: ['A', 'B'], templateIds: [1] });
    assert.equal(res.created.length, 1);
    assert.equal(res.skipped, 1);
    assert.ok(res.errors[0].reason.includes('余额不足'));
    void service;
  });
});
