/** @jest-environment node */
// 无人值守定时任务引擎（主进程）— 单测
// 锚点：electron/main/cron-engine.ts
import { CronEngine, isDue, parseFlowParams, unwrapList, type CronEngineDeps, type CronScheduledTask } from '../../electron/main/cron-engine';

jest.mock('../../electron/main/flow-executor', () => ({ runFlow: jest.fn() }));
import { runFlow } from '../../electron/main/flow-executor';

const runFlowMock = runFlow as jest.MockedFunction<typeof runFlow>;

function mkTask(over: Partial<CronScheduledTask> = {}): CronScheduledTask {
  return {
    id: 1,
    title: '每日 KPI',
    repeatType: 'daily',
    runTime: '06:00',
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    status: 'active',
    executeKind: 'flow',
    flowId: 'ceo-keyword-planning',
    ...over,
  };
}

/** 统一响应包装 */
function wrap(data: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve({ code: 0, data }) };
}

function mkEngine(token: string | null = 'jwt', tasks: CronScheduledTask[] = [mkTask()]) {
  const fetchImpl = jest.fn((url: string) => {
    const u = String(url);
    if (u.endsWith('/scheduled-tasks')) return Promise.resolve(wrap(tasks));
    if (u.endsWith('/fire')) return Promise.resolve(wrap(tasks[0]));
    if (u.endsWith('/fired')) return Promise.resolve(wrap({}));
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  const createRun = jest.fn().mockResolvedValue(10);
  const finishRun = jest.fn().mockResolvedValue(undefined);
  const runLlm = jest.fn().mockResolvedValue({ teamTaskId: 99 });
  const notify = jest.fn();
  const deps = {
    stApiBase: 'https://api.example.com/api',
    getToken: () => token,
    runLlm,
    createRun,
    finishRun,
    notify,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as CronEngineDeps;
  const engine = new CronEngine(deps);
  return { engine, fetchImpl, createRun, finishRun, runLlm, notify };
}

describe('cron-engine 纯函数', () => {
  it('isDue：到期 active 为真，未来/暂停/无时间 为假', () => {
    const now = Date.now();
    expect(isDue(mkTask(), now)).toBe(true);
    expect(isDue(mkTask({ nextRunAt: new Date(now + 60000).toISOString() }), now)).toBe(false);
    expect(isDue(mkTask({ status: 'paused' }), now)).toBe(false);
    expect(isDue(mkTask({ nextRunAt: null }), now)).toBe(false);
  });

  it('parseFlowParams：空→{}，对象→透传，数组/标量→抛错', () => {
    expect(parseFlowParams(null)).toEqual({});
    expect(parseFlowParams('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseFlowParams('[1,2]')).toThrow();
    expect(() => parseFlowParams('123')).toThrow();
  });

  it('unwrapList：兼容 {code,data} 与裸数组', () => {
    expect(unwrapList({ code: 0, data: [{ id: 1 }] })).toHaveLength(1);
    expect(unwrapList([{ id: 2 }])).toHaveLength(1);
    expect(unwrapList({ code: 0, data: null })).toEqual([]);
  });
});

describe('cron-engine 执行', () => {
  beforeEach(() => {
    runFlowMock.mockReset()
  });

  it('flow 路径：fire → 直跑业务流 → fired 成功 → 写日志', async () => {
    runFlowMock.mockResolvedValue({ ok: true, flow: 'ceo-keyword-planning', data: { n: 1 }, durationMs: 42 });
    const { engine, fetchImpl, createRun, finishRun } = mkEngine();
    const r = await engine.tick();
    expect(r).toEqual({ executed: 1, errors: 0 });
    expect(runFlowMock).toHaveBeenCalledWith('ceo-keyword-planning', { params: {} });
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(finishRun).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'success' }));
    const firedCall = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/fired'));
    expect(firedCall).toBeTruthy();
    expect(JSON.parse((firedCall![1] as RequestInit).body as string)).toEqual({ success: true });
  });

  it('flow 路径缺 flowId：报错且不调 runFlow，fired success=false', async () => {
    runFlowMock.mockResolvedValue({ ok: true, flow: 'x' });
    const { engine, finishRun, fetchImpl } = mkEngine('jwt', [mkTask({ flowId: null })]);
    const r = await engine.tick();
    expect(r.executed).toBe(1);
    expect(r.errors).toBe(1);
    expect(runFlowMock).not.toHaveBeenCalled();
    const firedCall = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/fired'));
    expect(JSON.parse((firedCall![1] as RequestInit).body as string).success).toBe(false);
    expect(finishRun).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'error' }));
  });

  it('flow 执行失败：fired success=false 带错误', async () => {
    runFlowMock.mockResolvedValue({ ok: false, flow: 'x', code: 'LLM_NOT_CONFIGURED', error: '未配置' });
    const { engine, fetchImpl, finishRun } = mkEngine();
    await engine.tick();
    const firedCall = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/fired'));
    const body = JSON.parse((firedCall![1] as RequestInit).body as string);
    expect(body.success).toBe(false);
    expect(body.error).toContain('LLM_NOT_CONFIGURED');
    expect(finishRun).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'error' }));
  });

  it('llm 路径：调用 runLlm（创建团队任务 + Hermes 编排）', async () => {
    const task = mkTask({ executeKind: 'llm', flowId: null });
    const { engine, runLlm, finishRun } = mkEngine('jwt', [task]);
    const r = await engine.tick();
    expect(r.executed).toBe(1);
    expect(runLlm).toHaveBeenCalledTimes(1);
    expect(finishRun).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'success' }));
  });

  it('未登录：不发请求', async () => {
    const { engine, fetchImpl } = mkEngine(null);
    const r = await engine.tick();
    expect(r).toEqual({ executed: 0, errors: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('后台开关关闭：tick 直接返回，不发请求', async () => {
    const { engine, fetchImpl } = mkEngine();
    engine.setEnabled(false);
    const r = await engine.tick();
    expect(r).toEqual({ executed: 0, errors: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
