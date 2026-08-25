/** 口播工坊模块单元测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop.spec.ts
 *
 * 覆盖：
 * - pipeline 纯函数：7 步顺序、状态推进、重试上限、任务状态推导
 * - service：clientTxnId 幂等创建、取消退款、孤儿回收、步骤推进结算/失败退款
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ORAL_WORKSHOP_STEPS,
  buildInitialSteps,
  nextStepName,
  jobStatusAfterSteps,
  nextPendingStep,
  markStepDone,
  markStepFailed,
  MAX_STEP_RETRIES,
  type PipelineStepState,
} from '../../src/modules/oral-workshop/oral-workshop.pipeline';
import { OralWorkshopService, DEFAULT_ESTIMATED_CREDITS } from '../../src/modules/oral-workshop/oral-workshop.service';
import { OralWorkshopJobEntity } from '../../src/modules/oral-workshop/entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from '../../src/modules/oral-workshop/entities/oral-workshop-step.entity';
import type { Repository } from 'typeorm';

// ===== pipeline 纯函数 =====

describe('oral-workshop pipeline', () => {
  it('步骤顺序固定为 7 步', () => {
    assert.deepEqual(ORAL_WORKSHOP_STEPS, [
      'extract', 'rewrite', 'voiceClone', 'digitalHuman', 'videoEdit', 'titleCover', 'publishReady',
    ]);
  });

  it('buildInitialSteps 生成 7 个 pending 步骤（stepOrder 1-7）', () => {
    const steps = buildInitialSteps(5);
    assert.equal(steps.length, 7);
    assert.deepEqual(steps.map((s) => s.stepOrder), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(steps.every((s) => s.status === 'pending'));
    assert.ok(steps.every((s) => s.jobId === 5));
  });

  it('nextStepName：无当前步 → extract；中间步 → 下一步；末步 → null', () => {
    assert.equal(nextStepName(null), 'extract');
    assert.equal(nextStepName(undefined), 'extract');
    assert.equal(nextStepName('voiceClone'), 'digitalHuman');
    assert.equal(nextStepName('publishReady'), null);
  });

  it('nextStepName：未知步骤名回退到第一步', () => {
    assert.equal(nextStepName('unknown'), 'extract');
  });

  it('jobStatusAfterSteps：全 done → done；任一 failed → failed；有 pending → processing', () => {
    const done = ORAL_WORKSHOP_STEPS.map((step, i) => ({ step, stepOrder: i + 1, status: 'done' as const, retryCount: 0 }));
    assert.equal(jobStatusAfterSteps(done), 'done');

    const withFailed = done.map((s, i) => (i === 2 ? { ...s, status: 'failed' as const } : s));
    assert.equal(jobStatusAfterSteps(withFailed), 'failed');

    const withPending = done.map((s, i) => (i === 6 ? { ...s, status: 'pending' as const } : s));
    assert.equal(jobStatusAfterSteps(withPending), 'processing');

    assert.equal(jobStatusAfterSteps([]), 'pending');
  });

  it('nextPendingStep 返回第一个 pending 步骤；无 pending 返回 null', () => {
    const steps: PipelineStepState[] = ORAL_WORKSHOP_STEPS.map((step, i) => ({
      step, stepOrder: i + 1, status: i === 0 ? 'pending' : 'done', retryCount: 0,
    }));
    assert.equal(nextPendingStep(steps)?.step, 'extract');
    const allDone = steps.map((s) => ({ ...s, status: 'done' as const }));
    assert.equal(nextPendingStep(allDone), null);
  });

  it('markStepDone：标记对应步骤 done 并写入产物，其余不变', () => {
    const steps: PipelineStepState[] = ORAL_WORKSHOP_STEPS.map((step, i) => ({
      step, stepOrder: i + 1, status: 'pending' as const, retryCount: 0,
    }));
    const updated = markStepDone(steps, 'rewrite', { script: '改后' });
    assert.equal(updated.find((s) => s.step === 'rewrite')?.status, 'done');
    assert.deepEqual(updated.find((s) => s.step === 'rewrite')?.resultJson, { script: '改后' });
    assert.equal(updated.filter((s) => s.status === 'done').length, 1);
  });

  it('markStepFailed：未达上限回 pending 并累加重试；超上限永久 failed', () => {
    const one = { step: 'extract', stepOrder: 1, status: 'pending' as const, retryCount: 0 };
    const r1 = markStepFailed([one], 'extract', 'err1');
    assert.equal(r1.permanentlyFailed, false);
    assert.equal(r1.steps[0].status, 'pending');
    assert.equal(r1.steps[0].retryCount, 1);
    assert.equal(r1.steps[0].error, 'err1');

    const r2 = markStepFailed([r1.steps[0]], 'extract', 'err2');
    assert.equal(r2.permanentlyFailed, false);
    assert.equal(r2.steps[0].retryCount, 2);

    const r3 = markStepFailed([r2.steps[0]], 'extract', 'err3');
    assert.equal(r3.permanentlyFailed, true);
    assert.equal(r3.steps[0].status, 'failed');
    assert.equal(r3.steps[0].retryCount, MAX_STEP_RETRIES);
  });
});

// ===== service（mock repository + mock billing） =====

interface FakeRepos {
  jobs: any[];
  steps: any[];
  calls: { freeze: number; refund: number; settle: number };
  billing: any;
  jobRepo: Repository<OralWorkshopJobEntity>;
  stepRepo: Repository<OralWorkshopStepEntity>;
}

function makeFakes(init: { jobs?: any[]; steps?: any[] } = {}): FakeRepos {
  const jobs = [...(init.jobs ?? [])];
  const steps = [...(init.steps ?? [])];
  const calls = { freeze: 0, refund: 0, settle: 0 };
  const billing = {
    estimateAndFreeze: async () => { calls.freeze += 1; return { id: 100 }; },
    refund: async () => { calls.refund += 1; },
    settleActualCost: async () => { calls.settle += 1; return {}; },
  };
  const jobRepo: any = {
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      if (w.clientTxnId !== undefined) return jobs.find((j) => j.clientTxnId === w.clientTxnId) ?? null;
      return jobs.find((j) => j.id === w.id && (w.userId === undefined || j.userId === w.userId)) ?? null;
    },
    find: async (opts: any) => {
      const where = opts?.where;
      if (!where) return jobs;
      const groups = Array.isArray(where) ? where : [where];
      return jobs.filter((j) =>
        groups.some((w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => j[k] === v)),
      );
    },
    findAndCount: async () => [jobs, jobs.length],
    create: (d: any) => ({ id: jobs.length + 1, ...d }),
    save: async (j: any) => {
      const idx = jobs.findIndex((x) => x.id === j.id);
      if (idx >= 0) jobs[idx] = j; else jobs.push(j);
      return j;
    },
    update: async (criteria: any, partial: any) => {
      const c = criteria ?? {};
      const isIn = (v: any) => v && typeof v === 'object' && v._type === 'in';
      const matched = jobs.filter((j) =>
        Object.entries(c as Record<string, any>).every(([k, v]) => (Array.isArray(v) ? v.includes(j[k]) : isIn(v) ? v._value.includes(j[k]) : j[k] === v)),
      );
      for (const j of matched) Object.assign(j, partial);
      return { affected: matched.length, raw: matched };
    },
  };
  const stepRepo: any = {
    find: async (opts: any) =>
      steps
        .filter((s) => !opts?.where || s.jobId === opts.where.jobId)
        .sort((a, b) => a.stepOrder - b.stepOrder),
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      const isIn = (v: any) => v && typeof v === 'object' && v._type === 'in';
      return (
        steps.find((s) => Object.entries(w as Record<string, any>).every(([k, v]) => (Array.isArray(v) ? v.includes(s[k]) : isIn(v) ? v._value.includes(s[k]) : s[k] === v))) ?? null
      );
    },
    create: (d: any) => d,
    save: async (rows: any[]) => { steps.length = 0; steps.push(...rows); return rows; },
    update: async (criteria: any, partial: any) => {
      const c = criteria ?? {};
      const isIn = (v: any) => v && typeof v === 'object' && v._type === 'in';
      const matched = steps.filter((s) =>
        Object.entries(c as Record<string, any>).every(([k, v]) => (Array.isArray(v) ? v.includes(s[k]) : isIn(v) ? v._value.includes(s[k]) : s[k] === v)),
      );
      for (const s of matched) Object.assign(s, partial);
      return { affected: matched.length, raw: matched };
    },
  };
  return { jobs, steps, calls, billing, jobRepo, stepRepo };
}

function fakeMembership() {
  return {
    ensureFeature: async () => ({ level: 'free', status: 'active', features: {}, expiresAt: null, graceDaysLeft: 0 }),
  };
}

function fakeVoiceRepo() {
  return {
    find: async () => [],
    findOne: async () => null,
    create: (d: any) => d,
    save: async (e: any) => e,
    remove: async () => undefined,
  };
}

function fakeDhRepo() {
  return {
    find: async () => [],
    findOne: async () => null,
    create: (d: any) => d,
    save: async (e: any) => e,
    remove: async () => undefined,
  };
}

function fakeLlm() {
  return {
    generateTopics: async () => [{ title: 'AI 效率工具盘点', persona_angle: '职场人', hook: '3 个工具' }],
  };
}

function newService(f: FakeRepos): OralWorkshopService {
  return new OralWorkshopService(
    f.jobRepo,
    f.stepRepo,
    fakeVoiceRepo() as any,
    fakeDhRepo() as any,
    f.billing,
    fakeMembership() as any,
    fakeLlm() as any,
  );
}

const fullSteps = (jobId: number, statuses: Array<'pending' | 'done'>): any[] =>
  ORAL_WORKSHOP_STEPS.map((step, i) => ({
    id: i + 1,
    jobId,
    step,
    stepOrder: i + 1,
    status: statuses[i] ?? 'pending',
    resultJson: null,
    error: null,
    retryCount: 0,
  }));

describe('OralWorkshopService', () => {
  it('create：clientTxnId 已存在时幂等返回，不重复预扣', async () => {
    const f = makeFakes({ jobs: [{ id: 7, userId: 1, status: 'pending', clientTxnId: 'abc' }] });
    const svc = newService(f);
    const item = await svc.create(1, { scriptInput: 'x', clientTxnId: 'abc' });
    assert.equal(item.id, 7);
    assert.equal(f.calls.freeze, 0);
  });

  it('create：新任务预扣 Credits、建 job + 7 个步骤', async () => {
    const f = makeFakes();
    const svc = newService(f);
    const item = await svc.create(1, { scriptInput: '你好', persona: '专家' });
    assert.equal(f.calls.freeze, 1);
    assert.equal(f.jobs.length, 1);
    assert.equal(f.jobs[0].userId, 1);
    assert.equal(f.jobs[0].status, 'pending');
    assert.equal(f.jobs[0].frozenTxnId, 100);
    assert.equal(f.steps.length, 7);
    assert.equal(item.status, 'pending');
  });

  it('get：不存在抛 NotFoundException', async () => {
    const f = makeFakes();
    const svc = newService(f);
    await assert.rejects(() => svc.get(1, 999), NotFoundException);
  });

  it('cancel：pending 任务取消并退款', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'pending', frozenTxnId: 100 }],
    });
    const svc = newService(f);
    const item = await svc.cancel(1, 1);
    assert.equal(f.jobs[0].status, 'cancelled');
    assert.equal(f.calls.refund, 1);
    assert.equal(item.status, 'cancelled');
  });

  it('cancel：done 任务不可取消', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'done', frozenTxnId: 100 }],
    });
    const svc = newService(f);
    await assert.rejects(() => svc.cancel(1, 1), BadRequestException);
    assert.equal(f.calls.refund, 0);
  });

  it('onModuleInit：回收孤儿任务并退款', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'pending', frozenTxnId: 100 }],
    });
    const svc = newService(f);
    await svc.onModuleInit();
    assert.equal(f.jobs[0].status, 'failed');
    assert.equal(f.calls.refund, 1);
  });

  it('markStepDone：全部完成后任务 done 并结算实际成本', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'processing', currentStep: 'publishReady', frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['done', 'done', 'done', 'done', 'done', 'done', 'pending']),
    });
    const svc = newService(f);
    await svc.markStepDone(1, 'publishReady', { url: 'https://cdn/v.mp4' });
    assert.equal(f.jobs[0].status, 'done');
    assert.equal(f.jobs[0].currentStep, null);
    assert.equal(f.calls.settle, 1);
  });

  it('markStepFailed：重试两次后第三次永久失败并退款', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'processing', currentStep: 'extract', frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['pending']),
    });
    const svc = newService(f);
    await svc.markStepFailed(1, 'extract', 'err1');
    await svc.markStepFailed(1, 'extract', 'err2');
    assert.equal(f.steps[0].status, 'pending');
    assert.equal(f.steps[0].retryCount, 2);
    assert.equal(f.calls.refund, 0);

    await svc.markStepFailed(1, 'extract', 'err3');
    assert.equal(f.steps[0].status, 'failed');
    assert.equal(f.jobs[0].status, 'failed');
    assert.equal(f.calls.refund, 1);
  });

  it('markStepDone：中间步骤推进 currentStep 到下一 pending 步', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'processing', currentStep: 'extract', frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['pending']),
    });
    const svc = newService(f);
    await svc.markStepDone(1, 'extract', { ok: true });
    assert.equal(f.jobs[0].status, 'processing');
    assert.equal(f.jobs[0].currentStep, 'rewrite');
    assert.equal(f.calls.settle, 0);
  });

  it('DEFAULT_ESTIMATED_CREDITS 为 21', () => {
    assert.equal(DEFAULT_ESTIMATED_CREDITS, 21);
  });

  it('markStepRunning：步骤置 running + startedAt，任务置 processing 且 currentStep 指向该步', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'pending', currentStep: null, frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['pending']),
    });
    const svc = newService(f);
    await svc.markStepRunning(1, 'extract');
    assert.equal(f.steps[0].status, 'running');
    assert.ok(f.steps[0].startedAt instanceof Date);
    assert.equal(f.jobs[0].status, 'processing');
    assert.equal(f.jobs[0].currentStep, 'extract');
  });

  it('markStepDone：rewritten_script 产物回填任务 rewrittenScript 列', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'processing', currentStep: 'rewrite', frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['done', 'pending']),
    });
    const svc = newService(f);
    await svc.markStepDone(1, 'rewrite', { rewritten_script: '改写后的文案' });
    assert.equal(f.jobs[0].rewrittenScript, '改写后的文案');
    assert.ok(f.steps[1].finishedAt instanceof Date);
  });

  it('markStepFailed：永久失败时步骤记录 finishedAt', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'processing', currentStep: 'extract', frozenTxnId: 100, creditsCost: 0 }],
      steps: fullSteps(1, ['pending']),
    });
    const svc = newService(f);
    await svc.markStepFailed(1, 'extract', 'err1');
    await svc.markStepFailed(1, 'extract', 'err2');
    await svc.markStepFailed(1, 'extract', 'err3');
    assert.ok(f.steps[0].finishedAt instanceof Date);
  });

  it('findExecutableJobs：返回 pending/processing 任务且限量', async () => {
    const f = makeFakes({
      jobs: [
        { id: 1, userId: 1, status: 'pending' },
        { id: 2, userId: 1, status: 'processing' },
        { id: 3, userId: 1, status: 'done' },
      ],
    });
    const svc = newService(f);
    const jobs = await svc.findExecutableJobs(5);
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs.map((j) => j.id).sort(), [1, 2]);
  });

  it('nextPendingStepOf：返回第一个 pending 步骤名', async () => {
    const f = makeFakes({
      jobs: [{ id: 1, userId: 1, status: 'pending' }],
      steps: fullSteps(1, ['done', 'pending']),
    });
    const svc = newService(f);
    assert.equal(await svc.nextPendingStepOf(1), 'rewrite');
  });
});

describe('OralWorkshopService 执行模式（auto/manual/single）', () => {
  it('create：manual 模式创建后 executionMode=manual 且 waitingStep=extract（暂停等待放行）', async () => {
    const f = makeFakes();
    const svc = newService(f);
    const item = await svc.create(1, { scriptInput: 'x', executionMode: 'manual' });
    assert.equal(item.executionMode, 'manual');
    assert.equal(item.waitingStep, 'extract');
  });

  it('create：auto 模式（默认）无 waitingStep', async () => {
    const f = makeFakes();
    const svc = newService(f);
    const item = await svc.create(1, { scriptInput: 'x' });
    assert.equal(item.executionMode, 'auto');
    assert.equal(item.waitingStep, null);
  });

  it('findExecutableJobs：跳过 manual 模式暂停中（waitingStep 非空）的任务', async () => {
    const f = makeFakes({
      jobs: [
        { id: 1, userId: 1, status: 'pending', executionMode: 'auto' },
        { id: 2, userId: 1, status: 'pending', executionMode: 'manual', waitingStep: 'extract' },
        { id: 3, userId: 1, status: 'pending', executionMode: 'manual', waitingStep: null },
      ],
    });
    const svc = newService(f);
    const rows = await svc.findExecutableJobs(10);
    assert.deepEqual(rows.map((r) => r.id).sort(), [1, 3]);
  });

  it('advance：清除 waitingStep 放行；auto 模式任务拒绝推进', async () => {
    const f = makeFakes({
      jobs: [{ id: 9, userId: 1, status: 'processing', executionMode: 'manual', waitingStep: 'rewrite' }],
    });
    const svc = newService(f);
    const item = await svc.advance(1, 9);
    assert.equal(item.waitingStep, null);
    await assert.rejects(() => svc.advance(1, 99), NotFoundException);

    const f2 = makeFakes({ jobs: [{ id: 10, userId: 1, status: 'processing', executionMode: 'auto' }] });
    const svc2 = newService(f2);
    await assert.rejects(() => svc2.advance(1, 10), BadRequestException);
  });

  it('nextPendingStepOf：manual 暂停中返回 null，放行后返回 pending 步骤', async () => {
    const f = makeFakes({
      jobs: [{ id: 11, userId: 1, status: 'pending', executionMode: 'manual', waitingStep: 'extract' }],
      steps: fullSteps(11, ['pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending']),
    });
    const svc = newService(f);
    assert.equal(await svc.nextPendingStepOf(11), null);
    f.jobs[0].waitingStep = null;
    assert.equal(await svc.nextPendingStepOf(11), 'extract');
  });

  it('markStepDone：manual 模式完成一步后暂停到下一步（waitingStep=下一步）', async () => {
    const f = makeFakes({
      jobs: [{ id: 12, userId: 1, status: 'processing', executionMode: 'manual', waitingStep: null, frozenTxnId: 100 }],
      steps: fullSteps(12, ['pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending']),
    });
    const svc = newService(f);
    await svc.markStepDone(12, 'extract', { chars: 2 });
    assert.equal(f.jobs[0].waitingStep, 'rewrite');
    assert.equal(f.jobs[0].currentStep, 'rewrite');
  });

  it('markStepDone：manual 模式最后一步完成后任务 done，不暂停', async () => {
    const f = makeFakes({
      jobs: [{ id: 13, userId: 1, status: 'processing', executionMode: 'manual', waitingStep: 'publishReady', frozenTxnId: 100 }],
      steps: fullSteps(13, ['done', 'done', 'done', 'done', 'done', 'done', 'pending']),
    });
    const svc = newService(f);
    await svc.markStepDone(13, 'publishReady', { ready: true });
    assert.equal(f.jobs[0].status, 'done');
    assert.equal(f.jobs[0].waitingStep, null);
  });
});

