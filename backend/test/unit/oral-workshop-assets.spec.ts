/** 口播工坊：声音/形象资产 + 选题灵感（对标参考软件）单元测试 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OralWorkshopService } from '../../src/modules/oral-workshop/oral-workshop.service';
import { OralWorkshopExecutor } from '../../src/modules/oral-workshop/oral-workshop.executor';
import type { OralWorkshopLlmService } from '../../src/modules/oral-workshop/llm';

// ===== fakes =====
function makeRepo<T extends { id?: number }>(seed: T[] = []) {
  const rows: T[] = [...seed];
  let nextId = seed.length + 1;
  return {
    rows,
    find: async (opts: any) => {
      const w = opts?.where ?? {};
      return rows.filter((r: any) => Object.keys(w).every((k) => (r as any)[k] === w[k]));
    },
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      return rows.find((r: any) => Object.keys(w).every((k) => (r as any)[k] === w[k])) ?? null;
    },
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
    voiceRepo as any,
    dhRepo as any,
    makeRepo<any>() as any,
    makeRepo<any>() as any,
    fakeBilling() as any,
    fakeLlm as unknown as OralWorkshopLlmService,
    fakeSystemLlm as any,
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
    voiceRepo.rows.push({ id: 1, userId: 7, name: 'a', refAudioUrl: 'u1', status: 'ready' } as any);
    voiceRepo.rows.push({ id: 2, userId: 8, name: 'b', refAudioUrl: 'u2', status: 'ready' } as any);
    const list = await service.listVoices(7);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 1);
  });

  it('deleteVoice：删除不存在的声音抛 NotFound', async () => {
    const { service } = newService();
    await assert.rejects(() => service.deleteVoice(7, 999), NotFoundException);
  });
});

describe('OralWorkshopService 数字人形象', () => {
  it('createDigitalHuman：保存形象（cloudId/authorized=true）', async () => {
    const { service, dhRepo } = newService();
    const created = await service.createDigitalHuman(7, { name: '主播小美', cloudId: 'dh_001' });
    assert.ok(created.id >= 1);
    assert.equal(created.cloudId, 'dh_001');
    assert.equal(created.authorized, true);
    assert.equal(dhRepo.rows.length, 1);
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
    const voiceAssetRepo = { findOne: async () => null };
    const service: any = {
      nextPendingStepOf: async () => 'voiceClone',
      getStepResults: async () => ({}),
      markStepRunning: async () => undefined,
      markStepDone: async () => undefined,
      markStepFailed: async (_id: number, _step: string, error: string) => { failed = error; },
    };
    let failed = '';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, undefined as any, undefined as any, voiceAssetRepo as any);
    await exec.processJob({ id: 1, userId: 7, voiceId: 99, scriptInput: 'x' } as any);
    assert.ok(failed.includes('声音资产不存在'));
  });

  it('digitalHuman：digitalHumanId 指向不存在的形象 → markStepFailed（可读错误，不发起 HTTP）', async () => {
    process.env.VOLCANO_ARK_API_KEY = 'k';
    process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT = 'https://example.com/dh';
    const dhAssetRepo = { findOne: async () => null };
    const service: any = {
      nextPendingStepOf: async () => 'digitalHuman',
      parseShots: () => null,
      getStepResults: async () => ({ voiceClone: { audio_path: 'https://oss/x/voice.mp3' } }),
      markStepRunning: async () => undefined,
      markStepDone: async () => undefined,
      markStepFailed: async (_id: number, _step: string, error: string) => { failed = error; },
    };
    let failed = '';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, undefined as any, undefined as any, undefined as any, dhAssetRepo as any);
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
    voiceRepo as any,
    dhRepo as any,
    makeRepo<any>() as any,
    makeRepo<any>() as any,
    fakeBilling() as any,
    fakeLlm as unknown as OralWorkshopLlmService,
    fakeSystemLlm as any,
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
      makeRepo<any>() as any,
      failingBilling as any,
      fakeLlm as unknown as OralWorkshopLlmService,
      fakeSystemLlm as any,
    );
    const res = await service.createBatch(7, { topics: ['A', 'B'], templateIds: [1] });
    assert.equal(res.created.length, 1);
    assert.equal(res.skipped, 1);
    assert.ok(res.errors[0].reason.includes('余额不足'));
    void service;
  });
});
