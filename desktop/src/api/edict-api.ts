/**
 * 三省六部渲染层 API（IPC 封装，非 HTTP）
 * 主进程 edict-bridge 注册 edict:* 通道；preload 暴露 window.electronAPI.edict。
 * 参考 service-manager-api.ts 模式：electronAPI 未注入时抛错降级。
 */
import type { ElectronAPI } from "@shared/types";
import type {
  EdictBoard,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictStats,
  EdictTask,
} from "@shared/edict-types";

/** electronAPI.edict 是否可用（preload 未注入时降级） */
export function isEdictAvailable(): boolean {
  return !!window.electronAPI?.edict;
}

function getEdict(): ElectronAPI["edict"] {
  const api = window.electronAPI?.edict;
  if (!api) throw new Error("electronAPI.edict 不可用（preload 未注入）");
  return api;
}

/** 下旨：太子建任务（create → Zhongshu），返回 taskId */
export async function edictIssue(input: {
  title: string;
  body?: string;
  priority?: string;
  dept?: string;
}): Promise<EdictOp<{ taskId: string }>> {
  return getEdict().issue(input);
}

/** 全量看板 */
export async function edictBoard(): Promise<EdictBoard> {
  return getEdict().board();
}

/** 单个任务 */
export async function edictTask(taskId: string): Promise<EdictOp<EdictTask | null>> {
  return getEdict().task(taskId);
}

/** 状态流转（主进程校验状态机，非法返回原因） */
export async function edictTransition(taskId: string, to: string, note?: string): Promise<EdictOp> {
  return getEdict().transition(taskId, to, note);
}

/** 封驳（门下 → 中书，需 reason） */
export async function edictVeto(taskId: string, reason: string): Promise<EdictOp> {
  return getEdict().veto(taskId, reason);
}

/** 准奏（门下 → 尚书） */
export async function edictApprove(taskId: string): Promise<EdictOp> {
  return getEdict().approve(taskId);
}

/** 完成收口（done） */
export async function edictComplete(taskId: string, output?: string, summary?: string, actorAgentId?: string): Promise<EdictOp> {
  return getEdict().complete(taskId, output || "", summary || "", actorAgentId);
}

/** 阻塞 / 解阻 */
export async function edictBlock(taskId: string, reason: string): Promise<EdictOp> {
  return getEdict().block(taskId, reason);
}

/** 进展上报 */
export async function edictProgress(taskId: string, text: string, plan?: string): Promise<EdictOp> {
  return getEdict().progress(taskId, text, plan);
}

/** 编排执行：当前状态按状态机推进到终态（Hermes CLI 逐节点） */
export async function edictRun(taskId: string, opts?: { maxVetoRounds?: number }): Promise<EdictOp<EdictPipelineResult>> {
  return getEdict().run(taskId, opts);
}

/** 官署状态 */
export async function edictOfficials(): Promise<EdictOfficial[]> {
  return getEdict().officials();
}

/** 军机处统计 */
export async function edictStats(): Promise<EdictStats> {
  return getEdict().stats();
}

/** 默认模型 + 官署 profiles */
export async function edictModels(): Promise<{ default: string; profiles: { id: string; label: string }[] }> {
  return getEdict().models();
}

/** 看板变化推送（edict:board-updated）；返回取消监听函数 */
export function onEdictBoardUpdated(cb: (board: EdictBoard) => void): () => void {
  return getEdict().onBoardUpdated(cb);
}

/** 单任务变化推送（edict:task-updated）；返回取消监听函数 */
export function onEdictTaskUpdated(cb: (task: EdictTask) => void): () => void {
  return getEdict().onTaskUpdated(cb);
}
