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
  const isNull = (v: unknown) =>
    !!v && typeof v === 'object' && (v as any)._type === 'isNull';
  const match = (row: any, where: any): boolean => {
    // OR 条件数组：任一命中即匹配（auto/agent 无团队任务与团队任务并存查询）
    if (Array.isArray(where)) return where.some((w) => match(row, w));
    return Object.entries(where ?? {}).every(([k, v]) => {
      if (isIn(v)) return (v as any).value.includes(row[k]);
      if (isNull(v)) return row[k] == null;
      return row[k] === v;
    });
  };
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

/** 模拟 UNION SQL 查询：按 SQL 分支/状态/分页参数在内存还原查询结果（与 task.service 的 SQL 语义对齐） */
function makeQuery(seed: any) {
  return async (sql: string, params: unknown[] = []) => {
    const isCount = /COUNT\(\*\)/.test(sql);
    const segs = sql.split('UNION ALL');
    const countQ = (seg: string) => (seg.match(/\?/g) ?? []).length;

    // 从 SQL 推断实际 teamIds 数量（t.team_id IN (?,...) 的占位符数）
    const inMatch = (segs[0] ?? '').match(/t\.team_id IN \(([^)]*)\)/);
    const teamIdCount = inMatch ? (inMatch[1].match(/\?/g) ?? []).length : 0;
    const teamQ = countQ(segs[0] ?? '');
    const taskQ = countQ(segs[1] ?? '');
    const hermesQ = countQ(segs[2] ?? '');

    const includeTeam = sql.includes('FROM task_team_tasks');
    const includeTask = sql.includes('FROM task_agent_tasks');
    const includeHermes = sql.includes('FROM create_hermes_call_logs');

    // SQL 参数顺序: 按分支合并 [teamIds..., uid, teamVals..., uid, taskVals..., uid, hermesVals...]
    let cursor = 0;
    let uid = 0;
    const actualTeamIds: number[] = [];
    const teamVals: string[] = [];
    const taskVals: string[] = [];
    const hermesVals: string[] = [];
    if (includeTeam) {
      actualTeamIds.push(...params.slice(0, teamIdCount).map(Number));
      cursor = teamIdCount;
      uid = Number(params[cursor++]);
      const n = Math.max(0, teamQ - (teamIdCount + 1));
      teamVals.push(...params.slice(cursor, cursor + n).map(String));
      cursor += n;
    }
    if (includeTask) {
      uid = Number(params[cursor++]);
      const n = Math.max(0, taskQ - 1);
      taskVals.push(...params.slice(cursor, cursor + n).map(String));
      cursor += n;
    }
    if (includeHermes) {
      uid = Number(params[cursor++]);
      const n = Math.max(0, hermesQ - 1);
      hermesVals.push(...params.slice(cursor, cursor + n).map(String));
      cursor += n;
    }

    const blocked = segs.map((seg) => seg.includes('1 = 0'));

    const rows: any[] = [];
    if (includeTeam && !blocked[0]) {
      for (const t of seed.teamTasks ?? []) {
        const inTeam = actualTeamIds.includes(Number(t.teamId));
        const ownAuto = Number(t.creatorId) === uid && t.teamId == null;
        if (!(inTeam || ownAuto)) continue;
        if (teamVals.length > 0 && !teamVals.includes(t.status)) continue;
        rows.push({
          source: 'team',
          source_id: Number(t.id),
          title: t.title,
          status: mapTeamStatus(t.status),
          raw_status: t.status,
          created_at: t.createdAt,
          finished_at: t.completedAt ?? null,
          assignee:
            t.assigneeMemberId != null
              ? (seed.members ?? []).find((m: any) => Number(m.id) === Number(t.assigneeMemberId))?.roleTitle ?? null
              : null,
          brief_id: t.briefId ?? null,
          execution_ref: t.executionRef ?? null,
        });
      }
    }
    if (includeTask && !blocked[1]) {
      for (const t of seed.agentTasks ?? []) {
        if (Number(t.userId) !== uid) continue;
        if (taskVals.length > 0 && !taskVals.includes(t.status)) continue;
        rows.push({
          source: 'task',
          source_id: Number(t.id),
          title: t.title ?? t.taskType,
          status: mapTaskStatus(t.status),
          raw_status: t.status,
          created_at: t.createdAt,
          finished_at: t.finishedAt ?? null,
          assignee: null,
          brief_id: null,
          execution_ref: null,
        });
      }
    }
    if (includeHermes && !blocked[2]) {
      for (const h of seed.hermesLogs ?? []) {
        if (Number(h.userId) !== uid) continue;
        if (hermesVals.length > 0 && !hermesVals.includes(h.status)) continue;
        rows.push({
          source: 'hermes',
          source_id: Number(h.id),
          title: h.target ?? h.callType,
          status: mapHermesStatus(h.status),
          raw_status: h.status,
          created_at: h.createdAt,
          finished_at: null,
          assignee: null,
          brief_id: null,
          execution_ref: null,
        });
      }
    }
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (isCount) return [{ total: rows.length }];
    const m = sql.match(/LIMIT (\d+) OFFSET (\d+)/);
    const limit = m ? Number(m[1]) : rows.length;
    const offset = m ? Number(m[2]) : 0;
    return rows.slice(offset, offset + limit);
  };
}

function makeService(seed: {
  teams?: any[];
  members?: any[];
  teamTasks?: any[];
  agentTasks?: any[];
  hermesLogs?: any[];
}) {
  const taskRepo = {
    find: makeFind(seed.agentTasks ?? []),
    query: makeQuery(seed),
  };
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
      {
        id: 3,
        teamId: null,
        title: '自动匹配任务A',
        status: 'pending',
        assigneeMemberId: null,
        creatorId: 1,
        briefId: 9002,
        executionRef: 'brief-1-x',
        createdAt: new Date('2026-08-07T08:00:00Z'),
        completedAt: null,
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
    assert.equal(res.total, 7);
    assert.equal(res.list.length, 7);

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

    // auto/agent 无团队归属任务：unified 也必须返回（任务中心主数据源）
    const auto = res.list.find((i) => i.source === 'team' && i.sourceId === 3)!;
    assert.ok(auto, 'auto 无团队任务应在 unified 返回');
    assert.equal(auto.status, 'todo');
    assert.equal(auto.rawStatus, 'pending');
    assert.equal(auto.assignee, undefined);
    assert.equal(auto.briefId, 9002);
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

  it('无团队用户：自己创建的 auto 无团队任务应返回（unified 非数组分支）', async () => {
    const base = seedData();
    const svc = makeService({
      teams: [],
      members: [],
      teamTasks: [base.teamTasks[2]],
      agentTasks: [],
      hermesLogs: [],
    });
    const res = await svc.getUnifiedTasks(1, {});
    assert.equal(res.total, 1);
    assert.equal(res.list[0].source, 'team');
    assert.equal(res.list[0].sourceId, 3);
  });

  it('有团队用户：他人创建的 auto 无团队任务不可见（隔离）', async () => {
    const base = seedData();
    const svc = makeService({
      teams: base.teams,
      members: base.members,
      teamTasks: [
        ...base.teamTasks,
        { ...base.teamTasks[2], id: 4, creatorId: 2, title: '他人自动任务' },
      ],
      agentTasks: [],
      hermesLogs: [],
    });
    const res = await svc.getUnifiedTasks(1, {});
    const ids = res.list.map((i) => i.sourceId);
    assert.ok(ids.includes(3), '自己的 auto 任务应返回');
    assert.ok(!ids.includes(4), '他人的 auto 任务不得出现在 unified');
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
    assert.equal(res.list[0].source, 'team');
    assert.equal(res.list[0].sourceId, 3);
  });

  it('分页：page/pageSize 切片 + total/totalPages', async () => {
    const svc = makeService(seedData());
    const p1 = await svc.getUnifiedTasks(1, { page: 1, pageSize: 2 });
    assert.equal(p1.list.length, 2);
    assert.equal(p1.total, 7);
    assert.equal(p1.page, 1);
    assert.equal(p1.pageSize, 2);
    assert.equal(p1.totalPages, 4);
    const p3 = await svc.getUnifiedTasks(1, { page: 3, pageSize: 2 });
    assert.equal(p3.list.length, 2);
    const p4 = await svc.getUnifiedTasks(1, { page: 4, pageSize: 2 });
    assert.equal(p4.list.length, 1);
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

