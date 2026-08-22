/**
 * ScheduledTasksService 单元测试
 * 覆盖：computeNextRunAt（once/daily/weekly）、fire 原子占位、fired 推进 next_run_at（once done / daily 下次）
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  ScheduledTasksService,
  computeNextRunAt,
} from '../../src/modules/scheduled-tasks/scheduled-tasks.service';

test('computeNextRunAt: once 使用 dueAt', () => {
  const due = new Date('2026-08-25T09:00:00+08:00');
  const next = computeNextRunAt('once', null, null, due, new Date('2026-08-20T00:00:00+08:00'));
  assert.ok(next);
  assert.equal(next.getTime(), due.getTime());
});

test('computeNextRunAt: once 无 dueAt 返回 null', () => {
  assert.equal(computeNextRunAt('once', null, null, null), null);
});

test('computeNextRunAt: daily 取今天未到时刻，否则明天', () => {
  const from = new Date('2026-08-22T08:00:00+08:00');
  const today = computeNextRunAt('daily', '09:00', null, null, from)!;
  assert.equal(today.getDate(), 22);
  assert.equal(today.getHours(), 9);
  const tomorrow = computeNextRunAt('daily', '07:00', null, null, from)!;
  assert.equal(tomorrow.getDate(), 23);
  assert.equal(tomorrow.getHours(), 7);
});

test('computeNextRunAt: weekly 对齐到指定星期', () => {
  // 2026-08-22 是周六；weekday=1（周一）应从下周一 09:00
  const from = new Date('2026-08-22T10:00:00+08:00');
  const next = computeNextRunAt('weekly', '09:00', 1, null, from)!;
  assert.equal(next.getDay(), 1);
  assert.equal(next.getHours(), 9);
  // 至少在下周
  assert.ok(next.getTime() > from.getTime());
});

test('fired: once 成功后 status=done 且 next_run_at=null', async () => {
  const repo = {
    createQueryBuilder: () => ({
      update: () => ({ set: () => ({ where: () => ({ andWhere: async () => ({ affected: 1 }) }) }) }),
    }),
    findOne: async ({ where }: any) => ({
      id: where.id,
      userId: where.userId,
      firingToken: 'tok-1',
      repeatType: 'once',
      runTime: null,
      weekday: null,
      dueAt: new Date('2026-08-25T09:00:00+08:00'),
      lastRunAt: null,
      lastError: null,
      firingExpireAt: null,
      nextRunAt: new Date('2026-08-25T09:00:00+08:00'),
      status: 'active',
    }),
    save: async (e: any) => e,
  } as any;
  const svc = new ScheduledTasksService(repo);
  const out = await svc.fired(1, 7, { success: true });
  assert.equal(out.status, 'done');
  assert.equal(out.nextRunAt, null);
  assert.ok(out.lastRunAt);
});

test('fired: daily 成功后 next_run_at 推进到次日', async () => {
  const repo = {
    createQueryBuilder: () => ({
      update: () => ({ set: () => ({ where: () => ({ andWhere: async () => ({ affected: 1 }) }) }) }),
    }),
    findOne: async ({ where }: any) => ({
      id: where.id,
      userId: where.userId,
      firingToken: 'tok-2',
      repeatType: 'daily',
      runTime: '09:00',
      weekday: null,
      dueAt: null,
      lastRunAt: null,
      lastError: null,
      firingExpireAt: null,
      nextRunAt: new Date('2026-08-22T09:00:00+08:00'),
      status: 'active',
    }),
    save: async (e: any) => e,
  } as any;
  const svc = new ScheduledTasksService(repo);
  const out = await svc.fired(1, 8, { success: true });
  assert.equal(out.status, 'active');
  assert.ok(out.nextRunAt);
  assert.ok((out.nextRunAt as Date).getTime() > Date.now());
});
