/**
 * unified-mapper 单元测试
 * 覆盖：三源状态映射全枚举、合并排序、getUnifiedTasks 组装（归属/过滤/排序/分页）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TaskService } from '../../src/modules/task/services/task.service';
import {
  mapTeamStatus,
  mapTaskStatus,
  mapHermesStatus,
  sortByCreatedAtDesc,
  type UnifiedTaskItem,
} from '../../src/modules/task/utils/unified-mapper';

describe('unified-mapper', () => {
  describe('mapTeamStatus', () => {
    it('全枚举映射 + 未知状态兜底 failed', () => {
      assert.equal(mapTeamStatus('pending'), 'todo');
      assert.equal(mapTeamStatus('in_progress'), 'running');
      assert.equal(mapTeamStatus('completed'), 'done');
      assert.equal(mapTeamStatus('failed'), 'failed');
      assert.equal(mapTeamStatus('unknown'), 'failed');
      assert.equal(mapTeamStatus(''), 'failed');
    });
  });

  describe('mapTaskStatus', () => {
    it('全枚举映射 + 未知状态兜底 failed', () => {
      assert.equal(mapTaskStatus('queued'), 'todo');
      assert.equal(mapTaskStatus('running'), 'running');
      assert.equal(mapTaskStatus('success'), 'done');
      assert.equal(mapTaskStatus('cancelled'), 'cancelled');
      assert.equal(mapTaskStatus('failed'), 'failed');
      assert.equal(mapTaskStatus('unknown'), 'failed');
    });
  });

  describe('mapHermesStatus', () => {
    it('全枚举映射 + 未知状态兜底 todo', () => {
      assert.equal(mapHermesStatus('running'), 'running');
      assert.equal(mapHermesStatus('success'), 'done');
      assert.equal(mapHermesStatus('timeout'), 'failed');
      assert.equal(mapHermesStatus('failed'), 'failed');
      assert.equal(mapHermesStatus('unknown'), 'todo');
      assert.equal(mapHermesStatus(''), 'todo');
    });
  });

  describe('sortByCreatedAtDesc', () => {
    const item = (id: number, createdAt: string): UnifiedTaskItem => ({
      source: 'task',
      sourceId: id,
      title: `任务${id}`,
      status: 'done',
      rawStatus: 'success',
      createdAt,
    });

    it('createdAt 倒序（最新在前），不修改原数组', () => {
      const list = [
        item(1, '2026-08-01T00:00:00.000Z'),
        item(2, '2026-08-03T00:00:00.000Z'),
        item(3, '2026-08-02T00:00:00.000Z'),
      ];
      assert.deepEqual(
        sortByCreatedAtDesc(list).map((i) => i.sourceId),
        [2, 3, 1],
      );
      assert.deepEqual(
        list.map((i) => i.sourceId),
        [1, 2, 3],
      );
    });

    it('非法时间排最后', () => {
      const list = [
        item(1, 'invalid-date'),
        item(2, '2026-08-03T00:00:00.000Z'),
      ];
      assert.deepEqual(
        sortByCreatedAtDesc(list).map((i) => i.sourceId),
        [2, 1],
      );
    });
  });
});

/** 最小内存 Repository mock：支持 find（where/order/take，含 In 子句） */
function makeFind(rows: any[]) {
  const isIn = (v: unknown) =>
    !!v && typeof v === 'object' && (v as any)._type === 'in';
  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) =>
      isIn(v) ? (v as any).value.includes(row[k]) : row[k] === v,
    );
  return async ({ where, order, take }: any = {}) => {
    let list = rows.filter((r) => match(r, where));
    if (order?.createdAt === 'DESC') {
      list = [...list].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    if (take !== undefined) list = list.slice(0, take);
    return list;
  };
}

function makeService(seed: {
  teams?: any[];
  members?: any[];
  teamTasks?: any[];
  agentTasks?: any[];
  hermesLogs?: any[];
}) {
  const taskRepo = { find: makeFind(seed.agentTasks ?? []) };
  const outputItemRepo = { find: async () => [] };
  const teamRepo = { find: makeFind(seed.teams ?? []) };
  const memberRepo = { find: makeFind(seed.members ?? []) };
  const teamTaskRepo = { find: makeFind(seed.teamTasks ?? []) };
  const hermesRepo = { find: makeFind(seed.hermesLogs ?? []) };
  return new TaskService(
    taskRepo as any,
    outputItemRepo as any,
    teamRepo as any,
    memberRepo as any,
    teamTaskRepo as any,
    hermesRepo as any,
  );
}

function seedData() {
  return {
    teams: [{ id: 7, creatorId: 1 }],
    members: [
      { id: 101, teamId: 7, roleTitle: 'CEO' },
      { id: 102, teamId: 7, roleTitle: '渠道总监' },
    ],
    teamTasks: [
      {
        id: 1,
        teamId: 7,
        title: '团队任务A',
        status: 'pending',
        assigneeMemberId: 101,
        briefId: 9001,
        createdAt: new Date('2026-08-01T08:00:00Z'),
        completedAt: null,
      },
      {
        id: 2,
        teamId: 7,
        title: '团队任务B',
        status: 'completed',
        assigneeMemberId: 102,
        briefId: null,
        createdAt: new Date('2026-08-02T08:00:00Z'),
        completedAt: new Date('2026-08-02T09:00:00Z'),
      },
    ],
    agentTasks: [
      {
        id: 11,
        userId: 1,
        title: '我的任务A',
        taskType: 'chat',
        status: 'success',
        createdAt: new Date('2026-08-03T08:00:00Z'),
        finishedAt: new Date('2026-08-03T08:30:00Z'),
      },
      {
        id: 12,
        userId: 1,
        title: null,
        taskType: 'workflow',
        status: 'queued',
        createdAt: new Date('2026-08-04T08:00:00Z'),
        finishedAt: null,
      },
    ],
    hermesLogs: [
      {
        id: 21,
        userId: 1,
        target: '研究竞品',
        callType: 'skill_execute',
        status: 'running',
        createdAt: new Date('2026-08-05T08:00:00Z'),
      },
      {
        id: 22,
        userId: 1,
        target: null,
        callType: 'workflow_run',
        status: 'timeout',
        createdAt: new Date('2026-08-06T08:00:00Z'),
      },
    ],
  };
}

describe('TaskService.getUnifiedTasks', () => {
  it('三源合并：归属 + 字段组装正确', async () => {
    const svc = makeService(seedData());
    const res = await svc.getUnifiedTasks(1, {});
    assert.equal(res.total, 6);
    assert.equal(res.list.length, 6);

    const teamA = res.list.find((i) => i.source === 'team' && i.sourceId === 1)!;
    assert.equal(teamA.status, 'todo');
    assert.equal(teamA.rawStatus, 'pending');
    assert.equal(teamA.assignee, 'CEO');
    assert.equal(teamA.briefId, 9001);

    const teamB = res.list.find((i) => i.source === 'team' && i.sourceId === 2)!;
    assert.equal(teamB.status, 'done');
    assert.equal(teamB.assignee, '渠道总监');
    assert.equal(teamB.finishedAt, '2026-08-02T09:00:00.000Z');

    const taskA = res.list.find((i) => i.source === 'task' && i.sourceId === 11)!;
    assert.equal(taskA.status, 'done');
    assert.equal(taskA.assignee, undefined);
    assert.equal(taskA.briefId, null);

    const taskB = res.list.find((i) => i.source === 'task' && i.sourceId === 12)!;
    assert.equal(taskB.title, 'workflow');
    assert.equal(taskB.status, 'todo');

    const hermesA = res.list.find((i) => i.source === 'hermes' && i.sourceId === 21)!;
    assert.equal(hermesA.status, 'running');
    assert.equal(hermesA.title, '研究竞品');

    const hermesB = res.list.find((i) => i.source === 'hermes' && i.sourceId === 22)!;
    assert.equal(hermesB.status, 'failed');
    assert.equal(hermesB.title, 'workflow_run');
    assert.equal(hermesB.finishedAt, null);
  });

  it('非创建者看不到他人团队任务（且只看到自己的 task/hermes）', async () => {
    const base = seedData();
    const svc = makeService({
      teams: base.teams,
      members: base.members,
      teamTasks: base.teamTasks,
      agentTasks: [{ ...base.agentTasks[0], userId: 2 }],
      hermesLogs: [{ ...base.hermesLogs[0], userId: 2 }],
    });
    const res = await svc.getUnifiedTasks(2, {});
    assert.equal(res.list.filter((i) => i.source === 'team').length, 0);
    assert.equal(res.total, 2);
  });

  it('status 过滤：统一状态映射后过滤', async () => {
    const svc = makeService(seedData());
    const res = await svc.getUnifiedTasks(1, { status: 'done' });
    assert.equal(res.total, 2);
    assert.ok(res.list.every((i) => i.status === 'done'));
    assert.deepEqual(
      res.list.map((i) => `${i.source}:${i.sourceId}`).sort(),
      ['task:11', 'team:2'],
    );
  });

  it('source 过滤：仅返回指定源', async () => {
    const svc = makeService(seedData());
    const res = await svc.getUnifiedTasks(1, { source: 'hermes' });
    assert.equal(res.total, 2);
    assert.ok(res.list.every((i) => i.source === 'hermes'));
  });

  it('createdAt 倒序（最新在前）', async () => {
    const svc = makeService(seedData());
    const res = await svc.getUnifiedTasks(1, {});
    const times = res.list.map((i) => new Date(i.createdAt).getTime());
    for (let k = 1; k < times.length; k++) {
      assert.ok(times[k - 1] >= times[k]);
    }
    assert.equal(res.list[0].sourceId, 22);
  });

  it('分页：page/pageSize 切片 + total/totalPages', async () => {
    const svc = makeService(seedData());
    const p1 = await svc.getUnifiedTasks(1, { page: 1, pageSize: 2 });
    assert.equal(p1.list.length, 2);
    assert.equal(p1.total, 6);
    assert.equal(p1.page, 1);
    assert.equal(p1.pageSize, 2);
    assert.equal(p1.totalPages, 3);
    const p3 = await svc.getUnifiedTasks(1, { page: 3, pageSize: 2 });
    assert.equal(p3.list.length, 2);
    const p4 = await svc.getUnifiedTasks(1, { page: 4, pageSize: 2 });
    assert.equal(p4.list.length, 0);
  });

  it('pageSize 上限 100，非法/越界分页参数回退默认值', async () => {
    const svc = makeService(seedData());
    const capped = await svc.getUnifiedTasks(1, { page: 0, pageSize: 999 });
    assert.equal(capped.page, 1);
    assert.equal(capped.pageSize, 100);
    const fallback = await svc.getUnifiedTasks(1, {
      page: Number.NaN,
      pageSize: Number.NaN,
    } as any);
    assert.equal(fallback.page, 1);
    assert.equal(fallback.pageSize, 10);
  });
});

