/**
 * 三省六部主进程桥（edict-bridge）
 * 职责：
 *  1. edict 运行时引导：resources/edict（只读蓝本）→ userData/edict-data（可写运行时），
 *     镜像原仓库根布局（scripts/ + data/ + edict/backend/app/models/task.py + agents/），
 *     保证 kanban_update.py 的 EDICT_HOME 语义与原版一致（脚本/数据/状态机同一根）。
 *  2. 依赖注入：spawnKanban（Hermes Python 跑 kanban_update.py）、runHermes（Hermes CLI -p profile）、
 *     readBoard/writeBoard（tasks_source.json 原子读写），复用 hermes-orchestrator spawnCli 模式。
 *  3. IPC 注册：edict:issue/board/task/transition/veto/approve/complete/block/progress/run/officials/stats/models
 *  4. 看板轮询：3s 检测 tasks_source.json 变化 → 广播 edict:board-updated / edict:task-updated
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getRuntimeRoot } from "./runtime-config";
import { EDICT_PROFILE_IDS, syncHermesProfileConfigs } from "./hermes-config";
import {
  edictApprove,
  edictBlock,
  edictBoard,
  edictComplete,
  edictIssue,
  edictOfficials,
  edictProgress,
  edictRunPipeline,
  edictStats,
  edictTransition,
  edictVeto,
  type EdictDeps,
} from "./edict-orchestrator";
import type { EdictBoard, EdictOp, EdictTask } from "../shared/edict-types";
import { OFFICIALS } from "./edict-orchestrator";
import { ST_API_BASE } from "./service-manager";
import type { EdictExtraDeps } from "./edict-extra";

// ===== 路径解析 =====

/** edict 只读蓝本根（打包后 resources/edict；开发 desktop/resources/edict） */
export function getEdictResourcesRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "edict")
    : path.join(process.cwd(), "resources", "edict");
}

/** edict 可写运行时根（打包后 userData/edict-data；开发 desktop/runtime/edict-data） */
export function getEdictDataRoot(): string {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "edict-data")
    : path.join(process.cwd(), "runtime", "edict-data");
}

/** Hermes 运行时根（优先 runtime 下载目录，开发兜底 desktop/runtime/hermes） */
function resolveHermesRoot(): string {
  const candidates = [
    path.join(getRuntimeRoot(), "hermes"),
    path.join(process.cwd(), "runtime", "hermes"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "python", process.platform === "win32" ? "python.exe" : "python"))) return c;
  }
  return candidates[0];
}

/** Hermes Python（kanban 脚本解释器）
 * 兼容两种运行时布局：
 * - 0.19.0 旧布局：<root>/python/python.exe
 * - 0.20.5 新布局：<root>/node_modules/hermes-agent/runtime/python/cpython-<version>/python.exe 或 venv/Scripts/python.exe
 */
export function resolveHermesPython(): string {
  const root = resolveHermesRoot();
  const exe = process.platform === "win32" ? "python.exe" : "python";
  const candidates = [
    path.join(root, "python", exe),
    path.join(root, "node_modules", "hermes-agent", "runtime", "python"),
    path.join(root, "node_modules", "hermes-agent", "runtime", "hermes-agent", "venv", "Scripts", exe),
    path.join(root, "node_modules", "hermes-agent", "runtime", "hermes-agent", "venv", "bin", exe),
  ];
  // 0.20.5 内嵌 cpython 目录：runtime/python/cpython-*/python.exe
  const pyRoot = candidates[1];
  try {
    if (fs.existsSync(pyRoot)) {
      const dirs = fs.readdirSync(pyRoot).filter((d) => d.startsWith("cpython-"));
      if (dirs.length) candidates.splice(1, 1, path.join(pyRoot, dirs[0], exe));
    }
  } catch {
    // 忽略读取失败
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return candidates[0];
}

/** Hermes CLI 环境（node + hermes.js + HERMES_HOME） */
function buildHermesCliEnv(): NodeJS.ProcessEnv {
  const root = resolveHermesRoot();
  const ext = process.platform === "win32" ? ".exe" : "";
  return {
    ...process.env,
    HERMES_NODE: path.join(root, "node", "node" + ext),
    HERMES_ENTRY: path.join(root, "node_modules", "hermes-agent", "bin", "hermes.js"),
    HERMES_HOME: path.join(app.getPath("userData"), "hermes-home"),
  };
}

/** 官署 profile 描述（profile create --description） */
const EDICT_PROFILE_DESC: Record<string, string> = {
  zhongshu: "中书省·规划决策：起草执行方案、提交门下审议、转尚书执行",
  menxia: "门下省·审议把关：四维审议、封驳/准奏、最多3轮",
  shangshu: "尚书省·执行调度：按领域派发六部、汇总结果",
  libu: "礼部·内容与礼仪：文档、规范、UI、对外沟通",
  hubu: "户部·财务与数据：数据分析、统计、资源管理",
  libu_hr: "吏部·人事与组织：考核评估、团队建设、能力培训",
  bingbu: "兵部·研发攻坚：工程实现、架构设计、功能开发",
  xingbu: "刑部·质检与审计：质量保障、测试验收、合规审计",
  gongbu: "工部·工程与运维：基础设施、部署运维、性能监控",
  zaochao: "司礼监·上朝与要闻：上朝仪式、每日要闻简报",
  qintianjian: "钦天监·分析与预测：数据分析、性能度量、趋势预测",
};

/** 官署 SOUL.md 蓝本目录（打包后 resources/edict/profiles；开发 desktop/resources/edict/profiles） */
function getEdictProfilesDir(): string {
  return path.join(getEdictResourcesRoot(), "profiles");
}

/**
 * 引导 11 个官署 Hermes profiles（幂等）：
 * 1. 缺失的 profile 用 hermes profile create --no-skills 创建；
 * 2. 注入官署 SOUL.md（resources/edict/profiles/<id>.md）；
 * 3. 同步全局 config.yaml 到每个 profile（profile 是独立 HERMES_HOME）。
 * 返回创建/更新明细；失败不抛错（日志记录），运行时 runHermes 仍会按需兜底同步 config。
 */
export async function ensureEdictHermesProfiles(ids?: readonly string[]): Promise<{ ok: boolean; created: string[]; reason?: string }> {
  const env = buildHermesCliEnv();
  const nodeBin = env.HERMES_NODE as string;
  const entry = env.HERMES_ENTRY as string;
  const hermesHome = env.HERMES_HOME as string;
  const created: string[] = [];
  if (!nodeBin || !entry || !fs.existsSync(nodeBin) || !fs.existsSync(entry)) {
    return { ok: false, created, reason: "Hermes 运行时未安装（官署执行需要 Hermes）" };
  }
  const soulDir = getEdictProfilesDir();
  const targets: readonly string[] = ids && ids.length ? ids : EDICT_PROFILE_IDS;
  for (const id of targets) {
    const profileDir = path.join(hermesHome, "profiles", id);
    try {
      if (!fs.existsSync(profileDir)) {
        await new Promise<void>((resolve) => {
          const child = spawn(nodeBin, [entry, "profile", "create", id, "--description", EDICT_PROFILE_DESC[id] || id, "--no-skills"], {
            env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
          });
          child.on("close", () => resolve());
          child.on("error", () => resolve());
        });
        created.push(id);
      }
      // 注入官署 SOUL.md：profile create 会先写默认模板，需识别默认模板并覆盖；
      // 用户后续自定义（非默认模板）则保留不覆盖
      const soulSrc = path.join(soulDir, id + ".md");
      const soulDst = path.join(profileDir, "SOUL.md");
      if (fs.existsSync(soulSrc)) {
        const isDefaultSoul =
          !fs.existsSync(soulDst) ||
          fs.readFileSync(soulDst, "utf-8").includes("You are Hermes Agent, an intelligent AI assistant created by Nous Research");
        if (isDefaultSoul) fs.copyFileSync(soulSrc, soulDst);
      }
    } catch (err) {
      console.warn("[edict-bridge] 引导 profile " + id + " 失败: " + (err instanceof Error ? err.message : String(err)));
    }
  }
  syncHermesProfileConfigs(hermesHome, EDICT_PROFILE_IDS);
  return { ok: true, created };
}

// ===== 运行时引导（幂等复制 + 种子） =====

function copyIfChanged(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  const same = fs.existsSync(dst) && fs.readFileSync(src).equals(fs.readFileSync(dst));
  if (same) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDirIfChanged(srcDir: string, dstDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDirIfChanged(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
    else copyIfChanged(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
  }
}

/** 首次运行/升级时把只读蓝本同步到可写运行时（镜像原仓库根布局，幂等） */
export function ensureEdictRuntime(): { dataRoot: string; script: string } {
  const src = getEdictResourcesRoot();
  const dst = getEdictDataRoot();
  // 状态机单一事实源：resources/edict/kanban/task.py → <data>/edict/backend/app/models/task.py
  // （kanban_update.py 按原版路径动态加载 STATE_TRANSITIONS）
  copyIfChanged(path.join(src, "kanban", "task.py"), path.join(dst, "edict", "backend", "app", "models", "task.py"));
  copyDirIfChanged(path.join(src, "scripts"), path.join(dst, "scripts"));
  copyDirIfChanged(path.join(src, "agents"), path.join(dst, "agents"));
  copyIfChanged(path.join(src, "agents.json"), path.join(dst, "agents.json"));
  copyIfChanged(path.join(src, "data", "schema.json"), path.join(dst, "data", "schema.json"));
  // 数据种子
  const dataDir = path.join(dst, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const tasksFile = path.join(dataDir, "tasks_source.json");
  if (!fs.existsSync(tasksFile)) fs.writeFileSync(tasksFile, "[]", "utf-8");
  const liveFile = path.join(dataDir, "live_status.json");
  if (!fs.existsSync(liveFile)) fs.writeFileSync(liveFile, JSON.stringify({ tasks: [], officials: [], updatedAt: "" }), "utf-8");
  return { dataRoot: dst, script: path.join(dst, "scripts", "kanban_update.py") };
}

// ===== 真实依赖（注入到 edict-orchestrator） =====

export function createEdictDeps(): EdictDeps {
  ensureEdictRuntime();
  const dataRoot = getEdictDataRoot();
  const tasksFile = path.join(dataRoot, "data", "tasks_source.json");
  const scriptPath = path.join(dataRoot, "scripts", "kanban_update.py");

  const spawnKanban: EdictDeps["spawnKanban"] = (args, envExtra) =>
    new Promise((resolve) => {
      const python = resolveHermesPython();
      if (!fs.existsSync(python)) {
        resolve({ code: 2, stdout: "", stderr: "Hermes Python 运行时未安装（需要 edict 看板）" });
        return;
      }
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        EDICT_HOME: dataRoot,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        AGENT_ID: envExtra?.AGENT_ID || "taizi",
      };
      // args[0] = kanban_update.py（占位），其余为 CLI 参数
      const scriptArgs = args.length > 1 ? args.slice(1) : args;
      const child = spawn(python, [scriptPath, ...scriptArgs], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("error", (err) => resolve({ code: 2, stdout, stderr: err.message }));
      child.on("close", (code) => resolve({ code: code ?? 2, stdout, stderr }));
    });

  const runHermes: EdictDeps["runHermes"] = (profileId, prompt) =>
    new Promise((resolve, reject) => {
      const env = buildHermesCliEnv();
      const nodeBin = env.HERMES_NODE as string;
      const entry = env.HERMES_ENTRY as string;
      if (!nodeBin || !entry || !fs.existsSync(nodeBin) || !fs.existsSync(entry)) {
        reject(new Error("Hermes 运行时未安装或未配置（官署执行需要 Hermes）"));
        return;
      }
      // profile 是独立 HERMES_HOME：先同步全局 config.yaml 到该 profile，避免 No inference provider configured
      syncHermesProfileConfigs(env.HERMES_HOME as string, [profileId as (typeof EDICT_PROFILE_IDS)[number]]);
      // Hermes CLI：-p 指定官署 profile，chat -q 一次性问答（照搬 hermes-orchestrator spawnCli 模式）
      const args = [entry, "-p", profileId, "chat", "-q", prompt, "-Q", "--source", "tool"];
      const child = spawn(nodeBin, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("error", (err) => reject(new Error("Hermes 启动失败: " + err.message)));
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Hermes 执行失败（退出码 ${code}）: ${(stderr || stdout).slice(0, 300)}`));
      });
    });

  const readBoard: EdictDeps["readBoard"] = () => {
    try {
      const raw = fs.readFileSync(tasksFile, "utf-8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? (data as EdictTask[]) : [];
    } catch {
      return [];
    }
  };

  const writeBoard: EdictDeps["writeBoard"] = (tasks) => {
    fs.mkdirSync(path.dirname(tasksFile), { recursive: true });
    const tmp = tasksFile + ".bridge-tmp";
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), "utf-8");
    fs.renameSync(tmp, tasksFile);
    return tasks;
  };


  // 编排结束 best-effort 计费回写：POST /api/hermes/executions/report（call_type=orchestrate）
  const reportExecution: EdictDeps["reportExecution"] = async (input) => {
    const authFile = path.join(app.getPath("userData"), "openclaw-chat", "auth.json");
    let token = "";
    try {
      if (fs.existsSync(authFile)) {
        const auth = JSON.parse(fs.readFileSync(authFile, "utf-8"));
        token = typeof auth?.token === "string" ? auth.token : "";
      }
    } catch {
      // 未登录/文件损坏：跳过回写
    }
    if (!token) return;
    const res = await fetch(`${ST_API_BASE}/hermes/executions/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        executionRef: `edict:${input.taskId}`,
        teamTaskId: 0,
        status: input.status,
        summary: input.summary,
        steps: input.steps,
        durationMs: input.durationMs,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`上报 call_log 失败: HTTP ${res.status}`);
  };

  return {
    spawnKanban,
    runHermes,
    readBoard,
    writeBoard,
    now: () => Date.now(),
    log: (msg) => console.log("[edict] " + msg),
    reportExecution,
  };
}

// ===== 当前默认模型（edict:models） =====

export function readEdictDefaultModel(): string {
  try {
    const cfg = path.join(app.getPath("userData"), "hermes-home", "config.yaml");
    const raw = fs.readFileSync(cfg, "utf-8");
    const m = raw.match(/^\s+default:\s*(\S+)\s*$/m) || raw.match(/^model:\s*(\S+)\s*$/m) || raw.match(/^\s+model:\s*(\S+)\s*$/m);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

// ===== IPC 注册 + 看板轮询 =====

export interface EdictIpcOptions {
  /** 广播函数（默认发到所有窗口） */
  broadcast?: (channel: string, payload: unknown) => void;
  /** 看板轮询间隔 ms（默认 3000） */
  pollIntervalMs?: number;
}

/** 注册 edict:* IPC 通道；返回 dispose（停止轮询） */
export function registerEdictIpc(deps: EdictDeps, opts: EdictIpcOptions = {}): () => void {
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
  const broadcast =
    opts.broadcast ??
    ((channel: string, payload: unknown) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      }
    });

  /** 在途编排任务（防重入） */
  const runningTasks = new Set<string>();

  /** 后台编排：新任务自动走三省六部（中书→门下→尚书→六部），失败仅记日志不阻塞 */
  const runPipelineSafe = (taskId: string): void => {
    if (runningTasks.has(taskId)) return;
    runningTasks.add(taskId);
    void edictRunPipeline(deps, taskId)
      .then((r) => {
        if (!r.ok) console.error("[edict] 编排失败 " + taskId + ": " + r.error);
      })
      .catch((err) => console.error("[edict] 编排异常 " + taskId + ": " + (err as Error).message))
      .finally(() => runningTasks.delete(taskId));
  };

  ipcMain.handle("edict:issue", async (_e, input: { title?: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp> => {
    const r = await edictIssue(deps, { title: input?.title || "", body: input?.body, priority: input?.priority, dept: input?.dept });
    if (r.ok && r.data?.taskId) runPipelineSafe(r.data.taskId);
    return r;
  });
  ipcMain.handle("edict:board", (): EdictBoard => edictBoard(deps));
  ipcMain.handle("edict:task", (_e, taskId: string): EdictOp<EdictTask | null> => {
    const task = deps.readBoard().find((t) => t.id === taskId);
    return task ? { ok: true, data: task } : { ok: false, error: `任务不存在: ${taskId}` };
  });
  ipcMain.handle("edict:transition", (_e, taskId: string, to: string, note?: string): Promise<EdictOp> => {
    return edictTransition(deps, taskId, to as never, { note });
  });
  ipcMain.handle("edict:veto", (_e, taskId: string, reason: string): Promise<EdictOp> => edictVeto(deps, taskId, reason));
  ipcMain.handle("edict:approve", (_e, taskId: string): Promise<EdictOp> => edictApprove(deps, taskId));
  ipcMain.handle("edict:complete", (_e, taskId: string, output: string, summary: string, actorAgentId?: string): Promise<EdictOp> =>
    edictComplete(deps, taskId, output || "", summary || "", actorAgentId)
  );
  ipcMain.handle("edict:block", (_e, taskId: string, reason: string): Promise<EdictOp> => edictBlock(deps, taskId, reason));
  ipcMain.handle("edict:progress", (_e, taskId: string, text: string, plan: string): Promise<EdictOp> =>
    edictProgress(deps, taskId, text || "", plan || "")
  );
  ipcMain.handle("edict:run", async (_e, taskId: string, runOpts?: { maxVetoRounds?: number }): Promise<EdictOp> => {
    if (runningTasks.has(taskId)) return { ok: false, error: "该任务正在编排执行中，请稍候" };
    return edictRunPipeline(deps, taskId, runOpts || {});
  });
  ipcMain.handle("edict:officials", () => edictOfficials(deps));
  ipcMain.handle("edict:stats", () => edictStats(deps));
  ipcMain.handle("edict:models", () => ({
    default: readEdictDefaultModel(),
    profiles: OFFICIALS.filter((o) => o.id !== "taizi").map((o) => ({ id: o.id, label: o.label })),
  }));

  // 看板轮询：内容变化 → 广播 board-updated；单个任务变化 → task-updated；新传旨任务自动编排
  let lastRaw = "";
  const readRaw = () => {
    try {
      return fs.readFileSync(path.join(getEdictDataRoot(), "data", "tasks_source.json"), "utf-8");
    } catch {
      return "";
    }
  };
  lastRaw = readRaw();
  const timer = setInterval(() => {
    const raw = readRaw();
    if (raw === lastRaw) return;
    const prev = lastRaw;
    lastRaw = raw;
    const board = edictBoard(deps);
    broadcast("edict:board-updated", board);
    try {
      const prevTasks = JSON.parse(prev) as EdictTask[];
      const curTasks = JSON.parse(raw) as EdictTask[];
      for (const t of curTasks) {
        const p = prevTasks.find((x) => x.id === t.id);
        if (!p || JSON.stringify(p) !== JSON.stringify(t)) {
          broadcast("edict:task-updated", t);
        }
      }
      // 工具卡/外部新建的传旨任务（Taizi/Zhongshu 且此前不存在）→ 自动进入三省六部编排
      for (const t of curTasks) {
        const isNew = !prevTasks.some((x) => x.id === t.id);
        const canRun = t.state === "Taizi" || t.state === "Zhongshu";
        if (isNew && canRun && !runningTasks.has(t.id)) {
          runPipelineSafe(t.id);
        }
      }
    } catch {
      /* 解析失败仅广播 board-updated */
    }
  }, pollIntervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}

// ===== 补齐面板依赖（edict-extra） =====

/** 构建补齐面板（monitor/court/models/skills/morning/sessions）依赖；复用同一份看板 deps */
export function createEdictExtraDeps(base: EdictDeps): EdictExtraDeps {
  return {
    ...base,
    hermesHome: path.join(app.getPath("userData"), "hermes-home"),
    edictDataRoot: getEdictDataRoot(),
    runtimeRoot: getRuntimeRoot(),
    stApiBase: ST_API_BASE,
    getAuthToken: () => {
      try {
        const auth = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "openclaw-chat", "auth.json"), "utf-8"));
        return typeof auth?.token === "string" ? auth.token : "";
      } catch {
        return "";
      }
    },
    ensureProfiles: (ids) => ensureEdictHermesProfiles(ids),
  };
}
