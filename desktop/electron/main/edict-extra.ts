/**
 * 三省六部补齐 IPC（edict-extra）：对齐 edict 原版 10 面板中缺失的 8 项
 *  - monitor 省部调度：edict:agents-status / edict:agent-wake
 *  - models 模型配置：edict:agent-config / edict:set-model / edict:model-change-log
 *  - skills 技能配置：edict:skill-content / add-skill / remote-skills-list / add-remote-skill / update-remote-skill / remove-remote-skill
 *  - court 朝堂议政：edict:court-discuss/start|advance|conclude|destroy|fate
 *  - morning 天下要闻：edict:morning-brief / morning-config / save-morning-config / refresh-morning
 *  - sessions 小任务：edict:sessions
 *  - templates 旨库：edict:create-task（模板下旨，复用 edictIssue）
 *
 * 设计：与 edict-bridge 同风格——依赖注入（EdictExtraDeps），纯函数可单测；
 * 数据落盘 userData/edict-data/（morning-brief.json / morning-config.json / model_change_log.json / court-sessions/）。
 */
import { BrowserWindow, ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EdictDeps } from "./edict-orchestrator";
import { OFFICIALS, edictIssue } from "./edict-orchestrator";
import { EDICT_PROFILE_IDS, syncHermesProfileConfigs, writeAgentModel, removeAgentModel } from "./hermes-config";

// P0-3: 官署 ID / 技能名白名单校验（防止路径穿越写出 hermes-home/profiles 目录）
const SAFE_AGENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_SKILL_NAME_RE = /^[\w-]{1,128}$/;

function assertSafeAgentId(agentId: string): boolean {
  return SAFE_AGENT_ID_RE.test(agentId);
}

function assertSafeSkillName(skillName: string): boolean {
  return SAFE_SKILL_NAME_RE.test(skillName);
}
import type {
  EdictAgentConfig,
  EdictAgentStatusInfo,
  EdictAgentsStatusData,
  EdictHermesRuntimeStatus,
  EdictCourtDiscussResult,
  EdictCourtMessage,
  EdictCourtOfficial,
  EdictCourtSession,
  EdictKnownModel,
  EdictModelChangeEntry,
  EdictMorningBrief,
  EdictMorningNewsItem,
  EdictOp,
  EdictRemoteSkillItem,
  EdictRemoteSkillsResult,
  EdictSessionItem,
  EdictSkillContentResult,
  EdictSkillInfo,
  EdictSubConfig,
  EdictTask,
  EdictLibrarySkill,
  EdictSkillLibraryResult,
} from "../shared/edict-types";

// ===== 依赖 =====

export interface EdictExtraDeps extends EdictDeps {
  /** $HERMES_HOME（userData/hermes-home） */
  hermesHome: string;
  /** edict 可写运行时根（userData/edict-data） */
  edictDataRoot: string;
  /** Hermes 运行时根（runtime/hermes） */
  runtimeRoot: string;
  /** 平台 API 基址（ST_API_BASE） */
  stApiBase: string;
  /** 当前登录 token（空 = 未登录，模型列表退化为本地清单） */
  getAuthToken: () => string;
  /** 确保官署 profiles（创建/补 SOUL.md/同步 config）；返回创建明细 */
  ensureProfiles: (ids?: readonly string[]) => Promise<{ ok: boolean; created: string[]; reason?: string }>;
  /** 真实 Hermes 运行时状态（P1）：serviceManager 注入或本地端口探测；缺省按未就绪处理 */
  getHermesRuntimeStatus?: () => Promise<EdictHermesRuntimeStatus>;
  /** 网络抓取（默认全局 fetch；测试可注入） */
  fetch?: typeof fetch;
}

// ===== 常量 =====

const ORG_TO_ID: Record<string, string> = {
  "中书省": "zhongshu", "门下省": "menxia", "尚书省": "shangshu",
  "礼部": "libu", "户部": "hubu", "吏部": "libu_hr", "兵部": "bingbu",
  "刑部": "xingbu", "工部": "gongbu", "钦天监": "qintianjian", "司礼监": "zaochao",
};



/** 官署展示元数据（label/emoji/role 与 OFFICIALS 一致，另含说话风格） */
const COURT_OFFICIALS: EdictCourtOfficial[] = [
  { id: "zhongshu", name: "中书省", emoji: "📜", role: "中书令", personality: "持重缜密，先想清楚再开口", speaking_style: "条理清晰，先结论后论证" },
  { id: "menxia", name: "门下省", emoji: "🔍", role: "侍中", personality: "审慎挑剔，专挑漏洞", speaking_style: "先质疑后建议，用词克制" },
  { id: "shangshu", name: "尚书省", emoji: "📮", role: "尚书令", personality: "务实干练，注重落地", speaking_style: "直接给执行口径，少说空话" },
  { id: "libu", name: "礼部", emoji: "📝", role: "礼部尚书", personality: "温文尔雅，注重规范与表达", speaking_style: "措辞考究，兼顾程序与体面" },
  { id: "hubu", name: "户部", emoji: "💰", role: "户部尚书", personality: "精打细算，数据导向", speaking_style: "喜欢用数字说话，关注成本收益" },
  { id: "libu_hr", name: "吏部", emoji: "👔", role: "吏部尚书", personality: "老成持重，关注组织与人心", speaking_style: "从组织和人力的角度表态" },
  { id: "bingbu", name: "兵部", emoji: "⚔️", role: "兵部尚书", personality: "雷厉风行，敢打敢拼", speaking_style: "直接，聚焦执行与攻坚" },
  { id: "xingbu", name: "刑部", emoji: "⚖️", role: "刑部尚书", personality: "铁面无私，强调合规与风险", speaking_style: "摆事实讲依据，红线意识强" },
  { id: "gongbu", name: "工部", emoji: "🔧", role: "工部尚书", personality: "踏实肯干，关注工程可行性", speaking_style: "关注实现细节与稳定性" },
  { id: "zaochao", name: "钦天监", emoji: "📰", role: "朝报官", personality: "博闻强识，信息面广", speaking_style: "补充外部信息与形势判断" },
  { id: "qintianjian", name: "钦天监", emoji: "📊", role: "钦天监正", personality: "理性分析，数据支撑", speaking_style: "用数据和分析说话" },
];

const COURT_EMOJI: Record<string, string> = {
  taizi: "🤴", zhongshu: "📜", menxia: "🔍", shangshu: "📮", libu: "📝",
  hubu: "💰", bingbu: "⚔️", xingbu: "⚖️", gongbu: "🔧", libu_hr: "👔",
  zaochao: "📰", qintianjian: "📊",
};

/** 命运骰子事件池（照搬 edict 原版 CourtDiscussion 的"天命降临"趣味事件） */
const FATE_EVENTS = [
  "边疆急报传来：邻国使者明日到访，需立即商定应对之策",
  "天降祥瑞：国库新到一批拨款，各部可提需求",
  "突降暴雨：城外粮道中断，需议定应急方案",
  "钦天监夜观星象：近期宜守不宜攻，建议稳妥推进",
  "江南进贡：新增一批上等材料，可用于重点工程",
  "突发疫情：某地报有流民聚集，需安排赈济",
  "边境贸易开禁：新增合作机会，可研讨拓展",
  "皇帝微服私访：听闻民情，责令各部自查效率",
  "秋闱放榜：大批人才可用，吏部建议重新议定用人",
  "外邦来书：提出合作请求，需权衡利弊后回覆",
];

/** 默认新闻分类（照搬 edict 原版 MorningPanel CAT_META） */
const DEFAULT_MORNING_CATS = ["政治", "军事", "经济", "AI大模型"];

/** 默认订阅源（国内可达 RSS/JSON，分类映射；单源失败自动跳过） */
const DEFAULT_FEEDS: { name: string; url: string; category: string }[] = [
  { name: "人民网-时政", url: "http://www.people.com.cn/rss/politics.xml", category: "政治" },
  { name: "新华网-时政", url: "http://www.news.cn/whxw.xml", category: "政治" },
  { name: "澎湃-时事", url: "https://feedx.net/rss/thepaper.xml", category: "政治" },
  { name: "人民网-军事", url: "http://www.people.com.cn/rss/military.xml", category: "军事" },
  { name: "新华网-军事", url: "http://www.news.cn/mil.xml", category: "军事" },
  { name: "新浪-财经", url: "https://rss.sina.com.cn/finance/roll.xml", category: "经济" },
  { name: "东方财富-财经", url: "https://rss.eastmoney.com/rss/dfcf.xml", category: "经济" },
  { name: "36氪", url: "https://36kr.com/feed", category: "AI大模型" },
  { name: "机器之心", url: "https://www.jiqizhixin.com/rss", category: "AI大模型" },
  { name: "量子位", url: "https://www.qbitai.com/feed", category: "AI大模型" },
];

// ===== 工具函数 =====

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

/** 读取 config.yaml 的 model.default（兼容标量与块写法） */
export function readConfigDefaultModel(content: string): string {
  const m = content.match(/^\s+default:\s*(\S+)\s*$/m) || content.match(/^model:\s*(\S+)\s*$/m) || content.match(/^\s+model:\s*(\S+)\s*$/m);
  return m ? m[1] : "";
}

/** 替换 config.yaml 的 model 段（保留其余配置）；返回新全文 */
export function replaceConfigModel(content: string, model: string): string {
  const block = ["model:", "  provider: custom:shentong", "  default: " + model, "  max_tokens: 8192"];
  const idx = content.search(/^model:\s*$/m);
  if (idx < 0) return [...block, content].join("\n");
  const endOfLine = content.indexOf("\n", idx);
  const rest = content.slice(idx, endOfLine < 0 ? undefined : endOfLine).replace(/^model:\s*/, "");
  if (rest && !rest.startsWith("#")) {
    // 单行 model: xxx
    return content.slice(0, idx) + block.join("\n") + content.slice(endOfLine < 0 ? content.length : endOfLine);
  }
  // 块写法：替换到下一个顶层键/空行
  let end = endOfLine < 0 ? content.length : endOfLine + 1;
  const lines = content.split("\n");
  const startLine = content.slice(0, idx).split("\n").length - 1;
  let i = startLine + 1;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || /^\S/.test(l)) break;
    i++;
  }
  const before = lines.slice(0, startLine).join("\n");
  const after = lines.slice(i).join("\n");
  const sep = before && after ? "\n" : "";
  return [before, block.join("\n"), after].filter(Boolean).join("\n");
}

// ===== 省部调度 monitor =====

/** 从看板聚合每位官署的最近活跃时间与在办任务数 */
export async function buildAgentsStatus(deps: EdictExtraDeps): Promise<EdictAgentsStatusData> {
  const tasks = deps.readBoard();
  const lastByAgent: Record<string, string> = {};
  const activeByAgent: Record<string, number> = {};
  const mark = (agentId: string | undefined, agentLabel: string | undefined, at: string | undefined): void => {
    const id = agentId && ORG_TO_ID[agentId] ? ORG_TO_ID[agentId] : agentId;
    if (!id) return;
    if (at && (!lastByAgent[id] || at > lastByAgent[id])) lastByAgent[id] = at;
  };
  for (const t of tasks) {
    const isActive = !["Done", "Cancelled", "Pending", "Taizi", "Next"].includes(t.state);
    if (isActive) {
      const orgId = ORG_TO_ID[t.org || ""];
      if (orgId) activeByAgent[orgId] = (activeByAgent[orgId] || 0) + 1;
      const orgId2 = ORG_TO_ID[t.assigneeOrg || ""];
      if (orgId2) activeByAgent[orgId2] = (activeByAgent[orgId2] || 0) + 1;
    }
    for (const f of t.flow_log || []) mark(f.agent, f.agentLabel, f.at);
    for (const p of t.progress_log || []) mark(p.agent, undefined, p.at);
  }
  // P1：真实 Hermes 运行时状态（serviceManager 注入或端口探测），替换原先 config.yaml 假状态
  let runtime: EdictHermesRuntimeStatus = { alive: false, probe: false, status: "Hermes 运行时未启动" };
  try {
    if (deps.getHermesRuntimeStatus) runtime = await deps.getHermesRuntimeStatus();
  } catch (err) {
    console.warn("[edict-extra] Hermes 运行时探测失败:", (err as Error).message);
  }
  const hermesAlive = !!runtime.alive;
  const agents: EdictAgentStatusInfo[] = OFFICIALS.map((o) => {
    const profileDir = path.join(deps.hermesHome, "profiles", o.id);
    const hasProfile = fs.existsSync(profileDir);
    const active = activeByAgent[o.id] || 0;
    const lastActive = lastByAgent[o.id];
    let status: EdictAgentStatusInfo["status"];
    let statusLabel: string;
    if (o.id === "taizi") {
      status = active > 0 ? "running" : "idle";
      statusLabel = active > 0 ? "执行中" : "待命";
    } else if (!hasProfile) {
      status = "unconfigured";
      statusLabel = "未配置";
    } else if (!hermesAlive) {
      status = "offline";
      statusLabel = "离线（Hermes 未运行）";
    } else if (active > 0) {
      status = "running";
      statusLabel = "执行中";
    } else {
      status = "idle";
      statusLabel = "待命";
    }
    return {
      id: o.id,
      label: o.label,
      emoji: COURT_EMOJI[o.id] || "🏛️",
      role: o.role,
      status,
      statusLabel,
      lastActive,
      model: readProfileModel(deps, o.id),
      tasksActive: active,
    };
  });
  return {
    ok: true,
    gateway: {
      alive: runtime.alive,
      probe: runtime.probe,
      status: runtime.status || (runtime.alive ? "Hermes 运行时正常" : "Hermes 运行时未启动"),
    },
    agents,
    checkedAt: runtime.checkedAt || nowIso(),
  };
}

function readProfileModel(deps: EdictExtraDeps, agentId: string): string {
  try {
    let cfg = path.join(deps.hermesHome, "profiles", agentId, "config.yaml");
    if (!fs.existsSync(cfg)) cfg = path.join(deps.hermesHome, "config.yaml");
    return readConfigDefaultModel(fs.readFileSync(cfg, "utf-8")) || "未配置";
  } catch {
    return "未配置";
  }
}

/** 唤醒（确保）指定官署 profile；taizi 为 OpenClaw 入口，仅提示 */
export async function wakeAgent(deps: EdictExtraDeps, agentId: string): Promise<EdictOp> {
  if (!assertSafeAgentId(agentId)) return { ok: false, error: "官署 ID 非法" };
  if (agentId === "taizi" || agentId === "main") {
    return { ok: true, data: "太子由 OpenClaw 承载，无需唤醒" };
  }
  const r = await deps.ensureProfiles([agentId as (typeof EDICT_PROFILE_IDS)[number]]);
  if (!r.ok) return { ok: false, error: r.reason || "唤醒失败" };
  return { ok: true, data: r.created.includes(agentId) ? "官署已配置就绪" : "官署已在职" };
}

// ===== 模型配置 models =====

/** 从平台 llm-proxy 拉取可用模型；失败回退本地清单 */
export async function fetchKnownModels(deps: EdictExtraDeps): Promise<EdictKnownModel[]> {
  const token = deps.getAuthToken();
  if (!token || !deps.stApiBase) return [];
  const fetcher = deps.fetch ?? globalThis.fetch;
  try {
    // 管理后台已启用的大模型（与对话页模型下拉同一数据源；JWT 鉴权）
    const res = await fetcher(deps.stApiBase.replace(/\/+$/, "") + "/models/chat-options", {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    const raw = Array.isArray(body) ? body : (body as { data?: unknown })?.data;
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((m) => {
        const item = m as Record<string, unknown>;
        const id = String(item.id ?? item.modelId ?? item.model ?? "");
        if (!id) return null;
        return { id, label: String(item.name ?? item.label ?? id), provider: String(item.provider ?? item.owner ?? "平台") };
      })
      .filter((x): x is EdictKnownModel => !!x);
  } catch {
    return [];
  }
}

/** 切换官署模型：持久化用户选择 + 写目标官署 profile config + 变更日志 */
export async function applyModelChange(deps: EdictExtraDeps, agentId: string, model: string): Promise<EdictOp> {
  if (!agentId || !model) return { ok: false, error: "参数缺失" };
  if (!assertSafeAgentId(agentId)) return { ok: false, error: "官署 ID 非法" };
  const profileCfg = path.join(deps.hermesHome, "profiles", agentId, "config.yaml");
  const oldModel = readProfileModel(deps, agentId);
  // 跟随全局默认：删除持久化记录 + 该官署 profile config，读取时回退到全局 config.yaml
  if (model === "__default__") {
    try {
      if (fs.existsSync(profileCfg)) fs.rmSync(profileCfg, { force: true });
      removeAgentModel(deps.hermesHome, agentId);
    } catch (err) {
      return { ok: false, error: "重置配置失败: " + (err instanceof Error ? err.message : String(err)) };
    }
    appendModelChangeLog(deps, { at: nowIso(), agentId, oldModel, newModel: "跟随全局默认" });
    return { ok: true, data: { oldModel, newModel: "__default__", profileIds: [] } };
  }
  const cfgPath = path.join(deps.hermesHome, "config.yaml");
  if (!fs.existsSync(cfgPath)) return { ok: false, error: "Hermes 尚未配置（请先登录并安装 Hermes 运行时）" };
  // 目标官署（agentId 对应官署则只同步该官署；否则同步全部官署，兼容旧行为）
  const isOfficial = EDICT_PROFILE_IDS.includes(agentId as never);
  const profileIds = isOfficial
    ? [agentId as (typeof EDICT_PROFILE_IDS)[number]]
    : EDICT_PROFILE_IDS;
  // 确保官署 profile config 存在（以全局为蓝本，含 provider/key），再单独改该官署 model
  syncHermesProfileConfigs(deps.hermesHome, profileIds);
  // 持久化官署模型选择（独立存储，重启不被全局同步覆盖）
  writeAgentModel(deps.hermesHome, agentId, model);
  try {
    for (const tid of profileIds) {
      const tcfg = path.join(deps.hermesHome, "profiles", tid, "config.yaml");
      if (!fs.existsSync(tcfg)) continue;
      fs.writeFileSync(tcfg, replaceConfigModel(fs.readFileSync(tcfg, "utf-8"), model), "utf-8");
    }
  } catch (err) {
    return { ok: false, error: "写入配置失败: " + (err as Error).message };
  }
  appendModelChangeLog(deps, { at: nowIso(), agentId, oldModel, newModel: model });
  return { ok: true, data: { oldModel, newModel: model, profileIds } };
}

function modelChangeLogFile(deps: EdictExtraDeps): string {
  return path.join(deps.edictDataRoot, "data", "model_change_log.json");
}

function appendModelChangeLog(deps: EdictExtraDeps, entry: EdictModelChangeEntry): void {
  const file = modelChangeLogFile(deps);
  const log = readJson<EdictModelChangeEntry[]>(file, []);
  log.push(entry);
  writeJson(file, log.slice(-200));
}

export function readModelChangeLog(deps: EdictExtraDeps): EdictModelChangeEntry[] {
  return readJson<EdictModelChangeEntry[]>(modelChangeLogFile(deps), []);
}

/** 官署配置聚合（模型 + 技能 + knownModels） */
export async function buildAgentConfig(deps: EdictExtraDeps): Promise<EdictAgentConfig> {
  const agents = OFFICIALS.map((o) => ({
    id: o.id,
    label: o.label,
    emoji: COURT_EMOJI[o.id] || "🏛️",
    role: o.role,
    model: readProfileModel(deps, o.id),
    skills: listProfileSkills(deps, o.id),
  }));
  const knownModels = await fetchKnownModels(deps);
  return { agents, knownModels };
}

// ===== 技能库（技能市场《我的》：OpenClaw 内置 / Hermes 已装 / 云端技能包） =====

/** OpenClaw 内置技能根（运行时下载目录 + 打包内置 resources/openclaw/skills） */
function getOpenClawSkillsRoots(deps: EdictExtraDeps): string[] {
  const candidates = [
    path.join(deps.runtimeRoot, "openclaw", "node_modules", "openclaw", "skills"),
    path.join(process.cwd(), "runtime", "openclaw", "node_modules", "openclaw", "skills"),
    typeof process.resourcesPath === "string" && process.resourcesPath
      ? path.join(process.resourcesPath, "openclaw", "skills")
      : "",
    path.join(process.cwd(), "resources", "openclaw", "skills"),
  ].filter(Boolean);
  return candidates.filter((c) => fs.existsSync(c));
}

/** OpenClaw 内置技能根（兼容单根读取，取第一个存在的） */
function getOpenClawSkillsRoot(deps: EdictExtraDeps): string {
  const roots = getOpenClawSkillsRoots(deps);
  return roots[0] ?? path.join(deps.runtimeRoot, "openclaw", "node_modules", "openclaw", "skills");
}

/** OpenClaw 技能 → 类别（添加技能弹窗分类筛选用） */
const SKILL_CATEGORY: Record<string, string> = {
  coding: "开发",
  "coding-agent": "开发", github: "开发", "gh-issues": "开发",
  "node-inspect-debugger": "开发", "python-debugpy": "开发", "diagram-maker": "开发",
  spike: "开发", oracle: "开发", "skill-creator": "开发", "model-usage": "开发", gemini: "开发",
  notion: "文档知识", obsidian: "文档知识", "bear-notes": "文档知识", "apple-notes": "文档知识",
  "nano-pdf": "文档知识", summarize: "文档知识", blogwatcher: "文档知识", "session-logs": "文档知识",
  himalaya: "沟通协作", gog: "沟通协作", trello: "沟通协作", xurl: "沟通协作", goplaces: "沟通协作",
  tmux: "运维系统", healthcheck: "运维系统", mcporter: "运维系统", weather: "运维系统",
  camsnap: "运维系统", "node-connect": "运维系统", clawhub: "运维系统",
  "meme-maker": "内容创作", "video-frames": "内容创作", songsee: "内容创作",
  "sherpa-onnx-tts": "内容创作", "openai-whisper": "内容创作", "openai-whisper-api": "内容创作",
  sag: "内容创作", gifgrep: "内容创作",
  taskflow: "任务流程", "taskflow-inbox-triage": "任务流程",
  "1password": "生活硬件", blucli: "生活硬件", eightctl: "生活硬件", openhue: "生活硬件",
  sonoscli: "生活硬件", "spotify-player": "生活硬件", ordercli: "生活硬件",
  "things-mac": "生活硬件", peekaboo: "生活硬件",
};

/** OpenClaw 技能 → 依赖提示 */
const SKILL_DEPS: Record<string, string> = {
  "apple-notes": "需 macOS", "apple-reminders": "需 macOS", "bear-notes": "需 macOS",
  "things-mac": "需 macOS", peekaboo: "需 macOS",
  github: "需账号", "gh-issues": "需账号", notion: "需账号", gog: "需账号", himalaya: "需账号",
  trello: "需账号", xurl: "需账号", goplaces: "需账号", "openai-whisper-api": "需账号",
  sag: "需账号", "1password": "需账号", camsnap: "需账号", openhue: "需账号",
  sonoscli: "需账号", "spotify-player": "需账号", blucli: "需账号", eightctl: "需账号", ordercli: "需账号",
  "coding-agent": "需安装 CLI", oracle: "需安装 CLI", gemini: "需安装 CLI",
  summarize: "需联网", blogwatcher: "需联网", weather: "需联网", "meme-maker": "需联网",
};

/** 解析 SKILL.md 的 name/description（frontmatter） */
function parseSkillMeta(skillDir: string): { name: string; description: string } {
  const md = path.join(skillDir, "SKILL.md");
  try {
    const content = fs.readFileSync(md, "utf-8");
    const m = content.match(/^description:\s*(.+)$/m) || content.match(/^#\s+(.+)$/m);
    return {
      name: path.basename(skillDir),
      description: m ? m[1].trim().replace(/"/g, "") : "",
    };
  } catch {
    return { name: path.basename(skillDir), description: "" };
  }
}

/** 枚举技能库（OpenClaw 内置 + Hermes 已装 + 云端技能包） */
export function listSkillLibrary(deps: EdictExtraDeps): EdictSkillLibraryResult {
  const skills: EdictLibrarySkill[] = [];
  // 1) OpenClaw 内置（OpenClaw 运行时自带 skills + 桌面端内置 resources/openclaw/skills）
  try {
    for (const root of getOpenClawSkillsRoots(deps)) {
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        if (!fs.existsSync(path.join(dir, "SKILL.md"))) continue;
        const meta = parseSkillMeta(dir);
        skills.push({
          name: meta.name,
          description: meta.description,
          category: SKILL_CATEGORY[meta.name] || "其他",
          deps: SKILL_DEPS[meta.name] || "离线可用",
          source: "openclaw",
          dir,
        });
      }
    }
  } catch (err) {
    console.warn("[edict] OpenClaw 技能枚举失败: " + (err instanceof Error ? err.message : String(err)));
  }
  // 2) Hermes 已装技能（$HERMES_HOME/skills）
  try {
    const root = path.join(deps.hermesHome, "skills");
    if (fs.existsSync(root)) {
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        if (!fs.existsSync(path.join(dir, "SKILL.md"))) continue;
        const meta = parseSkillMeta(dir);
        skills.push({
          name: meta.name,
          description: meta.description || "Hermes 已安装技能",
          category: "其他",
          deps: "离线可用",
          source: "hermes",
          dir,
        });
      }
    }
  } catch (err) {
    console.warn("[edict] Hermes 技能枚举失败: " + (err instanceof Error ? err.message : String(err)));
  }
  // 2b) 桌面端内置 Hermes 技能（resources/hermes/skills，打包后 resourcesPath/hermes/skills）
  try {
    const bundledRoots = [
      typeof process.resourcesPath === "string" && process.resourcesPath
        ? path.join(process.resourcesPath, "hermes", "skills")
        : "",
      path.join(process.cwd(), "resources", "hermes", "skills"),
    ].filter(Boolean);
    for (const root of bundledRoots) {
      if (!fs.existsSync(root)) continue;
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        if (!fs.existsSync(path.join(dir, "SKILL.md"))) continue;
        const meta = parseSkillMeta(dir);
        skills.push({
          name: meta.name,
          description: meta.description || "Hermes 内置技能",
          category: "其他",
          deps: "离线可用",
          source: "hermes",
          dir,
        });
      }
    }
  } catch (err) {
    console.warn("[edict] 内置 Hermes 技能枚举失败: " + (err instanceof Error ? err.message : String(err)));
  }
  // 3) 云端技能包（market 本地安装记录，type=skill）
  try {
    const { listInstalled } = require("./local-market/local-content-manager") as typeof import("./local-market/local-content-manager");
    const records = listInstalled().filter((r) => r.type === "skill");
    for (const r of records) {
      if (!fs.existsSync(path.join(r.dir, "SKILL.md"))) continue;
      const meta = parseSkillMeta(r.dir);
      skills.push({
        name: r.name || meta.name,
        description: meta.description || r.name || "云端技能包",
        category: "其他",
        deps: "离线可用",
        source: "market",
        dir: r.dir,
      });
    }
  } catch (err) {
    console.warn("[edict] 云端技能包枚举失败: " + (err instanceof Error ? err.message : String(err)));
  }
  // 去重（同名同目录）
  const seen = new Set<string>();
  const dedup = skills.filter((s) => {
    const key = s.name + "|" + s.dir;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: true, skills: dedup };
}

/** 按来源+名称解析技能库目录（SKILL.md 所在目录） */
function resolveLibrarySkillDir(deps: EdictExtraDeps, source: string, skillName: string): string {
  if (source === "openclaw") {
    for (const root of getOpenClawSkillsRoots(deps)) {
      const dir = path.join(root, skillName);
      if (fs.existsSync(path.join(dir, "SKILL.md"))) return dir;
    }
    return "";
  }
  if (source === "hermes") {
    const dir = path.join(deps.hermesHome, "skills", skillName);
    if (fs.existsSync(path.join(dir, "SKILL.md"))) return dir;
    const bundledRoots = [
      typeof process.resourcesPath === "string" && process.resourcesPath
        ? path.join(process.resourcesPath, "hermes", "skills")
        : "",
      path.join(process.cwd(), "resources", "hermes", "skills"),
    ].filter(Boolean);
    for (const root of bundledRoots) {
      const bdir = path.join(root, skillName);
      if (fs.existsSync(path.join(bdir, "SKILL.md"))) return bdir;
    }
    return "";
  }
  if (source === "market") {
    try {
      const { listInstalled } = require("./local-market/local-content-manager") as typeof import("./local-market/local-content-manager");
      const rec = listInstalled().find((r) => r.type === "skill" && (r.name === skillName || path.basename(r.dir) === skillName));
      return rec && fs.existsSync(path.join(rec.dir, "SKILL.md")) ? rec.dir : "";
    } catch {
      return "";
    }
  }
  return "";
}

/** 把技能库技能整目录复制到官署 profile skills/（已存在则拒绝，提示先删除） */
export function copySkillToProfile(deps: EdictExtraDeps, agentId: string, source: string, skillName: string): EdictOp {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const srcDir = resolveLibrarySkillDir(deps, source, skillName);
  if (!srcDir || !fs.existsSync(path.join(srcDir, "SKILL.md"))) {
    return { ok: false, error: "技能库中不存在该技能: " + skillName };
  }
  const dstDir = path.join(deps.hermesHome, "profiles", agentId, "skills", skillName);
  if (fs.existsSync(path.join(dstDir, "SKILL.md"))) {
    return { ok: false, error: "该官署已有技能 " + skillName + "，请先删除再添加" };
  }
  try {
    fs.mkdirSync(dstDir, { recursive: true });
    fs.cpSync(srcDir, dstDir, { recursive: true });
    return { ok: true, data: dstDir };
  } catch (err) {
    return { ok: false, error: "复制技能失败: " + (err instanceof Error ? err.message : String(err)) };
  }
}

/** 删除官署本地技能（整目录，可重新从技能库添加） */
export function removeLocalSkill(deps: EdictExtraDeps, agentId: string, skillName: string): EdictOp {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const dir = path.join(profileSkillsDir(deps, agentId), skillName);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: "删除失败: " + (err instanceof Error ? err.message : String(err)) };
  }
  // 同步清理远程登记（若该技能来自远程源）
  try {
    const registry = readRegistry(deps).filter((it) => !(it.agentId === agentId && it.skillName === skillName));
    writeRegistry(deps, registry);
  } catch {
    // 忽略 registry 清理失败
  }
  return { ok: true };
}

// ===== 技能配置 skills =====

/** profile skills 根目录（Hermes -p <id> 切换 HERMES_HOME 到 profiles/<id>） */
function profileSkillsDir(deps: EdictExtraDeps, agentId: string): string {
  return path.join(deps.hermesHome, "profiles", agentId, "skills");
}

/** 列出官署本地技能（profiles/<id>/skills 下的 SKILL.md） */
export function listProfileSkills(deps: EdictExtraDeps, agentId: string): EdictSkillInfo[] {
  if (!assertSafeAgentId(agentId)) return [];
  const root = profileSkillsDir(deps, agentId);
  if (!fs.existsSync(root)) return [];
  const out: EdictSkillInfo[] = [];
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const skillFile = path.join(root, name.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    let desc = "";
    try {
      const content = fs.readFileSync(skillFile, "utf-8");
      const m = content.match(/^description:\s*(.+)$/m) || content.match(/^#\s+(.+)$/m);
      desc = m ? m[1].trim() : "";
    } catch {
      // 忽略读取失败
    }
    out.push({ name: name.name, description: desc, path: skillFile });
  }
  return out;
}

/** 读取技能文件内容 */
export function readSkillContent(deps: EdictExtraDeps, agentId: string, skillName: string): EdictSkillContentResult {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const skillFile = path.join(profileSkillsDir(deps, agentId), skillName, "SKILL.md");
  if (!fs.existsSync(skillFile)) return { ok: false, error: "技能不存在: " + skillName };
  try {
    return { ok: true, name: skillName, agent: agentId, content: fs.readFileSync(skillFile, "utf-8"), path: skillFile };
  } catch (err) {
    return { ok: false, error: "读取失败: " + (err as Error).message };
  }
}

/** 本地新增技能（创建 SKILL.md 模板） */
export function addLocalSkill(deps: EdictExtraDeps, agentId: string, skillName: string, description: string, trigger: string): EdictOp {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const dir = path.join(profileSkillsDir(deps, agentId), skillName);
  const skillFile = path.join(dir, "SKILL.md");
  if (fs.existsSync(skillFile)) return { ok: false, error: "技能已存在: " + skillName };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const md = [
      "---",
      "name: " + skillName,
      "description: " + (description || "自定义技能"),
      "---",
      "",
      "# " + skillName,
      "",
      "## 触发",
      trigger || "（未设置触发条件）",
      "",
    ].join("\n");
    fs.writeFileSync(skillFile, md, "utf-8");
    return { ok: true, data: skillFile };
  } catch (err) {
    return { ok: false, error: "写入失败: " + (err as Error).message };
  }
}

/** 远程技能 registry（记录来源，供 list/update/remove） */
function remoteRegistryFile(deps: EdictExtraDeps): string {
  return path.join(deps.edictDataRoot, "data", "remote_skills_registry.json");
}

function readRegistry(deps: EdictExtraDeps): EdictRemoteSkillItem[] {
  return readJson<EdictRemoteSkillItem[]>(remoteRegistryFile(deps), []);
}

function writeRegistry(deps: EdictExtraDeps, items: EdictRemoteSkillItem[]): void {
  writeJson(remoteRegistryFile(deps), items);
}

function skillLocalPath(deps: EdictExtraDeps, agentId: string, skillName: string): string {
  return path.join(profileSkillsDir(deps, agentId), skillName, "SKILL.md");
}

/** 远程技能列表（registry + 文件存在性校验） */
export function listRemoteSkills(deps: EdictExtraDeps): EdictRemoteSkillsResult {
  const items = readRegistry(deps).map((it) => ({
    ...it,
    status: (fs.existsSync(skillLocalPath(deps, it.agentId, it.skillName)) ? "valid" : "not-found") as EdictRemoteSkillItem["status"],
  }));
  return { ok: true, remoteSkills: items, count: items.length, listedAt: nowIso() };
}

/** 添加/更新远程技能：下载 SKILL.md 到 profile skills 目录 + 登记 registry */
export async function addRemoteSkill(deps: EdictExtraDeps, agentId: string, skillName: string, sourceUrl: string, description = ""): Promise<EdictOp> {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  if (!/^https?:\/\//.test(sourceUrl)) {
    return { ok: false, error: "技能名或 URL 非法" };
  }
  const fetcher = deps.fetch ?? globalThis.fetch;
  let content: string;
  try {
    const res = await fetcher(sourceUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { ok: false, error: "下载失败: HTTP " + res.status };
    content = await res.text();
  } catch (err) {
    return { ok: false, error: "下载失败: " + (err as Error).message };
  }
  if (content.trim().length < 10) return { ok: false, error: "下载内容为空" };
  const file = skillLocalPath(deps, agentId, skillName);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf-8");
  } catch (err) {
    return { ok: false, error: "写入失败: " + (err as Error).message };
  }
  const registry = readRegistry(deps);
  const existing = registry.findIndex((it) => it.agentId === agentId && it.skillName === skillName);
  const item: EdictRemoteSkillItem = {
    skillName,
    agentId,
    sourceUrl,
    description,
    localPath: file,
    addedAt: existing >= 0 ? registry[existing].addedAt : nowIso(),
    lastUpdated: nowIso(),
    status: "valid",
  };
  if (existing >= 0) registry[existing] = item;
  else registry.push(item);
  writeRegistry(deps, registry);
  return { ok: true, data: { skillName, agentId, source: sourceUrl, localPath: file } };
}

/** 更新远程技能（重新下载） */
export async function updateRemoteSkill(deps: EdictExtraDeps, agentId: string, skillName: string): Promise<EdictOp> {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const registry = readRegistry(deps);
  const item = registry.find((it) => it.agentId === agentId && it.skillName === skillName);
  if (!item) return { ok: false, error: "远程技能不存在: " + skillName };
  return addRemoteSkill(deps, agentId, skillName, item.sourceUrl, item.description);
}

/** 移除远程技能（删文件 + registry） */
export function removeRemoteSkill(deps: EdictExtraDeps, agentId: string, skillName: string): EdictOp {
  if (!assertSafeAgentId(agentId) || !assertSafeSkillName(skillName)) return { ok: false, error: "官署 ID 或技能名非法" };
  const file = skillLocalPath(deps, agentId, skillName);
  try {
    if (fs.existsSync(file)) fs.rmSync(path.dirname(file), { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: "删除失败: " + (err as Error).message };
  }
  const registry = readRegistry(deps).filter((it) => !(it.agentId === agentId && it.skillName === skillName));
  writeRegistry(deps, registry);
  return { ok: true };
}

// ===== 小任务 sessions =====

/** 小任务/会话列表：非 JJC 任务优先；无则聚合官署最近活动 */
export function buildSessions(deps: EdictExtraDeps): EdictSessionItem[] {
  const tasks = deps.readBoard();
  const nonEdict = tasks.filter((t) => !/^JJC-/i.test(t.id));
  if (nonEdict.length > 0) {
    return nonEdict.map((t) => toSessionItem(t));
  }
  // 聚合：每个任务的每个官署参与记录 → 会话卡片
  const items: EdictSessionItem[] = [];
  for (const t of tasks) {
    if (["Done", "Cancelled"].includes(t.state)) continue;
    const seen = new Set<string>();
    const pushAgent = (agentId: string, label: string | undefined, remark: string | undefined, at: string | undefined): void => {
      if (seen.has(agentId)) return;
      seen.add(agentId);
      const orgId = ORG_TO_ID[agentId] ? agentId : agentId;
      items.push({
        id: t.id + "-" + orgId,
        title: t.title || t.id,
        agent: orgId,
        agentLabel: label || OFFICIALS.find((o) => o.id === orgId)?.label || orgId,
        org: t.org,
        state: t.state,
        channel: "官署活动",
        lastMessage: remark || "",
        updatedAt: at || t.updatedAt,
        isEdict: true,
      });
    };
    for (const f of t.flow_log || []) pushAgent(f.agent || ORG_TO_ID[f.from] || ORG_TO_ID[f.to] || "", f.agentLabel, f.remark, f.at);
    for (const p of t.progress_log || []) pushAgent(p.agent, undefined, p.text, p.at);
  }
  items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return items.slice(0, 60);
}

function toSessionItem(t: EdictTask): EdictSessionItem {
  const lastFlow = (t.flow_log || [])[(t.flow_log || []).length - 1];
  return {
    id: t.id,
    title: t.title || t.id,
    agent: ORG_TO_ID[t.org || ""] || t.org || "unknown",
    agentLabel: t.org || "未知官署",
    org: t.org,
    state: t.state,
    channel: "会话",
    lastMessage: lastFlow?.remark || t.now || "",
    updatedAt: lastFlow?.at || t.updatedAt,
    isEdict: false,
  };
}

// ===== 朝堂议政 court =====

function courtSessionsDir(deps: EdictExtraDeps): string {
  return path.join(deps.edictDataRoot, "court-sessions");
}

function courtSessionPath(deps: EdictExtraDeps, sessionId: string): string {
  return path.join(courtSessionsDir(deps), sessionId + ".json");
}

function readCourtSession(deps: EdictExtraDeps, sessionId: string): EdictCourtSession | null {
  if (!/^court-[\w\-]+$/.test(sessionId)) return null;
  const file = courtSessionPath(deps, sessionId);
  if (!fs.existsSync(file)) return null;
  return readJson<EdictCourtSession>(file, null as unknown as EdictCourtSession);
}

function writeCourtSession(deps: EdictExtraDeps, session: EdictCourtSession): void {
  writeJson(courtSessionPath(deps, session.session_id), { ...session, updated_at: nowIso() });
}

/** 从官署 id 列表构建议政官员（含人设/说话风格） */
export function resolveCourtOfficials(ids: string[]): EdictCourtOfficial[] {
  const out: EdictCourtOfficial[] = [];
  for (const id of ids) {
    const meta = COURT_OFFICIALS.find((o) => o.id === id);
    if (meta) out.push(meta);
    else {
      const off = OFFICIALS.find((o) => o.id === id);
      if (off) out.push({ id, name: off.label, emoji: COURT_EMOJI[id] || "🏛️", role: off.role, personality: "稳重务实", speaking_style: "简明扼要" });
    }
  }
  return out;
}

/** 开始议政：创建会话（含开朝消息），不调 LLM */
export function courtStart(deps: EdictExtraDeps, topic: string, officialIds: string[], taskId?: string): EdictCourtDiscussResult {
  if (!topic.trim()) return { ok: false, error: "议题不能为空" };
  if (!officialIds || officialIds.length < 2) return { ok: false, error: "至少选择 2 位官员上殿" };
  const sessionId = "court-" + Date.now();
  const officials = resolveCourtOfficials(officialIds.slice(0, 8));
  const session: EdictCourtSession = {
    session_id: sessionId,
    topic: topic.trim().slice(0, 200),
    phase: "session",
    round: 0,
    officials,
    messages: [
      { type: "system", content: "🏛 朝堂议政开始 — " + topic.trim().slice(0, 120) + "（" + officials.map((o) => o.name).join("、") + " 上殿）", timestamp: Date.now() / 1000 },
    ],
    taskId,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  writeCourtSession(deps, session);
  return {
    ok: true,
    session_id: sessionId,
    topic: session.topic,
    round: 0,
    new_messages: [],
    total_messages: 1,
    officials: session.officials,
    messages: session.messages,
    phase: session.phase,
  };
}

function lastMessagesText(session: EdictCourtSession, limit = 8): string {
  const recent = session.messages.slice(-limit);
  return recent
    .map((m) => {
      if (m.type === "emperor") return "👑 皇帝：" + m.content;
      if (m.type === "decree") return "⚡ 天命：" + m.content;
      if (m.type === "system") return "【系统】" + m.content;
      return (m.official_name || m.official_id || "官员") + "：" + m.content;
    })
    .join("\n");
}

/** 推进一轮：选中官员依次发言（Hermes 逐人调用），支持皇帝发言/天命注入 */
export async function courtAdvance(deps: EdictExtraDeps, sessionId: string, userMessage?: string, decree?: string): Promise<EdictCourtDiscussResult> {
  const session = readCourtSession(deps, sessionId);
  if (!session) return { ok: false, error: "议政会话不存在或已销毁" };
  if (session.phase === "concluded") return { ok: false, error: "议政已结束" };
  const newMessages: EdictCourtMessage[] = [];
  if (userMessage?.trim()) {
    newMessages.push({ type: "emperor", content: userMessage.trim().slice(0, 300), timestamp: Date.now() / 1000 });
  }
  if (decree?.trim()) {
    newMessages.push({ type: "decree", content: decree.trim().slice(0, 300), timestamp: Date.now() / 1000 });
  }
  const history = lastMessagesText(session);
  for (const o of session.officials) {
    const prompt = [
      "你在参加一场朝堂议政（三省六部圆桌），身份是「" + o.name + "·" + o.role + "」。",
      "人设：" + o.personality + "；说话风格：" + o.speaking_style + "。",
      "",
      "议题：" + session.topic,
      "",
      "目前讨论记录：",
      history || "（暂无发言）",
      "",
      "现在轮到你发言。请以「" + o.name + "」的身份，围绕议题发表你的真实见解（80~180字）：",
      "可以支持/反对/补充前面官员的观点，但要有你自己的判断和理由。",
      "只输出发言正文，不要输出任何前缀、人名或引号。",
    ].join("\n");
    try {
      const text = await deps.runHermes(o.id, prompt);
      const cleaned = text.replace(/^(中书省|门下省|尚书省|[礼户兵刑工吏]部|钦天监)[：: ]+/g, "").trim().slice(0, 500);
      newMessages.push({
        type: "official",
        official_id: o.id,
        official_name: o.name,
        content: cleaned || "（无话可说）",
        emotion: pickEmotion(cleaned),
        timestamp: Date.now() / 1000,
      });
    } catch (err) {
      newMessages.push({
        type: "official",
        official_id: o.id,
        official_name: o.name,
        content: "（" + (err as Error).message.slice(0, 80) + "）",
        timestamp: Date.now() / 1000,
      });
    }
  }
  session.round += 1;
  session.messages.push(...newMessages);
  writeCourtSession(deps, session);
  return {
    ok: true,
    session_id: sessionId,
    topic: session.topic,
    round: session.round,
    new_messages: newMessages.filter((m) => m.type === "official").map((m) => ({
      official_id: m.official_id || "",
      name: m.official_name || "",
      content: m.content,
      emotion: m.emotion,
      action: m.action,
    })),
    scene_note: newMessages.length > 0 ? "本轮 " + newMessages.filter((m) => m.type === "official").length + " 位官员已奏对" : undefined,
    total_messages: session.messages.length,
  };
}

function pickEmotion(text: string): string {
  if (/担忧|担心|恐怕|隐患|风险/.test(text)) return "worried";
  if (/支持|赞同|附议|同意/.test(text)) return "confident";
  if (/反对|不可|不妥|驳回|质疑/.test(text)) return "angry";
  if (/建议|是否|要不要|可以再/.test(text)) return "thinking";
  if (/哈哈|妙|有趣/.test(text)) return "amused";
  if (/太好了|值得|期待/.test(text)) return "happy";
  return "neutral";
}

/** 散朝：由中书省总结 */
export async function courtConclude(deps: EdictExtraDeps, sessionId: string): Promise<EdictOp & { summary?: string }> {
  const session = readCourtSession(deps, sessionId);
  if (!session) return { ok: false, error: "议政会话不存在" };
  const history = lastMessagesText(session, 20);
  const prompt = [
    "你是中书令，主持一场朝堂议政。议题：" + session.topic,
    "",
    "讨论记录：",
    history,
    "",
    "请以中书省名义拟定一份 3~6 条的「议政纪要」（含共识与分歧），供陛下御览。",
    "格式：",
    "1. 结论摘要",
    "2. 关键共识",
    "3. 主要分歧",
    "4. 建议旨意（可执行的下一步）",
  ].join("\n");
  try {
    const summary = (await deps.runHermes("zhongshu", prompt)).trim().slice(0, 1200);
    session.phase = "concluded";
    session.messages.push({ type: "system", content: "📋 朝堂议政结束 — 中书省已拟定议政纪要", timestamp: Date.now() / 1000 });
    writeCourtSession(deps, session);
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 销毁议政会话 */
export function courtDestroy(deps: EdictExtraDeps, sessionId: string): EdictOp {
  if (!/^court-[\w\-]+$/.test(sessionId)) return { ok: false, error: "会话 ID 非法" };
  const file = courtSessionPath(deps, sessionId);
  try {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "删除失败: " + (err as Error).message };
  }
}

/** 命运骰子 */
export function courtFate(): { ok: boolean; event: string } {
  return { ok: true, event: FATE_EVENTS[Math.floor(Math.random() * FATE_EVENTS.length)] };
}

// ===== 天下要闻 morning =====

function morningBriefFile(deps: EdictExtraDeps): string {
  return path.join(deps.edictDataRoot, "data", "morning-brief.json");
}

function morningConfigFile(deps: EdictExtraDeps): string {
  return path.join(deps.edictDataRoot, "data", "morning-config.json");
}

function defaultSubConfig(): EdictSubConfig {
  return {
    categories: DEFAULT_MORNING_CATS.map((name) => ({ name, enabled: true })),
    keywords: [],
    custom_feeds: [],
    feishu_webhook: "",
  };
}

export function readMorningConfig(deps: EdictExtraDeps): EdictSubConfig {
  const cfg = readJson<Partial<EdictSubConfig>>(morningConfigFile(deps), {});
  return {
    categories: Array.isArray(cfg.categories) ? cfg.categories : defaultSubConfig().categories,
    keywords: Array.isArray(cfg.keywords) ? cfg.keywords : [],
    custom_feeds: Array.isArray(cfg.custom_feeds) ? cfg.custom_feeds : [],
    feishu_webhook: typeof cfg.feishu_webhook === "string" ? cfg.feishu_webhook : "",
  };
}

export function saveMorningConfig(deps: EdictExtraDeps, config: EdictSubConfig): EdictOp {
  if (!config || !Array.isArray(config.categories)) return { ok: false, error: "配置格式错误" };
  writeJson(morningConfigFile(deps), {
    categories: config.categories,
    keywords: Array.isArray(config.keywords) ? config.keywords : [],
    custom_feeds: Array.isArray(config.custom_feeds) ? config.custom_feeds : [],
    feishu_webhook: typeof config.feishu_webhook === "string" ? config.feishu_webhook : "",
  });
  return { ok: true };
}

export function readMorningBrief(deps: EdictExtraDeps): EdictMorningBrief {
  return readJson<EdictMorningBrief>(morningBriefFile(deps), { categories: {} });
}

/** 轻量 RSS 解析（只取 item 的 title/link/description/pubDate） */
export function parseRss(xml: string): EdictMorningNewsItem[] {
  const items: EdictMorningNewsItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const grab = (tag: string): string => {
      const tm = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
      return tm ? tm[1].replace(/<!\[CDATA\[|\]\]>|\s+/g, " ").trim() : "";
    };
    const title = grab("title");
    const link = grab("link");
    if (!title || !link) continue;
    const desc = grab("description").replace(/<[^>]+>/g, "").slice(0, 220);
    items.push({ title: title.slice(0, 160), desc, link, source: "", pub_date: grab("pubDate") || "" });
  }
  return items;
}

/** 从 URL 抓取 RSS 并解析；失败返回空 */
async function fetchFeed(deps: EdictExtraDeps, url: string): Promise<EdictMorningNewsItem[]> {
  const fetcher = deps.fetch ?? globalThis.fetch;
  try {
    const res = await fetcher(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ShenTongAI/1.0", Accept: "application/rss+xml,application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || !text.includes("<item")) return [];
    return parseRss(text);
  } catch {
    return [];
  }
}

/** 采集全部启用分类的新闻（默认源 + 自定义源），关键词命中置顶 */
export async function collectMorningBrief(deps: EdictExtraDeps): Promise<EdictMorningBrief> {
  const config = readMorningConfig(deps);
  const enabled = new Set(config.categories.filter((c) => c.enabled).map((c) => c.name));
  const feeds = [...DEFAULT_FEEDS, ...config.custom_feeds.map((f) => ({ name: f.name, url: f.url, category: f.category }))];
  const keywords = (config.keywords || []).map((k) => k.toLowerCase());
  const results: Record<string, EdictMorningNewsItem[]> = {};
  for (const cat of DEFAULT_MORNING_CATS) results[cat] = [];
  // 自定义分类
  for (const c of config.categories) if (!results[c.name]) results[c.name] = [];

  const jobs = feeds.filter((f) => enabled.has(f.category)).map(async (f) => {
    const items = await fetchFeed(deps, f.url);
    return { category: f.category, source: f.name, items };
  });
  const settled = await Promise.all(jobs);
  const seen = new Set<string>();
  for (const { category, source, items } of settled) {
    for (const it of items) {
      const key = it.link;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!results[category]) results[category] = [];
      results[category].push({ ...it, source });
    }
  }
  // 关键词命中置顶；每类截断 20 条
  for (const cat of Object.keys(results)) {
    const list = results[cat];
    const kwHit = list.filter((it) => keywords.some((k) => (it.title + it.desc).toLowerCase().includes(k)));
    const rest = list.filter((it) => !kwHit.includes(it));
    results[cat] = [...kwHit, ...rest].slice(0, 20);
  }
  const brief: EdictMorningBrief = {
    date: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    generated_at: new Date().toLocaleString("zh-CN", { hour12: false }),
    categories: results,
  };
  writeJson(morningBriefFile(deps), brief);
  return brief;
}

// ===== IPC 注册 =====

export interface EdictExtraIpcOptions {
  /** 广播函数（默认发到所有窗口；court/sessions 变化推送） */
  broadcast?: (channel: string, payload: unknown) => void;
}

/** 注册 edict-extra:* IPC；返回 dispose */
export function registerEdictExtraIpc(deps: EdictExtraDeps, opts: EdictExtraIpcOptions = {}): () => void {
  const broadcast =
    opts.broadcast ??
    ((channel: string, payload: unknown) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      }
    });

  // 省部调度
  ipcMain.handle("edict:agents-status", (): Promise<EdictAgentsStatusData> => buildAgentsStatus(deps));
  ipcMain.handle("edict:agent-wake", (_e, agentId: string): Promise<EdictOp> => wakeAgent(deps, agentId));

  // 模型配置
  ipcMain.handle("edict:agent-config", async (): Promise<EdictAgentConfig> => buildAgentConfig(deps));
  ipcMain.handle("edict:set-model", (_e, agentId: string, model: string): Promise<EdictOp> => applyModelChange(deps, agentId, model));
  ipcMain.handle("edict:model-change-log", (): EdictModelChangeEntry[] => readModelChangeLog(deps));

  // 技能配置
  ipcMain.handle("edict:skill-content", (_e, agentId: string, skillName: string): EdictSkillContentResult => readSkillContent(deps, agentId, skillName));
  ipcMain.handle("edict:add-skill", (_e, agentId: string, skillName: string, description: string, trigger: string): EdictOp =>
    addLocalSkill(deps, agentId, skillName, description, trigger)
  );
  ipcMain.handle("edict:remote-skills-list", (): EdictRemoteSkillsResult => listRemoteSkills(deps));
  ipcMain.handle("edict:add-remote-skill", (_e, agentId: string, skillName: string, sourceUrl: string, description?: string): Promise<EdictOp> =>
    addRemoteSkill(deps, agentId, skillName, sourceUrl, description || "")
  );
  ipcMain.handle("edict:update-remote-skill", (_e, agentId: string, skillName: string): Promise<EdictOp> => updateRemoteSkill(deps, agentId, skillName));
  ipcMain.handle("edict:remove-remote-skill", (_e, agentId: string, skillName: string): EdictOp => removeRemoteSkill(deps, agentId, skillName));
  // 技能库（技能市场《我的》）：枚举 / 复制到官署 / 删除官署技能
  ipcMain.handle("edict:skill-library", (): EdictSkillLibraryResult => listSkillLibrary(deps));
  ipcMain.handle("edict:copy-skill", (_e, agentId: string, source: string, skillName: string): EdictOp => copySkillToProfile(deps, agentId, source, skillName));
  ipcMain.handle("edict:remove-skill", (_e, agentId: string, skillName: string): EdictOp => removeLocalSkill(deps, agentId, skillName));

  // 朝堂议政
  ipcMain.handle("edict:court-discuss/start", (_e, topic: string, officials: string[], taskId?: string): EdictCourtDiscussResult =>
    courtStart(deps, topic, officials, taskId)
  );
  ipcMain.handle("edict:court-discuss/advance", (_e, sessionId: string, userMessage?: string, decree?: string): Promise<EdictCourtDiscussResult> =>
    courtAdvance(deps, sessionId, userMessage, decree)
  );
  ipcMain.handle("edict:court-discuss/conclude", (_e, sessionId: string): Promise<EdictOp & { summary?: string }> => courtConclude(deps, sessionId));
  ipcMain.handle("edict:court-discuss/destroy", (_e, sessionId: string): EdictOp => courtDestroy(deps, sessionId));
  ipcMain.handle("edict:court-discuss/fate", (): { ok: boolean; event: string } => courtFate());

  // 天下要闻
  ipcMain.handle("edict:morning-brief", (): EdictMorningBrief => readMorningBrief(deps));
  ipcMain.handle("edict:morning-config", (): EdictSubConfig => readMorningConfig(deps));
  ipcMain.handle("edict:save-morning-config", (_e, config: EdictSubConfig): EdictOp => saveMorningConfig(deps, config));
  ipcMain.handle("edict:refresh-morning", async (): Promise<EdictOp> => {
    try {
      const brief = await collectMorningBrief(deps);
      broadcast("edict:morning-updated", brief);
      return { ok: true, data: { total: Object.values(brief.categories).reduce((n, l) => n + l.length, 0) } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // 小任务/会话
  ipcMain.handle("edict:sessions", (): EdictSessionItem[] => buildSessions(deps));

  // 旨库：模板下旨（复用 edictIssue）
  ipcMain.handle("edict:create-task", (_e, input: { title: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp<{ taskId: string }>> =>
    edictIssue(deps, input)
  );

  return () => {
    for (const ch of [
      "edict:agents-status", "edict:agent-wake", "edict:agent-config", "edict:set-model", "edict:model-change-log",
      "edict:skill-content", "edict:add-skill", "edict:remote-skills-list", "edict:add-remote-skill",
      "edict:update-remote-skill", "edict:remove-remote-skill", "edict:skill-library", "edict:copy-skill", "edict:remove-skill",
      "edict:court-discuss/start", "edict:court-discuss/advance", "edict:court-discuss/conclude",
      "edict:court-discuss/destroy", "edict:court-discuss/fate",
      "edict:morning-brief", "edict:morning-config", "edict:save-morning-config", "edict:refresh-morning",
      "edict:sessions", "edict:create-task",
    ]) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        // 忽略重复移除
      }
    }
  };
}
