/**
 * 统一任务中心 —— 三源合并纯函数映射（与前端 desktop/src/pages/TaskCenter/unified.ts 保持一致）
 */

/** 统一任务状态：todo=待执行 running=执行中 done=成功 failed=失败 cancelled=已取消 */
export type UnifiedTaskStatus = 'todo' | 'running' | 'done' | 'failed' | 'cancelled';

/** 任务来源：team=团队 task=我的任务 hermes=Hermes 调用日志 */
export type UnifiedTaskSource = 'team' | 'task' | 'hermes';

/** 统一输出项 */
export interface UnifiedTaskItem {
  source: UnifiedTaskSource;
  sourceId: number;
  title: string;
  status: UnifiedTaskStatus;
  rawStatus: string;
  /** 团队任务：成员 roleTitle；其余留空 */
  assignee?: string;
  createdAt: string;
  finishedAt?: string | null;
  briefId?: number | null;
  /** 发布批次标识（同一次需求拆解/定时任务触发共享，用于分组） */
  executionRef?: string | null;
}

/** 团队任务状态 -> 统一状态 */
export function mapTeamStatus(s: string): UnifiedTaskStatus {
  if (s === 'pending') return 'todo';
  if (s === 'in_progress') return 'running';
  if (s === 'completed') return 'done';
  return 'failed';
}

/** 我的任务状态 -> 统一状态 */
export function mapTaskStatus(s: string): UnifiedTaskStatus {
  if (s === 'queued') return 'todo';
  if (s === 'running') return 'running';
  if (s === 'success') return 'done';
  if (s === 'cancelled') return 'cancelled';
  return 'failed';
}

/** Hermes 调用状态 -> 统一状态 */
export function mapHermesStatus(s: string): UnifiedTaskStatus {
  if (s === 'running') return 'running';
  if (s === 'success') return 'done';
  if (s === 'timeout' || s === 'failed') return 'failed';
  return 'todo';
}

/** 合并排序：按 createdAt 倒序（最新在前；非法时间排最后） */
export function sortByCreatedAtDesc(list: UnifiedTaskItem[]): UnifiedTaskItem[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

