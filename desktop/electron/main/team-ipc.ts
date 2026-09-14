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
import { ALL_EDICT_OFFICIALS, readRoster, writeRoster } from "./edict-roster";

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
  taizi: [
    { name: "太子·每日任务分拣", expr: "30 6 * * *", executeKind: "llm", description: "分拣夜间积压的旨意，按宪章归口到对应官署" },
    { name: "太子·晚间旨意收口", expr: "30 19 * * *", executeKind: "llm", description: "回收当日未闭环的旨意，登记次日待办" },
  ],
  zhongshu: [
    { name: "中书省·战略要点同步", expr: "15 6 * * *", executeKind: "llm", description: "读《战略方向文档》，把当日战略要点同步给尚书省派发节点" },
    { name: "中书省·每日方案规划", expr: "0 7 * * *", executeKind: "llm", description: "汇总太子分拣的任务，产出当日执行方案" },
    { name: "中书省·当日方案交账", expr: "0 19 * * *", executeKind: "llm", description: "复盘当日方案与实际产出偏差，更新方案表状态" },
    { name: "中书省·战略复盘迭代", expr: "0 20 * * 0", executeKind: "llm", description: "每周日复盘本周战报，判断是否迭代战略方向文档并追加版本留痕" },
  ],
  menxia: [
    { name: "门下省·每日审议纪要", expr: "30 7 * * *", executeKind: "llm", description: "审议中书省方案，封驳意见留痕到审核记录表" },
    { name: "门下省·驳回件复检", expr: "0 16 * * *", executeKind: "llm", description: "复检当日被驳回方案，确认修订后重新封驳" },
  ],
  shangshu: [
    { name: "尚书省·每日作战地图", expr: "0 8 * * *", executeKind: "llm", description: "生成当日作战地图并派发六部，写入派发执行汇总表" },
    { name: "尚书省·午间进度巡检", expr: "30 13 * * *", executeKind: "llm", description: "巡检六部上午派发任务完成率，超时任务升级" },
    { name: "尚书省·当日产出归档", expr: "30 19 * * *", executeKind: "llm", description: "汇总当日各官署产出与飞书写入结果，回写归档索引表" },
    { name: "尚书省·每日战报汇总", expr: "0 20 * * *", executeKind: "llm", description: "汇总六部产出生成每日战报，写入派发执行汇总表" },
  ],
  libu: [
    { name: "礼部·数据采集", expr: "30 8 * * *", executeKind: "llm", description: "采集行业数据情报并写入数据情报表" },
    { name: "礼部·关键词规划", expr: "45 8 * * *", executeKind: "llm", description: "读战略方向文档与作战地图，筛选当日采集关键词写入关键词表" },
    { name: "礼部·爆款采集", expr: "0 9 * * *", executeKind: "flow", flowId: "traffic-collect-hot-videos", description: "按关键词采集 Top50 爆款内容，拆解结构写入爆款采集表" },
    { name: "礼部·监控账号采集", expr: "15 9 * * *", executeKind: "llm", description: "采集监控账号最新视频并转写文案，更新数据情报表" },
  ],
  hubu: [
    { name: "户部·每日收支核对", expr: "0 21 * * *", executeKind: "llm", description: "核对当日收支与算力消耗，写入财务收支表" },
    { name: "户部·算力消耗对账", expr: "45 21 * * *", executeKind: "llm", description: "核对当日模型调用与算力消耗明细，写入财务收支表" },
  ],
  libu_hr: [
    { name: "吏部·每日巡检", expr: "0 9 * * 1", executeKind: "llm", description: "巡检各官署配置与运行状态，写入人事绩效表" },
    { name: "吏部·官署产出考核", expr: "30 22 * * *", executeKind: "llm", description: "按当日产出与按时率给各官署打绩效分，写入人事绩效表" },
  ],
  bingbu: [
    { name: "兵部·晨间客户清单", expr: "45 6 * * *", executeKind: "llm", description: "读客户档案表，生成当日沟通清单" },
    { name: "兵部·早间私域推送", expr: "0 8 * * *", executeKind: "flow", flowId: "private-domain-morning-push", description: "按当日清单向私域社群推送早间内容" },
    { name: "兵部·社群服务推送", expr: "15 9 * * *", executeKind: "llm", description: "生成服务群推送稿并登记待推送清单，写入社群运营表（外发由业务流风控闸门执行）" },
    { name: "兵部·客户跟进", expr: "30 9 * * *", executeKind: "flow", flowId: "sales-service-followup", description: "执行客户跟进业务流，回写客户跟进表" },
    { name: "兵部·渠道采集与线索分级", expr: "0 10 * * *", executeKind: "llm", description: "采集渠道线索并按意向分级，写入渠道触达表" },
    { name: "兵部·客户健康度巡检", expr: "15 10 * * 1", executeKind: "llm", description: "每周一分析客户活跃度与风险，触达高风险/高价值客户" },
    { name: "兵部·社群与私域答疑", expr: "30 14 * * *", executeKind: "llm", description: "按 FAQ 与战略口径生成答疑话术并留痕社群运营表（外发由风控闸门执行）" },
    { name: "兵部·答疑日报", expr: "0 17 * * *", executeKind: "llm", description: "汇总当日答疑数据生成答疑日报，写入社群运营表" },
    { name: "兵部·晚间客户复盘", expr: "15 18 * * *", executeKind: "llm", description: "汇总当日沟通记录，回写客户档案表与客户跟进表" },
    { name: "兵部·每日销售日报", expr: "30 18 * * *", executeKind: "llm", description: "统计当日转化数据，生成销售日报" },
  ],
  xingbu: [
    { name: "刑部·低效话术淘汰", expr: "0 3 * * *", executeKind: "llm", description: "轮巡话术效果，淘汰回复率<10%或加微率<5%的低效话术" },
    { name: "刑部·合规抽检", expr: "0 15 * * *", executeKind: "llm", description: "抽检话术与内容合规性，写入合规审查表" },
  ],
  gongbu: [
    { name: "工部·早间朋友圈", expr: "40 7 * * *", executeKind: "llm", description: "制作行业洞察型朋友圈内容写入朋友圈内容库，按风控闸门择时发布" },
    { name: "工部·每日海报", expr: "30 8 * * *", executeKind: "flow", flowId: "secretary-daily-poster", description: "按当日选题生成每日海报，写入每日海报表" },
    { name: "工部·文案二创", expr: "0 10 * * *", executeKind: "flow", flowId: "traffic-generate-copy", description: "按爆款结构生成文案，写入文案库" },
    { name: "工部·公众号文章", expr: "0 11 * * *", executeKind: "flow", flowId: "new-media-wechat-article", description: "生产公众号文章，写入内容生产表" },
    { name: "工部·午间朋友圈", expr: "30 11 * * *", executeKind: "llm", description: "制作案例/干货型午间朋友圈内容写入朋友圈内容库，按风控闸门择时发布" },
    { name: "工部·晚间朋友圈", expr: "0 18 * * *", executeKind: "llm", description: "制作人设/感悟型晚间朋友圈内容写入朋友圈内容库，按风控闸门择时发布" },
    { name: "工部·公众号定时发布", expr: "0 19 * * *", executeKind: "llm", description: "整理当日公众号文章并登记发布任务，同步社群/朋友圈（外发由风控闸门执行）" },
  ],
  zaochao: [
    { name: "早朝·每日简报", expr: "0 6 * * *", executeKind: "llm", description: "生成每日简报素材，写入每日简报素材表" },
  ],
  qintianjian: [
    { name: "钦天监·数据沉淀", expr: "0 0 * * *", executeKind: "llm", description: "沉淀前一日全量度量数据，写入度量报表" },
    { name: "钦天监·KPI 基线测算", expr: "0 6 * * *", executeKind: "llm", description: "按战略方向文档测算当日 KPI 基线，供早朝与派发使用" },
    { name: "钦天监·趋势预测", expr: "0 21 * * *", executeKind: "llm", description: "按当日数据预测次日趋势，输出度量报表结论" },
    { name: "钦天监·每日复盘", expr: "0 22 * * *", executeKind: "llm", description: "度量与趋势复盘，写入度量报表" },
  ],
};
export interface TeamIpcDeps {
  hermesHome: string;
  edictProfilesDir: string;
  edictDataRoot: string;
  /** 编制落盘目录（app.getPath('userData')）；选择套餐后写入 edict-roster.json */
  userDataDir: string;
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

/** 官署全集（与 team-preset / edict-roster 同源，避免多处漂移） */
const ALL_OFFICIAL_IDS_LIST: string[] = [...ALL_EDICT_OFFICIALS];

function authHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** 定时任务匹配键（标题+官署+触发时间+星期）—— 建与删共用同一口径，避免同名误判 */
export function cronMatchKey(input: {
  title?: string | null;
  agentId?: string | null;
  runTime?: string | null;
  weekday?: number | null;
}): string {
  const weekday = input.weekday === null || input.weekday === undefined ? "" : String(input.weekday);
  return [input.title ?? "", input.agentId ?? "", input.runTime ?? "", weekday].join("|");
}

/** 已存在的定时任务行（只取匹配需要的字段） */
export interface ExistingTask {
  id?: number | string;
  title?: string;
  agentId?: string | null;
  runTime?: string | null;
  weekday?: number | null;
  repeatType?: string | null;
}

/**
 * 拉取当前用户已存在的定时任务。
 *
 * 注意：后端 GET /scheduled-tasks 只按 userId 过滤（controller 未接 agentId 查询参数），
 * 返回的是全量列表 —— 所以这里只取一次，由调用方按四要素（标题+官署+时间+星期）匹配，
 * 也兼容裸数组 / { code, data } 两种返回形态。
 * 失败返回空数组：调用方按「无已存在」继续，不阻塞组队。
 */
async function listAllTasks(
  deps: TeamIpcDeps,
  f: typeof fetch,
  token: string,
): Promise<ExistingTask[]> {
  try {
    const res = await f(`${deps.stApiBase}/scheduled-tasks`, {
      method: "GET",
      headers: authHeaders(token),
    });
    const json = (await res.json()) as ExistingTask[] | { data?: ExistingTask[] };
    const data = Array.isArray(json) ? json : json?.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 建某官署的默认定时任务（POST /scheduled-tasks）。
 *
 * 幂等 + 自愈（2026-09-14 修）：后端 POST /scheduled-tasks 不做去重，此前重复跑「一键组队」会把同一批
 * 任务翻倍写入（例如为了让战略文档重建而重跑一次，44 条就变 88 条）。现在：
 *  - 创建前先拉现有任务，按四要素（标题+官署+runTime+weekday）已存在则跳过，只补缺的；
 *  - 同四要素出现多条（历史重跑留下的重复行）时，只保留 id 最小的一条，其余删掉（自愈历史数据）；
 *  - created/skipped/deduped/fixed 如实回报；任一条失败则 ok:false 并带出后端原因
 *    （此前单条失败被静默吞掉，界面显示「成功」，实际一条都没建成）。
 */
export async function createOfficialCrons(
  deps: TeamIpcDeps,
  official: string,
): Promise<{ ok: boolean; error?: string; created: number; skipped: number; deduped: number; fixed: number }> {
  const list = DEFAULT_CRONS[official] ?? [];
  if (list.length === 0) return { ok: true, created: 0, skipped: 0, deduped: 0, fixed: 0 };
  const token = deps.getAuthToken();
  if (!token) return { ok: false, error: "未登录，无法创建定时任务", created: 0, skipped: 0, deduped: 0, fixed: 0 };
  const f = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!f) return { ok: false, error: "当前环境不支持 fetch", created: 0, skipped: 0, deduped: 0, fixed: 0 };

  const existing = await listAllTasks(deps, f, token);
  const seen = new Set(existing.map((it) => cronMatchKey(it)));
  let created = 0;
  let skipped = 0;
  let deduped = 0;
  let fixed = 0;
  let failed = 0;
  const reasons: string[] = [];
  const noteFail = (name: string, why: string) => {
    failed++;
    if (reasons.length < 3) reasons.push(`${name}: ${why}`);
  };
  for (const c of list) {
    const runTime = exprToRunTime(c.expr);
    const weekday = exprToWeekday(c.expr) ?? null;
    // 周任务（cron 第 5 段非 *）必须建为 weekly，否则会被当成每日任务天天跑
    const repeatType = weekday === null ? "daily" : "weekly";
    const key = cronMatchKey({ title: c.name, agentId: official, runTime, weekday });
    if (seen.has(key)) {
      skipped++;
      const healed = await healExistingTasks(deps, existing, key, { repeatType, weekday }, f, token);
      fixed += healed.fixed;
      deduped += healed.deduped;
      continue;
    }
    try {
      const res = await f(`${deps.stApiBase}/scheduled-tasks`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          title: c.name,
          description: c.description ?? "",
          repeatType,
          runTime,
          weekday: weekday ?? undefined,
          agentId: official,
          executeKind: c.executeKind,
          flowId: c.flowId,
          flowParams: c.flowParams ? JSON.stringify(c.flowParams) : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: number; message?: unknown; msg?: string };
      if (json.code === 0 || json.code === 200 || res.ok) {
        created++;
        seen.add(key);
      } else {
        // 不再静默吞掉：把后端返回的原因带出来（例如旧版后端不认 agentId/executeKind → 400）
        const msg = Array.isArray(json.message)
          ? json.message.filter((m): m is string => typeof m === "string").join("；")
          : typeof json.message === "string"
            ? json.message
            : json.msg || "";
        noteFail(c.name, `HTTP ${res.status}${msg ? ` ${msg}` : ""}`);
      }
    } catch (err) {
      noteFail(c.name, err instanceof Error ? err.message : String(err));
    }
  }
  if (failed > 0) {
    const more = failed > reasons.length ? `（另有 ${failed - reasons.length} 条同类失败）` : "";
    return {
      ok: false,
      error: `${failed} 条定时任务创建失败（新建 ${created} / 跳过 ${skipped}）：${reasons.join("；")}${more}`,
      created,
      skipped,
      deduped,
      fixed,
    };
  }
  return { ok: true, created, skipped, deduped, fixed };
}

/**
 * 自愈已有任务（只处理 key 命中默认定时任务的行，绝不动用户自建任务）：
 *  - 排期漂移：同一槽位（标题+官署+时间+星期）但 repeatType 不对（历史版本把周任务建成了 daily）→ PATCH 修正；
 *  - 重复行：同一槽位多条 → 保留 id 最小的一条，删除其余；
 * 失败都不阻塞组队，返回修正/清理条数。
 */
async function healExistingTasks(
  deps: TeamIpcDeps,
  existing: ExistingTask[],
  key: string,
  want: { repeatType: "daily" | "weekly"; weekday: number | null },
  f: typeof fetch,
  token: string,
): Promise<{ fixed: number; deduped: number }> {
  const matched = existing
    .filter((x) => x.id !== undefined && cronMatchKey(x) === key)
    .sort((a, b) => Number(a.id) - Number(b.id));
  let fixed = 0;
  let deduped = 0;
  const keep = matched[0];
  if (keep && (keep.repeatType ?? "") !== want.repeatType) {
    try {
      const res = await f(`${deps.stApiBase}/scheduled-tasks/${keep.id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ repeatType: want.repeatType, weekday: want.weekday ?? undefined }),
      });
      if (res.ok) fixed++;
    } catch {
      // 修正失败不影响组队
    }
  }
  for (const extra of matched.slice(1)) {
    try {
      await f(`${deps.stApiBase}/scheduled-tasks/${extra.id}`, { method: "DELETE", headers: authHeaders(token) });
      deduped++;
    } catch {
      // 清理重复失败不影响组队
    }
  }
  return { fixed, deduped };
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
  const items = await listAllTasks(deps, f, token);
  try {
    for (const c of list) {
      const wantKey = cronMatchKey({
        title: c.name,
        agentId: official,
        runTime: exprToRunTime(c.expr),
        weekday: exprToWeekday(c.expr) ?? null,
      });
      for (const it of items.filter((x) => x.id !== undefined && cronMatchKey(x) === wantKey)) {
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
    // 记录「编制」：套餐成功时落盘，供启动引导与任务中心判断该有哪几个官署
    if (result.ok && deps.userDataDir) {
      try {
        writeRoster(deps.userDataDir, presetId, result.officials);
      } catch (err) {
        console.warn("[team-ipc] 写入官署编制失败: " + (err instanceof Error ? err.message : String(err)));
      }
    }
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
    // 当前编制（最近一次一键组队的套餐）与已装官署，供设置页展示「选了什么 / 装了什么」
    currentPresetId: readRoster(deps.userDataDir)?.presetId ?? null,
    installedOfficials: listInstalledOfficials(deps.hermesHome, ALL_OFFICIAL_IDS_LIST),
    presets: Object.values(TEAM_PRESETS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      officials: p.officials,
      recommended: !!p.recommended,
    })),
  }));
  // 当前官署编制：任务中心/办公室按它过滤展示（无落盘记录 ⇒ 全集，兼容老用户）
  ipcMain.handle("team:current-roster", () => {
    const stored = readRoster(deps.userDataDir);
    return {
      ok: true,
      presetId: stored?.presetId ?? null,
      officials: stored ? stored.officials : [...ALL_EDICT_OFFICIALS],
      installed: listInstalledOfficials(deps.hermesHome, ALL_OFFICIAL_IDS_LIST),
      isDefault: !stored,
    };
  });
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
    for (const ch of ["team:list-presets", "team:current-roster", "team:creation-status", "team:create", "team:write-soul", "team:list-crons", "team:sync-soul", "team:soul-status"]) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        // 忽略
      }
    }
  };
}
