/**
 * BriefDispatchService 单元测试
 * 覆盖：成功拆解派发 / 非法 JSON / fetch 抛异常 / 无模型 / roleTitle 白名单 / priority 清洗 / 代码块提取
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BriefDispatchService } from '../../src/modules/briefs/services/brief-dispatch.service';

/** 可用角色列表（memberRoleTitles 参数） */
const ROLES = [
  { roleTitle: 'CEO', memberId: 101 },
  { roleTitle: '渠道总监', memberId: 102 },
];

/** 构造 DispatchService 依赖 mock；overrides.model 传 null 模拟无模型 */
function makeContext(overrides: Record<string, unknown> = {}) {
  const briefSaves: any[] = [];
  const taskCreates: any[] = [];
  const taskSaves: any[] = [];
  const briefRepo = {
    save: async (b: any) => {
      briefSaves.push(b);
      return b;
    },
  };
  const teamTaskRepo = {
    create: (data: any) => {
      taskCreates.push(data);
      return { ...data };
    },
    save: async (entities: any) => {
      taskSaves.push(entities);
      return entities;
    },
  };
  const memberRepo = {
    findOne: async ({ where }: any = {}) =>
      overrides.member === undefined
        ? { id: where?.id, teamId: 10 }
        : overrides.member,
  };
  const modelRepo = {
    findOne: async () =>
      overrides.model === undefined
        ? { id: 1, modelId: "qwen-max", upstreamModelId: "qwen-max" }
        : overrides.model,
  };
  const providerRepo = {
    findOne: async () =>
      overrides.provider === undefined
        ? { isGlobal: true, status: "active", baseUrl: "https://relay.example.com/v1", apiKey: "enc" }
        : overrides.provider,
  };
  const encryption = { decryptAes: (k: string) => "sk-decrypted" };
  const svc = new BriefDispatchService(
    briefRepo as never,
    teamTaskRepo as never,
    memberRepo as never,
    modelRepo as never,
    providerRepo as never,
    encryption as never,
  );
  return { svc, briefRepo, teamTaskRepo, briefSaves, taskCreates, taskSaves };
}

function makeBrief(overrides: Record<string, unknown> = {}): any {
  return {
    id: 1,
    userId: 1,
    title: '新品上市推广方案',
    goal: '提升首月销量',
    targetAudience: '25-35 岁白领',
    platforms: ['抖音', '小红书'],
    style: '高质感',
    deadline: new Date('2026-09-30T00:00:00.000Z'),
    status: 'draft',
    dispatchStatus: 'none',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

/** mock global fetch 返回带 choices[0].message.content 的响应 */
function mockFetchContent(content: string, ok = true) {
  mock.method(globalThis, 'fetch', async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ choices: [{ message: { content } }] }),
    }) as never,
  );
}

test('dispatch: LLM 返回合法 JSON 数组 → 创建 2 条任务并写回 done', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '制定上市策略', description: '输出整体策略', priority: 'high', dueDate: '2026-09-10', dependsOn: [] },
      { roleTitle: '渠道总监', taskTitle: '对接渠道资源', priority: 'urgent', dueDate: '2026-09-12' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 2);
  assert.equal(brief.dispatchStatus, 'done');
  assert.equal(brief.dispatchResult?.length, 2);
  // briefRepo.save 仅成功写回 1 次（done + dispatchResult）
  assert.equal(ctx.briefSaves.length, 1);
  assert.equal(ctx.briefSaves[0].dispatchStatus, 'done');
  // teamTaskRepo.create 参数：title/briefId/assigneeMemberId/priority/creatorId/status/teamId/dueDate
  assert.equal(ctx.taskCreates.length, 2);
  const first = ctx.taskCreates[0];
  assert.equal(first.title, '制定上市策略');
  assert.equal(first.briefId, 1);
  assert.equal(first.assigneeMemberId, 101);
  assert.equal(first.creatorId, 1);
  assert.equal(first.status, 'pending');
  assert.equal(first.priority, 'high');
  assert.equal(first.teamId, 10);
  assert.ok(first.dueDate instanceof Date);
  // executionRef：批次引用回填（brief-<id>-<base36 时间戳>），同批次一致
  assert.match(first.executionRef ?? '', /^brief-1-[0-9a-z]+$/);
  assert.equal(ctx.taskCreates[0].executionRef, ctx.taskCreates[1].executionRef);
  assert.equal(ctx.taskSaves.length, 1);
  assert.equal(ctx.taskSaves[0].length, 2);
});

test('dispatch: 上游返回非法 JSON → failed，不创建任务不写回', async (t) => {
  const ctx = makeContext();
  mockFetchContent('抱歉，无法拆解');
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PARSE_JSON_FAILED');
  assert.equal(ctx.taskCreates.length, 0);
  assert.equal(ctx.briefSaves.length, 0);
});

test('dispatch: fetch 抛异常 → failed，pending 回写 failed', async (t) => {
  const ctx = makeContext();
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down');
  });
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /network down/);
  assert.equal(brief.dispatchStatus, 'failed');
  // 异常路径：pending → failed 回写 1 次
  assert.equal(ctx.briefSaves.length, 1);
  assert.equal(ctx.briefSaves[0].dispatchStatus, 'failed');
});

test('dispatch: 无可用模型 → NO_MODEL_OR_RELAY，不触发 fetch 不写回', async (t) => {
  const ctx = makeContext({ model: null });
  let fetchCalled = 0;
  mock.method(globalThis, 'fetch', async () => {
    fetchCalled++;
    return { ok: true, json: async () => ({}) } as never;
  });
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.deepEqual(result, { ok: false, error: 'NO_MODEL_OR_RELAY' });
  assert.equal(fetchCalled, 0);
  assert.equal(ctx.briefSaves.length, 0);
});

test('dispatch: roleTitle 不在可用列表 → 该条被跳过', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '有效任务', priority: 'medium' },
      { roleTitle: '外星人', taskTitle: '无效任务', priority: 'low' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 1);
  assert.equal(result.tasks?.[0].taskTitle, '有效任务');
  assert.equal(ctx.taskCreates.length, 1);
});

test('dispatch: priority 非法回 medium、taskTitle 空跳过', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '优先级修正', priority: 'bogus' },
      { roleTitle: 'CEO', taskTitle: '', priority: 'high' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 1);
  assert.equal(result.tasks?.[0].priority, 'medium');
  assert.equal(ctx.taskCreates.length, 1);
});

test('dispatch: LLM 输出带代码块与前缀文本 → 提取 JSON 数组', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    '好的，以下是拆解结果：\n```json\n' +
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '带代码块任务', priority: 'low' },
    ]) +
    '\n```\n'
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 1);
});

test('dispatch: 角色列表为空 → 白名单为空全部跳过 → failed', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '任意任务', priority: 'medium' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, []);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'NO_VALID_TASKS');
  assert.equal(ctx.taskCreates.length, 0);
});
test('dispatch: auto 模式 → 不过滤白名单，execute_mode=auto 且 team_id 为空', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: '外星人', taskTitle: '自动拆解任务', priority: 'medium' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, [], undefined, 'auto');
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 1);
  assert.equal(ctx.taskCreates.length, 1);
  const created = ctx.taskCreates[0];
  assert.equal(created.executeMode, 'auto');
  assert.equal(created.teamId, undefined);
  assert.equal(created.assigneeMemberId, undefined);
  assert.equal(brief.dispatchStatus, 'done');
});

test('dispatch: agent 模式 → 绑定 agent_id，execute_mode=agent 且 team_id 为空', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: '设计师', taskTitle: '单独Agent任务', priority: 'high' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, [], undefined, 'agent', 42);
  assert.equal(result.ok, true);
  assert.equal(result.tasks?.length, 1);
  const created = ctx.taskCreates[0];
  assert.equal(created.executeMode, 'agent');
  assert.equal(created.agentId, 42);
  assert.equal(created.teamId, undefined);
  assert.equal(brief.dispatchStatus, 'done');
});

test('dispatch: team 模式默认 → execute_mode 默认 team', async (t) => {
  const ctx = makeContext();
  mockFetchContent(
    JSON.stringify([
      { roleTitle: 'CEO', taskTitle: '团队任务', priority: 'medium' },
    ]),
  );
  t.after(() => mock.restoreAll());
  const brief = makeBrief({ dispatchStatus: 'pending' });
  const result = await ctx.svc.dispatch(brief, ROLES);
  assert.equal(result.ok, true);
  assert.equal(ctx.taskCreates[0].executeMode, 'team');
});