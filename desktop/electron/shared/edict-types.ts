// 三省六部共享类型（主进程 / 渲染进程共用）
// 数据模型照搬 edict tasks_source.json 结构；状态机照搬 kanban/task.py STATE_TRANSITIONS。

/** 12 态状态机（权威流转表单一事实源：desktop/resources/edict/kanban/task.py） */
export type EdictState =
  | "Pending"
  | "Taizi"
  | "Zhongshu"
  | "Menxia"
  | "Assigned"
  | "Next"
  | "Doing"
  | "Review"
  | "Done"
  | "Blocked"
  | "Cancelled"
  | "PendingConfirm";

export const EDICT_STATES: EdictState[] = [
  "Pending", "Taizi", "Zhongshu", "Menxia", "Assigned", "Next",
  "Doing", "Review", "Done", "Blocked", "Cancelled", "PendingConfirm",
];

/** 看板流转日志（照搬 tasks_source.json flow_log） */
export interface EdictFlowLogEntry {
  at: string;
  from: string;
  to: string;
  remark: string;
  agent?: string;
  agentLabel?: string;
}

/** 子任务（照搬 tasks_source.json todos） */
export interface EdictTodo {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "completed";
  detail?: string;
}

/** 看板任务（照搬 tasks_source.json 单条结构） */
export interface EdictTask {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  state: EdictState;
  assigneeOrg?: string;
  creator?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  org?: string;
  official?: string;
  now?: string;
  eta?: string;
  block?: string;
  output?: string;
  ac?: string;
  archived?: boolean;
  flow_log: EdictFlowLogEntry[];
  progress_log: { at: string; agent: string; text: string; todos?: string[] }[];
  todos: EdictTodo[];
  createdAt?: string;
  updatedAt?: string;
}

/** 看板数据（IPC edict:board / edict:board-updated 载荷） */
export interface EdictBoard {
  tasks: EdictTask[];
  updatedAt: string;
}

/** 官署状态（IPC edict:officials 载荷） */
export interface EdictOfficial {
  id: string;
  label: string;
  status: "idle" | "busy" | "offline";
  role: string;
}

/** 军机处统计（IPC edict:stats 载荷） */
export interface EdictStats {
  total: number;
  byState: Record<string, number>;
  active: number;
  done: number;
  blocked: number;
  vetoCount: number;
  avgDurationMs: number;
}

/** 统一操作结果（IPC 返回值） */
export type EdictOp<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/** 编排单节点结果 */
export interface EdictPipelineStep {
  state: EdictState;
  output?: string;
  error?: string;
}

/** 编排整体结果（IPC edict:run 返回值） */
export interface EdictPipelineResult {
  taskId: string;
  finalState: EdictState;
  steps: EdictPipelineStep[];
}
