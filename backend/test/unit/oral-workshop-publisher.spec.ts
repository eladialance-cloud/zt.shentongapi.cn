/** 口播工坊发布包导出（M6-4）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OralWorkshopPublisher,
  deriveTopicTags,
  suggestedPublishTime,
} from '../../src/modules/oral-workshop/publisher';

function makeJobRepo(job: any) {
  const saved: any[] = [];
  return {
    repo: {
      findOne: async () => job,
      save: async (j: any) => { saved.push(j); return j; },
    },
    saved,
  };
}

function makeStepRepo(rows: any[]) {
  return { findOne: async ({ where }: any) => rows.find((r) => r.step === where.step) ?? null };
}

function fakeLlm() {
  return {
    generatePublishPackage: async () => null,
  };
}

function makePublishService() {
  const created: any[] = [];
  return {
    service: { createPlan: async (_userId: number, data: any) => { const plan = { id: 99, ...data }; created.push(plan); return plan; } },
    created,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 7,
    status: 'done',
    videoUrl: 'https://oss/final.mp4',
    coverUrl: 'https://oss/cover.png',
    rewrittenScript: '今天分享三个高效方法。第一点先做减法。第二点聚焦核心。',
    publishPlanId: null,
    ...overrides,
  };
}

describe('OralWorkshopPublisher', () => {
  it('exportPackage：任务 done 时生成发布包并创建 create_publish_plans 记录', async () => {
    const job = makeJob();
    const { repo: jobRepo, saved } = makeJobRepo(job);
    const stepRepo = makeStepRepo([{ step: 'titleCover', resultJson: { title_h1: '主标题', title_h2: '副标题' } }]);
    const { service: publishService, created } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    const pkg = await pub.exportPackage(7, 1);
    assert.equal(pkg.job_id, 1);
    assert.equal(pkg.title, '主标题');
    assert.equal(pkg.subtitle, '副标题');
    assert.equal(pkg.video_url, 'https://oss/final.mp4');
    assert.equal(pkg.cover_url, 'https://oss/cover.png');
    assert.ok(Array.isArray(pkg.topic_tags) && pkg.topic_tags.length > 0);
    assert.ok(pkg.description.includes('主标题'));
    assert.deepEqual(pkg.target_platforms, ['douyin']);
    assert.ok(pkg.suggested_time.length >= 20);
    assert.equal(pkg.plan_id, 99);
    assert.equal(created.length, 1);
    assert.equal(created[0].title, '主标题');
    assert.deepEqual(created[0].mediaUrls, ['https://oss/final.mp4', 'https://oss/cover.png']);
    assert.equal(created[0].mode, 'manual');
    assert.equal(saved.length, 1);
    assert.equal(job.publishPlanId, 99);
  });

  it('exportPackage：已有 publish_plan_id 时幂等返回不重复建单', async () => {
    const job = makeJob({ publishPlanId: 42 });
    const { repo: jobRepo, saved } = makeJobRepo(job);
    const stepRepo = makeStepRepo([]);
    const { service: publishService, created } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    const pkg = await pub.exportPackage(7, 1);
    assert.equal(pkg.plan_id, 42);
    assert.equal(created.length, 0);
    assert.equal(saved.length, 0);
  });

  it('exportPackage：任务未完成时抛 BadRequest', async () => {
    const job = makeJob({ status: 'processing' });
    const { repo: jobRepo } = makeJobRepo(job);
    const stepRepo = makeStepRepo([]);
    const { service: publishService } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    await assert.rejects(() => pub.exportPackage(7, 1), /任务未完成/);
  });

  it('exportPackage：无成片时抛 BadRequest', async () => {
    const job = makeJob({ videoUrl: null });
    const { repo: jobRepo } = makeJobRepo(job);
    const stepRepo = makeStepRepo([]);
    const { service: publishService } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    await assert.rejects(() => pub.exportPackage(7, 1), /缺少成片/);
  });

  it('exportPackage：任务不存在抛 BadRequest', async () => {
    const { repo: jobRepo } = makeJobRepo(null);
    const stepRepo = makeStepRepo([]);
    const { service: publishService } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    await assert.rejects(() => pub.exportPackage(7, 999), /任务不存在/);
  });

  it('exportPackage：无 titleCover 产物时按文案兜底标题', async () => {
    const job = makeJob();
    const { repo: jobRepo } = makeJobRepo(job);
    const stepRepo = makeStepRepo([]);
    const { service: publishService } = makePublishService();
    const pub = new OralWorkshopPublisher(jobRepo as any, stepRepo as any, publishService as any, fakeLlm() as any);
    const pkg = await pub.exportPackage(7, 1);
    assert.ok(pkg.title.length > 0);
    assert.ok(pkg.topic_tags.length > 0);
  });

  it('deriveTopicTags：从文案抽取去重标签', () => {
    const tags = deriveTopicTags('第一件事。第二件事。第三件事。');
    assert.ok(tags.length >= 1 && tags.length <= 3);
    assert.equal(new Set(tags).size, tags.length);
  });

  it('suggestedPublishTime：返回次日 20:00 的 ISO 时间', () => {
    const t = suggestedPublishTime(new Date('2026-08-24T10:00:00Z'));
    const d = new Date(t);
    assert.equal(d.getUTCHours(), 12); // UTC 20:00 - 8h (Asia/Shanghai 视为本地时区推导)
  });
});
