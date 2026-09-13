/**
 * 一键组队（team-preset）
 *
 * 对标 RRClaw 的「一键创建 AI 自动化团队」：以套餐为入口，一条流水线把
 * 「飞书多维表格 + 各官署 SOUL + Agent profile + 定时任务」一次性建好。
 *
 * 与 RRClaw 的差异：深瞳用「三省六部 12 官署」作为编制（而非 RRClaw 的 14 岗位），
 * 套餐是官署子集；兑换码复用既有会员兑换能力（由调用方注入）。
 *
 * 设计：纯编排 + 依赖注入（不 import electron），便于单测；
 * 步骤互相解耦，单步失败不中断（记入 failed），支持进度回调与暂停。
 */

export type PresetId = "starter" | "standard" | "flagship";

export interface TeamPreset {
  id: PresetId;
  name: string;
  description: string;
  /** 该套餐包含的官署 id（编制） */
  officials: string[];
  recommended?: boolean;
}

/** 全部官署（旗舰版口径） */
export const ALL_OFFICIALS = [
  "taizi", "zhongshu", "menxia", "shangshu", "libu", "hubu",
  "libu_hr", "bingbu", "xingbu", "gongbu", "zaochao", "qintianjian",
];

/** 三大套餐（对标 RRClaw 流量操盘版/私域运营版/旗舰版） */
export const TEAM_PRESETS: Record<PresetId, TeamPreset> = {
  starter: {
    id: "starter",
    name: "轻量版",
    description: "太子·中书省·尚书省·兵部·工部 五大核心官署，覆盖接旨→规划→派发→拓展→生产",
    officials: ["taizi", "zhongshu", "shangshu", "bingbu", "gongbu"],
  },
  standard: {
    id: "standard",
    name: "标准版",
    description: "在轻量版基础上补齐门下省·礼部·户部·刑部，形成完整审议—执行—审计闭环",
    officials: ["taizi", "zhongshu", "menxia", "shangshu", "libu", "hubu", "bingbu", "xingbu", "gongbu"],
    recommended: true,
  },
  flagship: {
    id: "flagship",
    name: "旗舰版",
    description: "三省六部十二官署全员就位，含吏部人事、钦天监度量、早朝简报",
    officials: [...ALL_OFFICIALS],
  },
};

export const DEFAULT_PRESET_ID: PresetId = "standard";

export function getPreset(id: string): TeamPreset | null {
  return (TEAM_PRESETS as Record<string, TeamPreset>)[id] ?? null;
}

/** 计算增量计划：待建 = 目标套餐 − 已装；待删 = 已装 − 目标套餐 */
export function computePlan(
  target: string[],
  installed: string[],
): { toCreate: string[]; toRemove: string[]; isFirstRun: boolean } {
  const t = new Set(target);
  const i = new Set(installed);
  const toCreate = target.filter((x) => !i.has(x));
  const toRemove = installed.filter((x) => !t.has(x));
  return { toCreate, toRemove, isFirstRun: installed.length === 0 };
}

// ===== 流水线 =====

export type TeamStep =
  | "cleanup"
  | "bitable"
  | "soul"
  | "agent"
  | "cron"
  | "strategic"
  | "seed"
  | "done";

export interface TeamProgress {
  step: TeamStep;
  message?: string;
  current?: string;
  completed?: number;
  total?: number;
  error?: string;
}

export interface TeamStepResult {
  step: TeamStep;
  ok: boolean;
  message?: string;
  error?: string;
}

export interface TeamCreationResult {
  ok: boolean;
  presetId: PresetId;
  officials: string[];
  steps: TeamStepResult[];
  created: string[];
  removed: string[];
  failed: Array<{ step: TeamStep; official?: string; error: string }>;
  error?: string;
}

export interface TeamPresetDeps {
  /** 已安装官署（读取现状，用于算增量） */
  listInstalled: () => Promise<string[]>;
  /** 初始化飞书多维表格（feishu-bitable.initBitable） */
  initBitable: () => Promise<{ ok: boolean; error?: string }>;
  /** 写单个官署 SOUL（把蓝本 SOUL 落到 profile 目录） */
  writeSoul: (official: string) => Promise<{ ok: boolean; error?: string }>;
  /** 确保官署 Agent profile 存在（幂等） */
  ensureAgent: (official: string) => Promise<{ ok: boolean; error?: string }>;
  /** 为该官署创建默认定时任务 */
  createCron: (official: string) => Promise<{ ok: boolean; error?: string; created?: number }>;
  /** 删除套餐外官署的 Agent profile 与定时任务 */
  removeOfficial: (official: string) => Promise<{ ok: boolean; error?: string }>;
  /** 清理首次安装的旧多维表格配置（首次运行才调用） */
  cleanup?: () => Promise<{ ok: boolean; error?: string }>;
  /** 创建/复用战略方向文档 */
  strategicDoc?: () => Promise<{ ok: boolean; error?: string }>;
  /** 预填模板数据（如爆款提示词） */
  seed?: () => Promise<{ ok: boolean; error?: string }>;
  onProgress?: (p: TeamProgress) => void;
}

async function runStep(
  step: TeamStep,
  fn: () => Promise<{ ok: boolean; error?: string; created?: number }>,
  deps: TeamPresetDeps,
  failed: TeamCreationResult["failed"],
): Promise<TeamStepResult> {
  deps.onProgress?.({ step, message: `执行 ${step}…` });
  try {
    const r = await fn();
    if (!r.ok) {
      failed.push({ step, error: r.error || "失败" });
      deps.onProgress?.({ step, error: r.error });
      return { step, ok: false, error: r.error };
    }
    return { step, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failed.push({ step, error: msg });
    deps.onProgress?.({ step, error: msg });
    return { step, ok: false, error: msg };
  }
}

/**
 * 执行一键组队流水线。
 * 顺序：cleanup(首次) → bitable → agent → soul → strategic → seed → cron → done
 * - 单步失败不中断（记 failed）
 * - 增量：只处理待建/待删官署
 * - 飞书凭证缺失时 bitable/strategic 失败但不阻塞 Agent/SOUL/Cron（对标 RRClaw 降级）
 */
export async function runTeamCreation(
  presetId: PresetId,
  deps: TeamPresetDeps,
): Promise<TeamCreationResult> {
  const preset = getPreset(presetId);
  if (!preset) {
    return { ok: false, presetId, officials: [], steps: [], created: [], removed: [], failed: [], error: `未知套餐：${presetId}` };
  }

  const steps: TeamStepResult[] = [];
  const failed: TeamCreationResult["failed"] = [];
  const installed = await deps.listInstalled();
  const plan = computePlan(preset.officials, installed);
  deps.onProgress?.({ step: "cleanup", message: plan.isFirstRun ? "首次安装，清理旧配置" : "增量安装" });

  // 1) 清理（仅首次）
  if (plan.isFirstRun && deps.cleanup) {
    steps.push(await runStep("cleanup", () => deps.cleanup!(), deps, failed));
  } else {
    steps.push({ step: "cleanup", ok: true });
  }

  // 2) 建多维表格
  steps.push(await runStep("bitable", () => deps.initBitable(), deps, failed));

  // 3) 建 Agent profile（先建 profile，SOUL 才有落点）
  const agentOk: string[] = [];
  for (const o of plan.toCreate) {
    deps.onProgress?.({ step: "agent", current: o, message: `创建 ${o} 的 Agent` });
    const r = await runStep("agent", () => deps.ensureAgent(o), deps, failed);
    if (r.ok) agentOk.push(o);
  }
  if (plan.toCreate.length === 0) steps.push({ step: "agent", ok: true, message: "无新增官署" });

  // 4) 写 SOUL（对全部目标官署，保证幂等覆盖）
  let soulDone = 0;
  for (const o of preset.officials) {
    deps.onProgress?.({ step: "soul", current: o, completed: soulDone, total: preset.officials.length, message: `写入 ${o} 的 SOUL` });
    const r = await runStep("soul", () => deps.writeSoul(o), deps, failed);
    if (r.ok) soulDone++;
  }

  // 5) 战略文档（可选）
  if (deps.strategicDoc) {
    steps.push(await runStep("strategic", () => deps.strategicDoc!(), deps, failed));
  }

  // 6) 预填模板（可选）
  if (deps.seed) {
    steps.push(await runStep("seed", () => deps.seed!(), deps, failed));
  }

  // 7) 定时任务
  let cronCreated = 0;
  for (const o of preset.officials) {
    deps.onProgress?.({ step: "cron", current: o, message: `创建 ${o} 的定时任务` });
    const r: { ok: boolean; error?: string; created?: number } = await deps
      .createCron(o)
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (r.ok) cronCreated += r.created ?? 0;
    else failed.push({ step: "cron", official: o, error: r.error || "失败" });
  }

  // 8) 删除套餐外官署（换套餐时）
  const removed: string[] = [];
  for (const o of plan.toRemove) {
    deps.onProgress?.({ step: "cleanup", current: o, message: `移除套餐外官署 ${o}` });
    const r: { ok: boolean; error?: string } = await deps
      .removeOfficial(o)
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (r.ok) removed.push(o);
    else failed.push({ step: "cleanup", official: o, error: r.error || "失败" });
  }

  deps.onProgress?.({ step: "done", message: `完成：新增 ${plan.toCreate.length} 官署 / 定时任务 ${cronCreated} 条 / 移除 ${removed.length}` });

  const hardFail = failed.filter((f) => f.step === "cleanup" || f.step === "agent");
  return {
    ok: hardFail.length === 0,
    presetId,
    officials: preset.officials,
    steps,
    created: plan.toCreate,
    removed,
    failed,
  };
}
