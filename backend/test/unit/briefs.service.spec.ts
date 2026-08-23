/**
 * BriefService 单元测试
 * 覆盖：create / list（分页 + status 过滤）/ history（倒序 + limit）/
 *       getOne（权限过滤）/ update（draft 可改、confirmed 禁改）/
 *       confirm（AI 拆解派发 + 幂等）/ cancel 状态机
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BriefService } from '../../src/modules/briefs/services/brief.service';
import { BriefEntity } from '../../src/modules/briefs/entities/brief.entity';

/** 最小内存 Repository mock：支持 create/save/findOne/find/findAndCount */
function makeRepo(seed: BriefEntity[] = []) {
  const rows: BriefEntity[] = [...seed];
  let nextId = seed.reduce((max, r) => Math.max(max, r.id ?? 0), 0) + 1;

  const filterRows = (where: any) =>
    rows.filter((r) =>
      Object.entries(where ?? {}).every(([k, v]) => (r as any)[k] === v),
    );

  const sortDesc = (list: BriefEntity[]) =>
    [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        (b.id ?? 0) - (a.id ?? 0),
    );

  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: async (e: BriefEntity) => {
      const rec = e as BriefEntity & { id?: number };
      if (!rec.id) rec.id = nextId++;
      const idx = rows.findIndex((r) => r.id === rec.id);
      if (idx >= 0) rows[idx] = rec;
      else rows.push(rec);
      return rec;
    },
    findOne: async ({ where }: any = {}) => filterRows(where)[0] ?? null,
    find: async ({ where, order, take }: any = {}) => {
      let list = filterRows(where);
      if (order?.createdAt === 'DESC') list = sortDesc(list);
      if (take !== undefined) list = list.slice(0, take);
      return list;
    },
    findAndCount: async ({ where, order, skip, take }: any = {}) => {
      let list = filterRows(where);
      const total = list.length;
      if (order?.createdAt === 'DESC') list = sortDesc(list);
      const start = skip ?? 0;
      const size = take ?? total;
      return [list.slice(start, start + size), total];
    },
  };
}

const defaultDispatch = {
  dispatch: async () => ({ ok: true, tasks: [] }),
};

function makeService(
  seed: BriefEntity[] = [],
  dispatchService: any = defaultDispatch,
  teams: any[] = [],
  members: any[] = [],
) {
  const repo = makeRepo(seed);
  const teamRepo = { find: async () => teams };
  const memberRepo = { find: async () => members };
  const agentRepo = { findOne: async () => null };
  const svc = new BriefService(
    repo as any,
    dispatchService,
    teamRepo as any,
    memberRepo as any,
    agentRepo as any,
  );
  return { svc, repo, dispatchService };
}

function makeBrief(overrides: Partial<BriefEntity> = {}): BriefEntity {
  return {
    id: 1,
    userId: 1,
    title: '测试需求单',
    status: 'draft',
    dispatchStatus: 'none',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as BriefEntity;
}

const isBadRequest = (err: any) => err?.getStatus?.() === 400;

describe('BriefService', () => {
  describe('create', () => {
    it('创建成功：初始状态 draft、dispatchStatus none', async () => {
      const { svc, repo } = makeService();
      const result = await svc.create(1, {
        title: '新品上市推广方案',
        goal: '提升首月销量',
        platforms: ['抖音', '小红书'],
      });
      assert.equal(result.title, '新品上市推广方案');
      assert.equal(result.userId, 1);
      assert.equal(result.status, 'draft');
      assert.equal(result.dispatchStatus, 'none');
      assert.equal(repo.rows.length, 1);
    });

    it('创建成功：deadline 转 Date', async () => {
      const { svc } = makeService();
      const result = await svc.create(1, {
        title: '带截止时间',
        deadline: '2026-09-01T00:00:00.000Z',
      });
      assert.ok(result.deadline instanceof Date);
      assert.equal(result.deadline.toISOString(), '2026-09-01T00:00:00.000Z');
    });
  });

  describe('list', () => {
    it('分页返回并附带 total/totalPages', async () => {
      const seed = [
        makeBrief({ id: 1, title: 'A', status: 'draft' }),
        makeBrief({ id: 2, title: 'B', status: 'confirmed' }),
        makeBrief({ id: 3, title: 'C', status: 'draft' }),
      ];
      const { svc } = makeService(seed);
      const result = await svc.list(1, { page: 1, pageSize: 2 });
      assert.equal(result.list.length, 2);
      assert.equal(result.total, 3);
      assert.equal(result.totalPages, 2);
      assert.equal(result.page, 1);
      assert.equal(result.pageSize, 2);
    });

    it('status 过滤只返回对应状态', async () => {
      const seed = [
        makeBrief({ id: 1, title: 'A', status: 'draft' }),
        makeBrief({ id: 2, title: 'B', status: 'confirmed' }),
        makeBrief({ id: 3, title: 'C', status: 'draft' }),
      ];
      const { svc } = makeService(seed);
      const result = await svc.list(1, { page: 1, pageSize: 10, status: 'draft' });
      assert.equal(result.total, 2);
      assert.ok(result.list.every((b) => b.status === 'draft'));
    });

    it('不返回其他用户的需求单', async () => {
      const seed = [
        makeBrief({ id: 1, userId: 1, title: 'A' }),
        makeBrief({ id: 2, userId: 2, title: 'B' }),
      ];
      const { svc } = makeService(seed);
      const result = await svc.list(2, { page: 1, pageSize: 10 });
      assert.equal(result.total, 1);
      assert.equal(result.list[0].id, 2);
    });

    it('pageSize 超过上限时截断为 100', async () => {
      const seed = Array.from({ length: 120 }, (_, i) => makeBrief({ id: i + 1 }));
      const { svc } = makeService(seed);
      const result = await svc.list(1, { page: 1, pageSize: 999 });
      assert.equal(result.pageSize, 100);
      assert.equal(result.list.length, 100);
    });
  });

  describe('history', () => {
    it('按 createdAt 倒序返回', async () => {
      const seed = [
        makeBrief({ id: 1, createdAt: new Date('2026-08-01T00:00:00Z') }),
        makeBrief({ id: 2, createdAt: new Date('2026-08-03T00:00:00Z') }),
        makeBrief({ id: 3, createdAt: new Date('2026-08-02T00:00:00Z') }),
      ];
      const { svc } = makeService(seed);
      const list = await svc.history(1);
      assert.deepEqual(list.map((b) => b.id), [2, 3, 1]);
    });

    it('limit 生效：只返回最近 N 条', async () => {
      const seed = [
        makeBrief({ id: 1, createdAt: new Date('2026-08-01T00:00:00Z') }),
        makeBrief({ id: 2, createdAt: new Date('2026-08-03T00:00:00Z') }),
        makeBrief({ id: 3, createdAt: new Date('2026-08-02T00:00:00Z') }),
      ];
      const { svc } = makeService(seed);
      const list = await svc.history(1, 2);
      assert.equal(list.length, 2);
      assert.equal(list[0].id, 2);
    });

    it('limit 超过 50 时截断为 50', async () => {
      const seed = Array.from({ length: 60 }, (_, i) =>
        makeBrief({ id: i + 1, createdAt: new Date(2026, 7, 1, 0, i) }),
      );
      const { svc } = makeService(seed);
      const list = await svc.history(1, 999);
      assert.equal(list.length, 50);
    });
  });

  describe('getOne', () => {
    it('本人可获取详情', async () => {
      const seed = [makeBrief({ id: 7, userId: 1 })];
      const { svc } = makeService(seed);
      const brief = await svc.getOne(1, 7);
      assert.equal(brief.id, 7);
    });

    it('非本人返回 404', async () => {
      const seed = [makeBrief({ id: 7, userId: 1 })];
      const { svc } = makeService(seed);
      await assert.rejects(() => svc.getOne(2, 7), /不存在/);
    });

    it('不存在返回 404', async () => {
      const { svc } = makeService([]);
      await assert.rejects(() => svc.getOne(1, 999), /不存在/);
    });
  });

  describe('update', () => {
    it('draft 状态可更新字段', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'draft' })];
      const { svc } = makeService(seed);
      const result = await svc.update(1, 1, { title: '新标题', style: '高质感' });
      assert.equal(result.title, '新标题');
      assert.equal(result.style, '高质感');
    });

    it('confirmed 状态禁改（抛 BadRequest）', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'confirmed' })];
      const { svc } = makeService(seed);
      await assert.rejects(
        () => svc.update(1, 1, { title: '新标题' }),
        (err: any) => isBadRequest(err) && /无法修改/.test(err.message),
      );
    });

    it('非本人更新返回 404', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'draft' })];
      const { svc } = makeService(seed);
      await assert.rejects(() => svc.update(2, 1, { title: 'x' }), /不存在/);
    });
  });

  describe('confirm', () => {
    it('draft → confirmed 返回 pending，后台派发完成后回写 done + dispatchResult', async () => {
      const tasks = [{ roleTitle: 'CEO', taskTitle: '制定策略', priority: 'high' }];
      const calls: any[] = [];
      const dispatch = {
        dispatch: async (...args: any[]) => {
          calls.push(args);
          // 模拟 LLM 耗时：confirm 返回时派发仍在进行（dispatchStatus=pending）
          await new Promise((resolve) => setImmediate(resolve));
          return { ok: true, tasks };
        },
      };
      const seed = [
        makeBrief({ id: 1, userId: 1, status: 'draft', dispatchStatus: 'none' }),
      ];
      const { svc } = makeService(seed, dispatch);
      const result = await svc.confirm(1, 1, { manualDispatch: false });
      assert.equal(result.status, 'confirmed');
      // confirm 同步返回时只占住 pending（不再阻塞等待 LLM）
      assert.equal(result.dispatchStatus, 'pending');
      assert.equal(calls.length, 1);
      // 等待后台派发微任务完成后再断言最终状态
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(result.dispatchStatus, 'done');
      assert.deepEqual(result.dispatchResult, tasks);
    });

    it('后台派发失败 → 回写 dispatchStatus failed + dispatchResult null', async () => {
      const dispatch = {
        dispatch: async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return { ok: false, error: 'NO_MODEL_OR_RELAY' };
        },
      };
      const seed = [
        makeBrief({ id: 1, userId: 1, status: 'draft', dispatchStatus: 'none' }),
      ];
      const { svc } = makeService(seed, dispatch);
      const result = await svc.confirm(1, 1);
      assert.equal(result.status, 'confirmed');
      assert.equal(result.dispatchStatus, 'pending');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(result.dispatchStatus, 'failed');
      assert.equal(result.dispatchResult, null);
    });

    it('幂等：dispatchStatus 非 none 时不触发 dispatch，直接返回当前 brief', async () => {
      let calls = 0;
      const dispatch = {
        dispatch: async () => {
          calls++;
          return { ok: true, tasks: [] };
        },
      };
      const seed = [
        makeBrief({ id: 1, userId: 1, status: 'draft', dispatchStatus: 'pending' }),
      ];
      const { svc } = makeService(seed, dispatch);
      const result = await svc.confirm(1, 1);
      assert.equal(result.status, 'draft');
      assert.equal(result.dispatchStatus, 'pending');
      assert.equal(calls, 0);
    });

    it('幂等：已确认已派发（done）重复 confirm 直接返回', async () => {
      let calls = 0;
      const dispatch = {
        dispatch: async () => {
          calls++;
          return { ok: true, tasks: [] };
        },
      };
      const seed = [
        makeBrief({ id: 1, userId: 1, status: 'confirmed', dispatchStatus: 'done' }),
      ];
      const { svc } = makeService(seed, dispatch);
      const result = await svc.confirm(1, 1);
      assert.equal(result.status, 'confirmed');
      assert.equal(result.dispatchStatus, 'done');
      assert.equal(calls, 0);
    });

    it('confirm 将用户团队成员角色列表传给 dispatch', async () => {
      const calls: any[] = [];
      const dispatch = {
        dispatch: async (...args: any[]) => {
          calls.push(args);
          return { ok: true, tasks: [] };
        },
      };
      const seed = [
        makeBrief({ id: 1, userId: 1, status: 'draft', dispatchStatus: 'none' }),
      ];
      const teams = [{ id: 7, creatorId: 1 }];
      const members = [
        { id: 101, roleTitle: 'CEO', teamId: 7 },
        { id: 102, roleTitle: '渠道总监', teamId: 7 },
      ];
      const { svc } = makeService(seed, dispatch, teams, members);
      await svc.confirm(1, 1);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0][1], [
        { roleTitle: 'CEO', memberId: 101 },
        { roleTitle: '渠道总监', memberId: 102 },
      ]);
      // 等后台派发链落定，避免测试结束仍有挂起微任务
      await new Promise((resolve) => setImmediate(resolve));
    });

    it('非 draft 拒绝确认', async () => {
      for (const status of ['confirmed', 'cancelled'] as const) {
        const seed = [makeBrief({ id: 1, userId: 1, status })];
        const { svc } = makeService(seed);
        await assert.rejects(
          () => svc.confirm(1, 1),
          (err: any) => isBadRequest(err) && /不可确认/.test(err.message),
        );
      }
    });
  });

  describe('cancel', () => {
    it('draft → cancelled', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'draft' })];
      const { svc } = makeService(seed);
      const result = await svc.cancel(1, 1);
      assert.equal(result.status, 'cancelled');
    });

    it('confirmed → cancelled', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'confirmed' })];
      const { svc } = makeService(seed);
      const result = await svc.cancel(1, 1);
      assert.equal(result.status, 'cancelled');
    });

    it('已取消拒绝再次取消', async () => {
      const seed = [makeBrief({ id: 1, userId: 1, status: 'cancelled' })];
      const { svc } = makeService(seed);
      await assert.rejects(
        () => svc.cancel(1, 1),
        (err: any) => isBadRequest(err) && /不可取消/.test(err.message),
      );
    });
  });
});