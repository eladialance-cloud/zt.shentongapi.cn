/**
 * StatisticsService.getUserOverview 单元测试
 * 覆盖：weekPublished 边界（近 7 天含/不含、publishedAt 空回退 createdAt）、
 *       weekCompletedTasks 双源聚合（agent_task success + team_tasks completed）、
 *       assetCount / pendingReview 计数、publishTrend30d 补零与升序、
 *       platformDist 多平台平铺、跨用户隔离（非本人数据不计）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatisticsService } from '../../src/modules/statistics/services/statistics.service';
import type { PublishPlanEntity } from '../../src/modules/channel/entities/publish-plan.entity';
import type { AgentTaskEntity } from '../../src/modules/task/entities/agent-task.entity';
import type { TeamTaskEntity } from '../../src/modules/team/entities/team-task.entity';
import type { MediaAssetEntity } from '../../src/modules/media-assets/entities/media-asset.entity';

/** 最小内存 Repository mock：支持 find（where 等值匹配）与 count */
function makeRepo<T>(seed: T[] = []) {
  const rows: T[] = [...seed];
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([key, value]) => (row as any)[key] === value);
  return {
    rows,
    find: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)),
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
  };
}

function makeService(
  opts: {
    plans?: PublishPlanEntity[];
    agentTasks?: AgentTaskEntity[];
    teamTasks?: TeamTaskEntity[];
    assets?: MediaAssetEntity[];
  } = {},
) {
  const publishPlanRepo = makeRepo(opts.plans ?? []);
  const agentTaskRepo = makeRepo(opts.agentTasks ?? []);
  const teamTaskRepo = makeRepo(opts.teamTasks ?? []);
  const mediaAssetRepo = makeRepo(opts.assets ?? []);
  const svc = new StatisticsService(
    publishPlanRepo as any,
    agentTaskRepo as any,
    teamTaskRepo as any,
    mediaAssetRepo as any,
  );
  return { svc, publishPlanRepo, agentTaskRepo, teamTaskRepo, mediaAssetRepo };
}

/** 本地时区当天 0 点（与 service 口径一致） */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function dayKey(d: Date): string {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

const NOW = new Date();
const WEEK_START = (() => {
  const d = startOfDay(NOW);
  d.setDate(d.getDate() - 6);
  return d;
})();

function plan(overrides: Partial<PublishPlanEntity> = {}): PublishPlanEntity {
  return {
    id: 1,
    userId: 1,
    title: '测试计划',
    targetPlatforms: [],
    mode: 'manual',
    status: 'published',
    reviewStatus: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as PublishPlanEntity;
}

function agentTask(overrides: Partial<AgentTaskEntity> = {}): AgentTaskEntity {
  return {
    id: 1,
    userId: 1,
    taskType: 'multi_agent',
    status: 'success',
    creditsCost: 0,
    creditsFrozen: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as AgentTaskEntity;
}

function teamTask(overrides: Partial<TeamTaskEntity> = {}): TeamTaskEntity {
  return {
    id: 1,
    teamId: 1,
    title: '团队任务',
    creatorId: 1,
    status: 'completed',
    priority: 'medium',
    createdAt: NOW,
    ...overrides,
  } as TeamTaskEntity;
}

function asset(overrides: Partial<MediaAssetEntity> = {}): MediaAssetEntity {
  return {
    id: 1,
    userId: 1,
    sourceType: 'manual',
    bizType: 'media',
    title: '素材',
    assetType: 'file',
    url: 'https://example.com/a.png',
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as MediaAssetEntity;
}

describe('StatisticsService.getUserOverview', () => {
  it('weekPublished：近 7 天边界含当天 0 点，7 天前不含', async () => {
    const inside = new Date(WEEK_START); // 恰好窗口起点（含）
    const outside = new Date(WEEK_START.getTime() - 1); // 起点前 1ms（不含）
    const older = new Date(WEEK_START.getTime() - 86400000 * 3);
    const { svc } = makeService({
      plans: [
        plan({ id: 1, publishedAt: inside }),
        plan({ id: 2, publishedAt: outside }),
        plan({ id: 3, publishedAt: older }),
      ],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.weekPublished, 1);
  });

  it('weekPublished：publishedAt 为空回退 createdAt，且非 published 不计', async () => {
    const inWeek = new Date(WEEK_START.getTime() + 3600000);
    const oldCreated = new Date(WEEK_START.getTime() - 86400000);
    const { svc } = makeService({
      plans: [
        plan({ id: 1, publishedAt: undefined, createdAt: inWeek }),
        plan({ id: 2, publishedAt: undefined, createdAt: oldCreated }),
        plan({ id: 3, status: 'draft', publishedAt: undefined, createdAt: inWeek }),
      ],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.weekPublished, 1);
  });

  it('weekCompletedTasks：agent_task success + team_tasks completed 双源聚合', async () => {
    const inWeek = new Date(WEEK_START.getTime() + 3600000);
    const { svc } = makeService({
      agentTasks: [
        agentTask({ id: 1, finishedAt: inWeek }),
        agentTask({ id: 2, finishedAt: new Date(WEEK_START.getTime() - 1) }),
        agentTask({ id: 3, status: 'failed', finishedAt: inWeek }),
      ],
      teamTasks: [
        teamTask({ id: 1, completedAt: inWeek }),
        teamTask({ id: 2, status: 'in_progress', completedAt: inWeek }),
        teamTask({ id: 3, completedAt: new Date(WEEK_START.getTime() - 1) }),
      ],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.weekCompletedTasks, 2);
  });

  it('assetCount / pendingReview 按 userId 计数', async () => {
    const { svc } = makeService({
      plans: [
        plan({ id: 1, status: 'pending_review' }),
        plan({ id: 2, status: 'pending_review' }),
        plan({ id: 3, status: 'published' }),
      ],
      assets: [asset({ id: 1 }), asset({ id: 2 }), asset({ id: 3 })],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.assetCount, 3);
    assert.equal(res.pendingReview, 2);
  });

  it('publishTrend30d：30 天补零、升序、按 publishedAt 日期聚合', async () => {
    const today = startOfDay(NOW);
    const first = new Date(today);
    first.setDate(today.getDate() - 29); // 窗口首日
    const mid = new Date(today);
    mid.setDate(today.getDate() - 5);
    const outside = new Date(today);
    outside.setDate(today.getDate() - 31);
    const { svc } = makeService({
      plans: [
        plan({ id: 1, publishedAt: first }),
        plan({ id: 2, publishedAt: mid }),
        plan({ id: 3, publishedAt: mid }),
        plan({ id: 4, publishedAt: outside }),
      ],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.publishTrend30d.length, 30);
    const dates = res.publishTrend30d.map((p) => p.date);
    assert.equal(dates[0], dayKey(first));
    assert.equal(dates[29], dayKey(today));
    assert.deepEqual(dates, [...dates].sort());
    const midKey = dayKey(mid);
    assert.equal(res.publishTrend30d.find((p) => p.date === midKey)!.count, 2);
    assert.equal(res.publishTrend30d.find((p) => p.date === dates[0])!.count, 1);
    // 窗口外不计，其余日期补零
    const total = res.publishTrend30d.reduce((s, p) => s + p.count, 0);
    assert.equal(total, 3);
  });

  it('platformDist：同一计划多平台各计一次，仅统计已发布计划', async () => {
    const { svc } = makeService({
      plans: [
        plan({ id: 1, targetPlatforms: ['douyin', 'xiaohongshu'] }),
        plan({ id: 2, targetPlatforms: ['douyin'] }),
        plan({ id: 3, status: 'draft', targetPlatforms: ['weibo'] }),
      ],
    });
    const res = await svc.getUserOverview(1);
    assert.deepEqual(res.platformDist, [
      { platform: 'douyin', count: 2 },
      { platform: 'xiaohongshu', count: 1 },
    ]);
  });

  it('跨用户隔离：非本人数据不计入任何统计', async () => {
    const inWeek = new Date(WEEK_START.getTime() + 3600000);
    const { svc } = makeService({
      plans: [
        plan({ id: 1, userId: 2, publishedAt: inWeek }),
        plan({ id: 2, userId: 2, status: 'pending_review' }),
        plan({ id: 3, userId: 2, targetPlatforms: ['weibo'] }),
      ],
      agentTasks: [agentTask({ id: 1, userId: 2, finishedAt: inWeek })],
      teamTasks: [teamTask({ id: 1, creatorId: 2, completedAt: inWeek })],
      assets: [asset({ id: 1, userId: 2 })],
    });
    const res = await svc.getUserOverview(1);
    assert.equal(res.weekPublished, 0);
    assert.equal(res.weekCompletedTasks, 0);
    assert.equal(res.assetCount, 0);
    assert.equal(res.pendingReview, 0);
    assert.equal(res.publishTrend30d.length, 30);
    assert.equal(res.publishTrend30d.every((p) => p.count === 0), true);
    assert.deepEqual(res.platformDist, []);
  });
});
