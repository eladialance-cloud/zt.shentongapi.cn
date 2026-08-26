/** 口播工坊流水线全链路集成测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-flow.spec.ts
 *
 * 覆盖（真实 OralWorkshopService + 真实 OralWorkshopExecutor + fake 外部依赖）：
 * - auto 模式：extract→rewrite→voiceClone→digitalHuman→videoEdit→titleCover→publishReady 全链路按序跑通
 * - 步骤间产物交接：voiceClone.audio_path → digitalHuman → videoEdit；videoEdit.video_url → titleCover
 * - 任务产物回填与持久化：rewrittenScript / videoUrl / coverUrl / coverH1 / coverH2，结算一次、无退款
 * - 步骤失败传播：rewrite 连续失败达上限后任务 failed 并退款，后续步骤不再执行
 * - manual 模式：每步之间 waitingStep 暂停，advance 放行后执行下一步，末步自动 done
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OralWorkshopService } from '../../src/modules/oral-workshop/oral-workshop.service';
import { OralWorkshopExecutor } from '../../src/modules/oral-workshop/oral-workshop.executor';
import type { OralWorkshopLlmService } from '../../src/modules/oral-workshop/llm';
import type { FfmpegRunner } from '../../src/modules/oral-workshop/ffmpeg';
import { MAX_STEP_RETRIES } from '../../src/modules/oral-workshop/oral-workshop.pipeline';
import type { Repository } from 'typeorm';
import type { OralWorkshopJobEntity } from '../../src/modules/oral-workshop/entities/oral-workshop-job.entity';
import type { OralWorkshopStepEntity } from '../../src/modules/oral-workshop/entities/oral-workshop-step.entity';

// ===== fakes =====

interface Fakes {
  jobs: any[];
  steps: any[];
  calls: { freeze: number; refund: number; settle: number };
  billing: any;
  jobRepo: Repository<OralWorkshopJobEntity>;
  stepRepo: Repository<OralWorkshopStepEntity>;
}

function makeFakes(): Fakes {
  const jobs: any[] = [];
  const steps: any[] = [];
  const calls = { freeze: 0, refund: 0, settle: 0 };
  const billing = {
    estimateAndFreeze: async () => { calls.freeze += 1; return { id: 100 }; },
    refund: async () => { calls.refund += 1; },
    settleActualCost: async () => { calls.settle += 1; return {}; },
  };
  const jobRepo: any = {
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      return jobs.find((j) => Object.entries(w).every(([k, v]) => (v && typeof v === 'object' && (v as any)._type === 'in' ? ((v as { _value: unknown[] })._value as unknown[]).includes(j[k]) : j[k] === v))) ?? null;
    },
    find: async (opts: any) => {
      const where = opts?.where;
      if (!where) return jobs;
      const groups = Array.isArray(where) ? where : [where];
      const rows = jobs.filter((j) => groups.some((w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => j[k] === v)));
      return opts?.order?.createdAt === 'DESC' ? [...rows].reverse() : rows;
    },
    findAndCount: async () => [jobs, jobs.length],
    create: (d: any) => ({ id: jobs.length + 1, createdAt: new Date(), updatedAt: new Date(), status: 'pending', creditsCost: 0, ...d }),
    save: async (j: any) => {
      const idx = jobs.findIndex((x) => x.id === j.id);
      if (idx >= 0) jobs[idx] = j; else jobs.push(j);
      return j;
    },
    update: async (criteria: any, partial: any) => {
      const c = criteria ?? {};
      const isIn = (v: unknown) => !!v && typeof v === 'object' && (v as { _type?: string })._type === 'in';
      const matched = jobs.filter((j) =>
        Object.entries(c).every(([k, v]) => (Array.isArray(v) ? v.includes(j[k]) : isIn(v) ? ((v as { _value: unknown[] })._value as unknown[]).includes(j[k]) : j[k] === v)),
      );
      for (const j of matched) Object.assign(j, partial);
      return { affected: matched.length, raw: matched };
    },
  };
  let stepNextId = 1;
  const stepRepo: any = {
    find: async (opts: any) =>
      steps
        .filter((s) => !opts?.where || Object.entries(opts.where).every(([k, v]) => s[k] === v))
        .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0)),
    findOne: async (opts: any) => {
      const w = opts?.where ?? {};
      const isIn = (v: unknown) => !!v && typeof v === 'object' && (v as { _type?: string })._type === 'in';
      return steps.find((s) => Object.entries(w).every(([k, v]) => (Array.isArray(v) ? v.includes(s[k]) : isIn(v) ? ((v as { _value: unknown[] })._value as unknown[]).includes(s[k]) : s[k] === v))) ?? null;
    },
    create: (d: any) => ({ id: stepNextId++, ...d }),
    save: async (rows: any[]) => { steps.length = 0; steps.push(...rows); return rows; },
    update: async (criteria: any, partial: any) => {
      const c = criteria ?? {};
      const isIn = (v: unknown) => !!v && typeof v === 'object' && (v as { _type?: string })._type === 'in';
      const matched = steps.filter((s) =>
        Object.entries(c).every(([k, v]) => (Array.isArray(v) ? v.includes(s[k]) : isIn(v) ? ((v as { _value: unknown[] })._value as unknown[]).includes(s[k]) : s[k] === v)),
      );
      for (const s of matched) Object.assign(s, partial);
      return { affected: matched.length, raw: matched };
    },
  };
  return { jobs, steps, calls, billing, jobRepo, stepRepo };
}

function fakeAccountRepo() {
  return {
    find: async () => [],
    findOne: async () => null,
    create: (d: any) => d,
    save: async (e: any) => e,
    remove: async () => undefined,
  };
}

function fakeMediaRepo() {
  return {
    find: async () => [],
    findOne: async () => null,
    create: (d: any) => d,
    save: async (e: any) => e,
    remove: async () => undefined,
  };
}

function fakeSystemLlm() {
  return {
    stt: async () => 'x',
    chat: async () => 'x',
    embed: async () => [[]],
    resolveTarget: async () => null,
  };
}

/** LLM fake：改写返回长文案，标题返回 主标题/副标题 两行 */
function fakeLlm(opts: { failRewrite?: boolean } = {}): OralWorkshopLlmService {
  return {
    rewriteScript: async (script: string) => {
      if (opts.failRewrite) throw new Error('上游超时');
      return '这是一段改写后的口播文案，内容足够长以支持后续字幕与合成步骤。今天分享三个高效方法，第一点先做减法，第二点聚焦核心，第三点坚持复盘。只要你按这个方法执行，就一定能看到改变。';
    },
    generateTitle: async () => '主标题：三个方法\n副标题：高效执行',
    translateBilingual: async () => [],
    translateSubtitles: async () => [],
    createScript: async () => 'x',
    generateTopics: async () => [],
    keywordTopics: async () => ({ keyword_analysis: 'x', topics: [] }),
    styleAnalysis: async () => ({ style_analysis: 'x', topics: [] }),
    legalReview: async () => ({ risk_level: 'low', issues: [], safe_script: 'x' }),
    generateCoverTitle: async () => ({ h1: '主标题', h2: '副标题' }),
    generatePublishPackage: async () => ({ title: 't', subtitle: 's', description: 'd', topic_tags: [] }),
  } as unknown as OralWorkshopLlmService;
}

/** fake ffmpeg：记录命令，并按命令最后一个参数创建产物文件（模拟合成产出，供下游步骤/persistArtifact 读取） */
function makeRunner(commands: string[][]) {
  const runner: FfmpegRunner = async (cmd) => {
    commands.push(cmd);
    const out = cmd[cmd.length - 1];
    if (out && !out.startsWith('-') && /\.(mp4|png|wav|mp3|jpg|jpeg|webm|mov|ass)$/i.test(out)) {
      const dir = path.dirname(out);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, '');
    }
  };
  return runner;
}

const tempDirs: string[] = [];
function makeOutputDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-flow-'));
  tempDirs.push(dir);
  return dir;
}

const uploadsFixtures: string[] = [];
function makeUploadsFixtureFile(name: string, content: string): string {
  const dir = path.join(process.cwd(), 'uploads', '.test-fixtures-flow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(dir, { recursive: true });
  uploadsFixtures.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return '/uploads/' + path.basename(dir) + '/' + name;
}

const artifactDirs: string[] = [];

afterEach(() => {
  delete process.env.ORAL_WORKSHOP_OUTPUT_DIR;
  delete process.env.ORAL_WORKSHOP_BADGE_IMAGE;
  delete process.env.ORAL_WORKSHOP_VOICE_ENGINE;
  delete process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE;
  delete process.env.VOLCANO_ARK_API_KEY;
  delete process.env.VOLCANO_VOICE_MODEL;
  delete process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  for (const dir of uploadsFixtures.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  for (const dir of artifactDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** 跑一个任务直到 done/failed（auto 模式），返回每个 running 步骤名 */
async function runUntilEnd(service: OralWorkshopService, exec: OralWorkshopExecutor, jobId: number): Promise<string[]> {
  const running: string[] = [];
  let guard = 0;
  while (guard++ < 30) {
    const jobs = await service.findExecutableJobs(5);
    if (jobs.length === 0) break;
    for (const j of jobs) {
      if (j.id !== jobId) continue;
      const snapshot = await service.get(7, jobId);
      if (snapshot.status === 'done' || snapshot.status === 'failed' || snapshot.status === 'cancelled') return running;
      const before = await service.nextPendingStepOf(jobId);
      if (!before) continue;
      await exec.processJob(j);
      running.push(before);
      const after = await service.get(7, jobId);
      if (after.status === 'done' || after.status === 'failed') return running;
    }
  }
  return running;
}

describe('口播工坊全链路（真实 Service + 真实 Executor）', () => {
  it('auto 模式：7 步按序执行、产物交接、回填持久化、结算一次', async () => {
    const f = makeFakes();
    const service = new OralWorkshopService(
      f.jobRepo,
      f.stepRepo,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      f.billing,
      fakeLlm() as any,
      fakeSystemLlm() as any,
    );
    const audioUrl = makeUploadsFixtureFile('voice.mp3', 'fake-mp3');
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    const commands: string[][] = [];
    const exec = new OralWorkshopExecutor(service, fakeLlm() as any, makeRunner(commands));

    const item = await service.create(7, { scriptInput: '原始口播文案内容', persona: '职场教练', audioUrl, executionMode: 'auto' });
    const jobId = item.id;
    artifactDirs.push(path.join(process.cwd(), 'uploads', 'oral-workshop', String(jobId)));

    const running = await runUntilEnd(service, exec, jobId);

    // 1) 步骤严格按序执行
    assert.deepEqual(running, ['extract', 'rewrite', 'voiceClone', 'digitalHuman', 'videoEdit', 'titleCover', 'publishReady']);

    // 2) 任务终态 + 结算一次 + 无退款
    const done = await service.get(7, jobId);
    assert.equal(done.status, 'done');
    assert.equal(f.calls.settle, 1);
    assert.equal(f.calls.refund, 0);
    const steps = f.steps;
    assert.ok(steps.length === 7 && steps.every((s: any) => s.status === 'done'), '7 个步骤全部 done');

    // 3) 产物回填：改写文案 / 主副标题
    assert.equal(done.rewrittenScript, '这是一段改写后的口播文案，内容足够长以支持后续字幕与合成步骤。今天分享三个高效方法，第一点先做减法，第二点聚焦核心，第三点坚持复盘。只要你按这个方法执行，就一定能看到改变。');
    assert.equal(done.coverH1, '主标题：三个方法');
    assert.equal(done.coverH2, '副标题：高效执行');

    // 4) 产物持久化：videoUrl / coverUrl 转为 /uploads/oral-workshop/<jobId>/ 公网路径
    assert.ok(String(done.videoUrl).startsWith('/uploads/oral-workshop/' + jobId + '/'), '成片已持久化: ' + done.videoUrl);
    assert.ok(String(done.coverUrl).startsWith('/uploads/oral-workshop/' + jobId + '/'), '封面已持久化: ' + done.coverUrl);
    const persistedVideo = path.join(process.cwd(), String(done.videoUrl).replace(/^\//, ''));
    const persistedCover = path.join(process.cwd(), String(done.coverUrl).replace(/^\//, ''));
    assert.ok(fs.existsSync(persistedVideo), '成片文件存在');
    assert.ok(fs.existsSync(persistedCover), '封面文件存在');

    // 5) 步骤间产物交接契约：
    //    voiceClone 产物含 audio_path（真实文件）
    const voiceResult = (await service.getStepResults(jobId)).voiceClone as any;
    assert.ok(voiceResult?.audio_path && fs.existsSync(String(voiceResult.audio_path)), 'voiceClone 产出 audio_path 文件');
    //    digitalHuman 的 ffmpeg 命令以 voiceClone 音频为输入
    const dhCmd = commands.find((c) => c.some((a) => a.includes('human.mp4'))) ?? [];
    assert.ok(dhCmd.some((a) => String(a).includes(path.basename(String(voiceResult.audio_path)))), 'digitalHuman 使用 voiceClone 音频');
    //    videoEdit 合成命令同时引用人声轨与数字人视频
    const veCmds = commands.filter((c) => c.some((a) => a.includes('final.mp4')) || c.some((a) => a.includes('subtitles')));
    assert.ok(veCmds.length >= 1, 'videoEdit 有合成命令');
    const videoEditResults = (await service.getStepResults(jobId)).videoEdit as any;
    assert.ok(videoEditResults?.video_url && fs.existsSync(String(videoEditResults.video_url)), 'videoEdit 产出成片文件');
    //    titleCover 命令以成片为输入
    const tcCmd = commands.find((c) => c.some((a) => a.includes('cover.png'))) ?? [];
    assert.ok(tcCmd.some((a) => String(a).includes(path.basename(String(videoEditResults.video_url)))), 'titleCover 使用 videoEdit 成片');
  });

  it('步骤失败传播：rewrite 连续失败达上限 → 任务 failed 并退款，后续步骤不执行', async () => {
    const f = makeFakes();
    const service = new OralWorkshopService(
      f.jobRepo,
      f.stepRepo,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      f.billing,
      fakeLlm({ failRewrite: true }) as any,
      fakeSystemLlm() as any,
    );
    const audioUrl = makeUploadsFixtureFile('voice.mp3', 'fake-mp3');
    const exec = new OralWorkshopExecutor(service, fakeLlm({ failRewrite: true }) as any, makeRunner([]));

    const item = await service.create(7, { scriptInput: 'x', audioUrl, executionMode: 'auto' });
    const jobId = item.id;
    const running = await runUntilEnd(service, exec, jobId);

    assert.deepEqual(running, ['extract', 'rewrite', 'rewrite', 'rewrite']);
    const failed = await service.get(7, jobId);
    assert.equal(failed.status, 'failed');
    assert.ok(String(failed.error).includes('上游超时'));
    assert.equal(f.calls.refund, 1, '永久失败后退款一次');
    assert.equal(f.calls.settle, 0, '失败不结算');
    const rewriteStep = f.steps.find((s: any) => s.step === 'rewrite');
    assert.equal(rewriteStep.status, 'failed');
    assert.equal(rewriteStep.retryCount, MAX_STEP_RETRIES);
    const later = f.steps.filter((s: any) => !['extract', 'rewrite'].includes(s.step));
    assert.ok(later.every((s: any) => s.status === 'pending'), '后续步骤保持 pending');
  });

  it('manual 模式：每步之间 waitingStep 暂停，advance 放行后逐布执行', async () => {
    const f = makeFakes();
    const service = new OralWorkshopService(
      f.jobRepo,
      f.stepRepo,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      fakeAccountRepo() as any,
      fakeMediaRepo() as any,
      f.billing,
      fakeLlm() as any,
      fakeSystemLlm() as any,
    );
    const audioUrl = makeUploadsFixtureFile('voice.mp3', 'fake-mp3');
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    const commands: string[][] = [];
    const exec = new OralWorkshopExecutor(service, fakeLlm() as any, makeRunner(commands));

    const item = await service.create(7, { scriptInput: 'x', audioUrl, executionMode: 'manual' });
    const jobId = item.id;
    artifactDirs.push(path.join(process.cwd(), 'uploads', 'oral-workshop', String(jobId)));
    assert.equal(item.waitingStep, 'extract');

    const expectedPause = ['rewrite', 'voiceClone', 'digitalHuman', 'videoEdit', 'titleCover', 'publishReady', null];
    const running: string[] = [];
    for (let i = 0; i < 7; i++) {
      // 暂停中：执行器不取到该任务
      const queued = await service.findExecutableJobs(5);
      assert.equal(queued.length, 0, 'waitingStep 暂停期间不被执行');
      await service.advance(7, jobId);
      const jobs = await service.findExecutableJobs(5);
      assert.equal(jobs.length, 1, 'advance 放行后可执行');
      const stepBefore = await service.nextPendingStepOf(jobId);
      assert.ok(stepBefore, '有下一个待执行步骤');
      const ok = await exec.processJob(jobs[0]);
      assert.equal(ok, true);
      running.push(stepBefore as string);
      const state = await service.get(7, jobId);
      assert.equal(state.waitingStep, expectedPause[i], '完成后暂停到下一步（' + (expectedPause[i] ?? '结束') + '）');
    }
    assert.deepEqual(running, ['extract', 'rewrite', 'voiceClone', 'digitalHuman', 'videoEdit', 'titleCover', 'publishReady']);
    const done = await service.get(7, jobId);
    assert.equal(done.status, 'done');
    assert.equal(f.calls.settle, 1);
  });
});
