/**
 * 三省六部渲染层 API（IPC 封装，非 HTTP）
 * 主进程 edict-bridge 注册 edict:* 通道；preload 暴露 window.electronAPI.edict。
 * 参考 service-manager-api.ts 模式：electronAPI 未注入时抛错降级。
 */
import type { ElectronAPI } from "@shared/types";
import type {
  EdictAgentConfig,
  EdictAgentsStatusData,
  EdictBoard,
  EdictCourtDiscussResult,
  EdictModelChangeEntry,
  EdictMorningBrief,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictRemoteSkillsResult,
  EdictSessionItem,
  EdictSkillContentResult,
  EdictSkillLibraryResult,
  EdictStats,
  EdictSubConfig,
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

// ===== 补齐面板（edict-extra）：省部调度 / 模型 / 技能 / 朝堂议政 / 天下要闻 / 小任务 / 旨库 =====

/** 省部调度：全部官署 Agent 在线状态 */
export async function edictAgentsStatus(): Promise<EdictAgentsStatusData> {
  return getEdict().agentsStatus();
}

/** 省部调度：唤醒（确保）指定官署 */
export async function edictAgentWake(agentId: string): Promise<EdictOp> {
  return getEdict().agentWake(agentId);
}

/** 模型配置：官署配置（模型/技能/knownModels） */
export async function edictAgentConfig(): Promise<EdictAgentConfig> {
  return getEdict().agentConfig();
}

/** 模型配置：切换官署模型 */
export async function edictSetModel(agentId: string, model: string): Promise<EdictOp> {
  return getEdict().setModel(agentId, model);
}

/** 模型配置：变更日志 */
export async function edictModelChangeLog(): Promise<EdictModelChangeEntry[]> {
  return getEdict().modelChangeLog();
}

/** 技能配置：读取技能内容 */
export async function edictSkillContent(agentId: string, skillName: string): Promise<EdictSkillContentResult> {
  return getEdict().skillContent(agentId, skillName);
}

/** 技能配置：本地新增技能 */
export async function edictAddSkill(agentId: string, skillName: string, description: string, trigger: string): Promise<EdictOp> {
  return getEdict().addSkill(agentId, skillName, description, trigger);
}

/** 技能配置：远程技能列表 */
export async function edictRemoteSkillsList(): Promise<EdictRemoteSkillsResult> {
  return getEdict().remoteSkillsList();
}

/** 技能配置：添加远程技能 */
export async function edictAddRemoteSkill(agentId: string, skillName: string, sourceUrl: string, description?: string): Promise<EdictOp> {
  return getEdict().addRemoteSkill(agentId, skillName, sourceUrl, description);
}

/** 技能配置：更新远程技能 */
export async function edictUpdateRemoteSkill(agentId: string, skillName: string): Promise<EdictOp> {
  return getEdict().updateRemoteSkill(agentId, skillName);
}

/** 技能配置：移除远程技能 */
export async function edictRemoveRemoteSkill(agentId: string, skillName: string): Promise<EdictOp> {
  return getEdict().removeRemoteSkill(agentId, skillName);
}

/** 技能库：技能市场《我的》（OpenClaw 内置 / Hermes 已装 / 云端技能包） */
export async function edictSkillLibrary(): Promise<EdictSkillLibraryResult> {
  return getEdict().skillLibrary();
}

/** 把技能库技能整目录复制到官署 profile */
export async function edictCopySkill(agentId: string, source: string, skillName: string): Promise<EdictOp> {
  return getEdict().copySkill(agentId, source, skillName);
}

/** 删除官署本地技能（可重新添加） */
export async function edictRemoveSkill(agentId: string, skillName: string): Promise<EdictOp> {
  return getEdict().removeSkill(agentId, skillName);
}

/** 朝堂议政：开始 */
export async function edictCourtStart(topic: string, officials: string[], taskId?: string): Promise<EdictCourtDiscussResult> {
  return getEdict().courtDiscussStart(topic, officials, taskId);
}

/** 朝堂议政：推进一轮 */
export async function edictCourtAdvance(sessionId: string, userMessage?: string, decree?: string): Promise<EdictCourtDiscussResult> {
  return getEdict().courtDiscussAdvance(sessionId, userMessage, decree);
}

/** 朝堂议政：散朝总结 */
export async function edictCourtConclude(sessionId: string): Promise<EdictOp & { summary?: string }> {
  return getEdict().courtDiscussConclude(sessionId);
}

/** 朝堂议政：销毁会话 */
export async function edictCourtDestroy(sessionId: string): Promise<EdictOp> {
  return getEdict().courtDiscussDestroy(sessionId);
}

/** 朝堂议政：命运骰子 */
export async function edictCourtFate(): Promise<{ ok: boolean; event: string }> {
  return getEdict().courtDiscussFate();
}

/** 天下要闻：简报 */
export async function edictMorningBrief(): Promise<EdictMorningBrief> {
  return getEdict().morningBrief();
}

/** 天下要闻：订阅配置 */
export async function edictMorningConfig(): Promise<EdictSubConfig> {
  return getEdict().morningConfig();
}

/** 天下要闻：保存订阅配置 */
export async function edictSaveMorningConfig(config: EdictSubConfig): Promise<EdictOp> {
  return getEdict().saveMorningConfig(config);
}

/** 天下要闻：立即采集 */
export async function edictRefreshMorning(): Promise<EdictOp> {
  return getEdict().refreshMorning();
}

/** 天下要闻：采集完成推送 */
export function onEdictMorningUpdated(cb: (brief: EdictMorningBrief) => void): () => void {
  return getEdict().onMorningUpdated(cb);
}

/** 小任务/会话列表 */
export async function edictSessions(): Promise<EdictSessionItem[]> {
  return getEdict().sessions();
}

/** 旨库：模板下旨 */
export async function edictCreateTask(input: { title: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp<{ taskId: string }>> {
  return getEdict().createTask(input);
}
