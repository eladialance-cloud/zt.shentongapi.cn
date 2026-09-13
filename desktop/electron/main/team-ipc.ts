/**
 * 一键组队 IPC（team-ipc）
 *
 * 把 team-preset 的抽象流水线接到深瞳真实能力上：
 *  - listInstalled：读 $HERMES_HOME/profiles 下已存在的官署
 *  - initBitable：飞书多维表格一键创建（feishu-bitable）
 *  - ensureAgent：ensureEdictHermesProfiles([id]) 幂等建 profile
 *  - writeSoul：蓝本 SOUL → 占位符替换（official-tables 链接）→ 写 profile/SOUL.md
 *  - createCron：调云端 /scheduled-tasks 建 command 型定时任务（agentId 归属官署）
 *  - removeOfficial：删 profile 目录 + 删该官署定时任务
 *
 * 依赖注入便于单测；注册 IPC 用 registerTeamIpc。
 */
import { ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamCreationResult, TeamPresetDeps, TeamProgress, PresetId } from "./team-preset";
import { runTeamCreation, TEAM_PRESETS, getPreset } from "./team-preset";
import { getOfficialTables, writeRenderedSoul } from "./official-detail";

/** 官署默认定时任务（对标 RRClaw 的 44 条 command 任务；能对到 flows 的走 flow，其余走 llm） */
export interface DefaultCron {
  name: string;
  expr: string;
  executeKind: "llm" | "flow";
  flowId?: string;
  flowParams?: Record<string, unknown>;
  description?: string;
}

export const DEFAULT_CRONS: Record<string, DefaultCron[]> = {
  taizi: [],
  zhongshu: [
    { name: "中书省·每日方案规划", expr: "0 7 * * *", executeKind: "llm", description: "汇总太子分拣的任务，产出当日执行方案" },
  ],
  menxia: [
    { name: "门下省·每日审议纪要", expr: "30 7 * * *", executeKind: "llm", description: "审议中书省方案并留痕" },
  ],
  shangshu: [
    { name: "尚书省·每日作战地图", expr: "0 8 * * *", executeKind: "llm", description: "生成当日作战地图并派发六部" },
    { name: "尚书省·每日战报汇总", expr: "0 20 * * *", executeKind: "llm", description: "汇总六部产出，生成每日战报" },
  ],
  libu: [
    { name: "礼部·数据采集", expr: "30 8 * * *", executeKind: "llm", description: "采集数据情报并写入情报域" },
  ],
  hubu: [
    { name: "户部·每日收支核对", expr: "0 21 * * *", executeKind: "llm", description: "核对当日收支与算力消耗" },
  ],
  libu_hr: [
    { name: "吏部·每日巡检", expr: "0 9 * * 1", executeKind: "llm", description: "巡检各官署配置与运行状态" },
  ],
  bingbu: [
    { name: "兵部·客户跟进", expr: "30 9 * * *", executeKind: "flow", flowId: "sales-service-followup", description: "执行客户跟进业务流" },
  ],
  xingbu: [
    { name: "刑部·合规抽检", expr: "0 15 * * *", executeKind: "llm", description: "抽检话术与内容合规性" },
  ],
  gongbu: [
    { name: "工部·公众号文章", expr: "0 11 * * *", executeKind: "flow", flowId: "new-media-wechat-article", description: "生产公众号文章" },
    { name: "工部·每日海报", expr: "30 8 * * *", executeKind: "flow", flowId: "secretary-daily-poster", description: "生成每日海报" },
  ],
  zaochao: [
    { name: "早朝·每日简报", expr: "0 6 * * *", executeKind: "llm", description: "生成每日简报素材" },
  ],
  qintianjian: [
    { name: "钦天监·每日复盘", expr: "0 22 * * *", executeKind: "llm", description: "度量与趋势复盘" },
  ],
};

export interface TeamIpcDeps {
  hermesHome: string;
  edictProfilesDir: string;
  edictDataRoot: string;
  /** 初始化飞书多维表格（返回 appToken 便于战略文档/预填） */
  initBitable: () => Promise<{ ok: boolean; error?: string }>;
  /** 幂等创建官署 profile（ensureEdictHermesProfiles） */
  ensureAgents: (ids: string[]) => Promise<{ ok: boolean; created: string[]; reason?: string }>;
  /** 云端 API 基址（ST_API_BASE） */
  stApiBase: string;
  /** 读取云端登录 token */
  getAuthToken: () => string;
  /** 可注入 fetch（单测） */
  fetchImpl?: typeof fetch;
  /** 广播进度到渲染层 */
  emitProgress?: (p: TeamProgress) => void;
  /** 建战略方向文档（可选） */
  createStrategicDoc?: () => Promise<{ ok: boolean; error?: string }>;
  /** 预填模板数据（可选） */
  seedTemplates?: () => Promise<{ ok: boolean; error?: string }>;
}

/** 列出已安装的官署（$HERMES_HOME/profiles 下存在的官署 id） */
export function listInstalledOfficials(hermesHome: string, officialIds: string[]): string[] {
  const root = path.join(hermesHome, "profiles");
  try {
    if (!fs.existsSync(root)) return [];
    const present = new Set(fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
    return officialIds.filter((id) => present.has(id));
  } catch {
    return [];
  }
}

/** 写某官署 SOUL：蓝本 → 占位符替换 → profile/SOUL.md（委托 official-detail 的唯一写入方） */
export function writeOfficialSoul(
  edictProfilesDir: string,
  edictDataRoot: string,
  hermesHome: string,
  official: string,
): { ok: boolean; error?: string; replaced?: number; missing?: string[] } {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(official)) return { ok: false, error: "非法官署 id" };
  const src = path.join(edictProfilesDir, `${official}.md`);
  if (!fs.existsSync(src)) return { ok: false, error: `蓝本 SOUL 不存在：${official}.md` };
  const r = writeRenderedSoul(src, path.join(hermesHome, "profiles", official, "SOUL.md"), getOfficialTables(edictDataRoot, official));
  return r.ok ? { ok: true, replaced: r.replaced, missing: r.missing } : { ok: false, error: r.error };
}

export interface SoulSyncItem {
  official: string;
  ok: boolean;
  replaced?: number;
  missing?: string[];
  error?: string;
}

/**
 * 批量同步官署 SOUL 的飞书表链接（占位符 → 真实链接）。
 * 使用场景：建表成功后回填、手动改了表链接后刷新、或 SOUL 先于建表生成时补写。
 * 幂等：无链接的占位符原样保留并计入 missing（不伪造链接）。
 */
export function syncOfficialSouls(
  deps: Pick<TeamIpcDeps, "edictProfilesDir" | "edictDataRoot" | "hermesHome">,
  officials?: string[],
): { ok: boolean; synced: number; totalReplaced: number; items: SoulSyncItem[] } {
  const ids = (officials && officials.length
    ? officials
    : ALL_OFFICIAL_IDS_LIST) as string[];
  const items: SoulSyncItem[] = [];
  let synced = 0;
  let totalReplaced = 0;
  for (const o of ids) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(o)) {
      items.push({ official: o, ok: false, error: "非法官署 id" });
      continue;
    }
    const r = writeOfficialSoul(deps.edictProfilesDir, deps.edictDataRoot, deps.hermesHome, o);
    if (r.ok) {
      synced++;
      totalReplaced += r.replaced ?? 0;
      items.push({ official: o, ok: true, replaced: r.replaced, missing: r.missing });
    } else {
      items.push({ official: o, ok: false, error: r.error });
    }
  }
  return { ok: items.every((i) => i.ok), synced, totalReplaced, items };
}

const ALL_OFFICIAL_IDS_LIST = [
  "taizi", "zhongshu", "menxia", "shangshu", "libu", "hubu",
  "libu_hr", "bingbu", "xingbu", "gongbu", "zaochao", "qintianjian",
];

function authHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** 建某官署的默认定时任务（POST /scheduled-tasks；已存在的同名跳过） */
export async function createOfficialCrons(
  deps: TeamIpcDeps,
  official: string,
): Promise<{ ok: boolean; error?: string; created: number }> {
  const list = DEFAULT_CRONS[official] ?? [];
  if (list.length === 0) return { ok: true, created: 0 };
  const token = deps.getAuthToken();
  if (!token) return { ok: false, error: "未登录，无法创建定时任务", created: 0 };
  const f = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!f) return { ok: false, error: "当前环境不支持 fetch", created: 0 };
  let created = 0;
  for (const c of list) {
    try {
      const res = await f(`${deps.stApiBase}/scheduled-tasks`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          title: c.name,
          description: c.description ?? "",
          repeatType: "daily",
          runTime: exprToRunTime(c.expr),
          weekday: exprToWeekday(c.expr),
          agentId: official,
          executeKind: c.executeKind,
          flowId: c.flowId,
          flowParams: c.flowParams ? JSON.stringify(c.flowParams) : undefined,
        }),
      });
      const json = (await res.json()) as { code?: number; message?: string };
      // 后端约定：code 0/200 成功；冲突视为已存在（幂等）
      if (json.code === 0 || json.code === 200 || res.ok) created++;
    } catch {
      // 单条失败继续
    }
  }
  return { ok: true, created };
}

/** 从 cron 表达式提取 HH:mm（后端 repeatType 用 daily+runTime） */
export function exprToRunTime(expr: string): string {
  const parts = (expr || "").trim().split(/\s+/);
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return "08:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 从 cron 表达式提取 weekday（1-7，周一=1）；非周任务返回 undefined */
export function exprToWeekday(expr: string): number | undefined {
  const parts = (expr || "").trim().split(/\s+/);
  const dow = parts[4];
  if (!dow || dow === "*") return undefined;
  const n = Number(dow);
  if (!Number.isFinite(n)) return undefined;
  // 后端 weekday 1=周一；cron 0=周日 → 0 映射为 7
  return n === 0 ? 7 : n;
}

/** 删除官署：删 profile 目录 + 该官署的定时任务（按 agentId+标题+时间+星期 精确匹配，避免同名误删） */
export async function removeOfficial(
  deps: TeamIpcDeps,
  official: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(official)) return { ok: false, error: "非法官署 id" };
  // 删 profile 目录
  try {
    const dir = path.join(deps.hermesHome, "profiles", official);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // 删该官署的默认定时任务：列表只取一次，逐条按四要素精确匹配
  const list = DEFAULT_CRONS[official] ?? [];
  if (list.length === 0) return { ok: true };
  const token = deps.getAuthToken();
  const f = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!token || !f) return { ok: true };
  try {
    const res = await f(`${deps.stApiBase}/scheduled-tasks?agentId=${encodeURIComponent(official)}`, {
      method: "GET",
      headers: authHeaders(token),
    });
    const json = (await res.json()) as {
      data?: Array<{
        id?: number | string;
        title?: string;
        agentId?: string | null;
        runTime?: string | null;
        weekday?: number | null;
      }>;
    };
    const items = Array.isArray(json.data) ? json.data : [];
    for (const c of list) {
      const wantRunTime = exprToRunTime(c.expr);
      const wantWeekday = exprToWeekday(c.expr) ?? null;
      const hit = items.filter(
        (it) =>
          it.id !== undefined &&
          it.title === c.name &&
          (it.agentId ?? "") === official &&
          (it.runTime ?? "") === wantRunTime &&
          (it.weekday ?? null) === wantWeekday,
      );
      for (const it of hit) {
        await f(`${deps.stApiBase}/scheduled-tasks/${it.id}`, { method: "DELETE", headers: authHeaders(token) });
      }
    }
  } catch {
    // 清理定时任务失败不应阻塞删官署
  }
  return { ok: true };
}

/** 组装团队流水线依赖 */
export function buildTeamDeps(deps: TeamIpcDeps): TeamPresetDeps {
  const allIds = Object.values(TEAM_PRESETS).flatMap((p) => p.officials);
  const allOfficials = Array.from(new Set(allIds));
  return {
    listInstalled: async () => listInstalledOfficials(deps.hermesHome, allOfficials),
    initBitable: () => deps.initBitable(),
    ensureAgent: async (o) => {
      const r = await deps.ensureAgents([o]);
      return r.ok ? { ok: true } : { ok: false, error: r.reason };
    },
    writeSoul: async (o) => {
      const r = writeOfficialSoul(deps.edictProfilesDir, deps.edictDataRoot, deps.hermesHome, o);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    createCron: (o) => createOfficialCrons(deps, o),
    removeOfficial: (o) => removeOfficial(deps, o),
    strategicDoc: deps.createStrategicDoc,
    seed: deps.seedTemplates,
    onProgress: (p) => deps.emitProgress?.(p),
  };
}

/** 当前组队状态（进行中/上次结果），用于渲染层轮询 */
let running = false;
let lastResult: TeamCreationResult | null = null;

export function getTeamCreationStatus(): { isRunning: boolean; lastResult: TeamCreationResult | null } {
  return { isRunning: running, lastResult };
}

export async function triggerTeamCreation(presetId: PresetId, deps: TeamIpcDeps): Promise<TeamCreationResult> {
  if (running) return { ok: false, presetId, officials: [], steps: [], created: [], removed: [], failed: [], error: "已有创建任务进行中" };
  running = true;
  try {
    const result = await runTeamCreation(presetId, buildTeamDeps(deps));
    lastResult = result;
    return result;
  } finally {
    running = false;
  }
}

/** 注册 group:* IPC */
export function registerTeamIpc(deps: TeamIpcDeps): () => void {
  ipcMain.handle("team:list-presets", () => ({
    ok: true,
    defaultPresetId: "standard",
    presets: Object.values(TEAM_PRESETS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      officials: p.officials,
      recommended: !!p.recommended,
    })),
  }));
  ipcMain.handle("team:creation-status", () => ({ ok: true, ...getTeamCreationStatus() }));
  ipcMain.handle("team:create", async (_e, presetId: unknown) => {
    const id = typeof presetId === "string" ? presetId : "";
    if (!getPreset(id)) return { ok: false, error: `未知套餐：${id}` };
    return triggerTeamCreation(id as PresetId, deps);
  });
  ipcMain.handle("team:write-soul", (_e, official: unknown) => {
    const o = typeof official === "string" ? official : "";
    return writeOfficialSoul(deps.edictProfilesDir, deps.edictDataRoot, deps.hermesHome, o);
  });
  ipcMain.handle("team:list-crons", (_e, official: unknown) => {
    const o = typeof official === "string" ? official : "";
    return { ok: true, crons: DEFAULT_CRONS[o] ?? [] };
  });
  // 批量重写官署 SOUL 的飞书表链接（占位符 → 真实链接），返回到每官署 replaced/missing
  ipcMain.handle("team:sync-soul", (_e, officials: unknown) => {
    const list = Array.isArray(officials)
      ? (officials.filter((x) => typeof x === "string") as string[])
      : undefined;
    return syncOfficialSouls(deps, list);
  });
  // 各官署表链接回填状态汇总（用于 UI 展示「还有哪些占位符未填」）
  ipcMain.handle("team:soul-status", () => {
    const statuses = ALL_OFFICIAL_IDS_LIST.map((o) => {
      const tables = getOfficialTables(deps.edictDataRoot, o);
      const linked = tables.filter((t) => t.url).length;
      return { official: o, total: tables.length, linked };
    });
    return { ok: true, statuses, allLinked: statuses.every((s) => s.linked === s.total && s.total > 0) };
  });

  return () => {
    for (const ch of ["team:list-presets", "team:creation-status", "team:create", "team:write-soul", "team:list-crons", "team:sync-soul", "team:soul-status"]) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        // 忽略
      }
    }
  };
}
