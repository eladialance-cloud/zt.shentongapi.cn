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
import { createConnection } from "node:net";
import * as path from "node:path";
import { getRuntimeRoot } from "./runtime-config";
import { EDICT_PROFILE_IDS, syncHermesProfileConfigs, applyAgentModels } from "./hermes-config";
import {
  appendFlowLog,
  edictAdvance,
  edictApprove,
  edictBlock,
  edictBoard,
  edictCancel,
  edictComplete,
  edictIssue,
  edictOfficials,
  edictProgress,
  edictRunPipeline,
  edictStats,
  edictTransition,
  edictUnblock,
  edictVeto,
  escalateOneLevel,
  isStalledTask,
  stallMetaOf,
  type EdictDeps,
} from "./edict-orchestrator";
import type { EdictBoard, EdictNotifyConfig, EdictOp, EdictTask } from "../shared/edict-types";
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
  // 回灌军机处持久化的官署模型（全局同步会覆盖 profile model，需按用户选择恢复）
  applyAgentModels(hermesHome, EDICT_PROFILE_IDS);
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
        const out = stdout.trim();
        if (code === 0) {
          if (out) {
            resolve(out);
          } else if (stderr.trim()) {
            // 退出码 0 但无输出：stderr 有内容按失败处理（对齐聊天链路；答案在 stdout，横幅在 stderr）
            reject(new Error(`Hermes 无输出（stderr: ${stderr.trim().slice(0, 300)}）`));
          } else {
            reject(new Error("Hermes 执行完成但无任何输出"));
          }
        } else {
          reject(new Error(`Hermes 执行失败（退出码 ${code}）: ${(stderr || stdout).slice(0, 300)}`));
        }
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
    notify: (input) => sendEdictNotify({
      title: input.finalState === "Done" ? "✅ 三省六部任务完成" : input.finalState === "Cancelled" ? "🗑 三省六部任务已取消" : input.finalState === "Blocked" ? "⛔ 三省六部任务已阻塞" : "❌ 三省六部执行失败",
      content: `任务 ${input.taskId}《${input.title}》\n结果：${input.finalState}${input.summary ? "\n" + input.summary : ""}`,
    }),
  };
}

// ===== 结果回传通知（P5：照搬 edict 原版 feishu.py / wecom.py 负载格式） =====

function getEdictNotifyConfigFile(): string {
  return path.join(getEdictDataRoot(), "data", "notify-config.json");
}

/** 读取通知配置（本地持久化；缺省关闭） */
export function readEdictNotifyConfig(): EdictNotifyConfig {
  try {
    const raw = fs.readFileSync(getEdictNotifyConfigFile(), "utf-8");
    const cfg = JSON.parse(raw) as Partial<EdictNotifyConfig>;
    return {
      enabled: !!cfg.enabled,
      feishuWebhook: typeof cfg.feishuWebhook === "string" ? cfg.feishuWebhook : "",
      wecomWebhook: typeof cfg.wecomWebhook === "string" ? cfg.wecomWebhook : "",
    };
  } catch {
    return { enabled: false, feishuWebhook: "", wecomWebhook: "" };
  }
}

/** 保存通知配置 */
export function saveEdictNotifyConfig(cfg: EdictNotifyConfig): EdictOp {
  const next: EdictNotifyConfig = {
    enabled: !!cfg?.enabled,
    feishuWebhook: typeof cfg?.feishuWebhook === "string" ? cfg.feishuWebhook.trim() : "",
    wecomWebhook: typeof cfg?.wecomWebhook === "string" ? cfg.wecomWebhook.trim() : "",
  };
  try {
    fs.mkdirSync(path.dirname(getEdictNotifyConfigFile()), { recursive: true });
    fs.writeFileSync(getEdictNotifyConfigFile(), JSON.stringify(next, null, 2), "utf-8");
    return { ok: true, data: next };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 发送单个 webhook（照搬 feishu.py interactive card / wecom.py markdown 负载） */
async function sendWebhook(kind: "feishu" | "wecom", webhook: string, title: string, content: string, url?: string): Promise<void> {
  let body: string;
  if (kind === "feishu") {
    const elements: unknown[] = [{ tag: "div", text: { tag: "lark_md", content } }];
    if (url) {
      elements.push({ tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "查看详情" }, url, type: "primary" }] });
    }
    body = JSON.stringify({ msg_type: "interactive", card: { header: { title: { tag: "plain_text", content: title }, template: "blue" }, elements } });
  } else {
    let text = `**${title}**\n${content}`;
    if (url) text += `\n[查看详情](${url})`;
    body = JSON.stringify({ msgtype: "markdown", markdown: { content: text } });
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${kind === "feishu" ? "飞书" : "企业微信"} webhook 返回 HTTP ${res.status}`);
}

/** 发送通知（读配置；开关关闭或未配置时静默跳过；任一渠道失败抛错由调用方 best-effort 兜底） */
export async function sendEdictNotify(input: { title: string; content: string; url?: string }): Promise<void> {
  const cfg = readEdictNotifyConfig();
  if (!cfg.enabled) return;
  const jobs: Promise<void>[] = [];
  if (cfg.feishuWebhook) jobs.push(sendWebhook("feishu", cfg.feishuWebhook, input.title, input.content, input.url));
  if (cfg.wecomWebhook) jobs.push(sendWebhook("wecom", cfg.wecomWebhook, input.title, input.content, input.url));
  if (!jobs.length) return;
  await Promise.all(jobs);
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

  // P2 人工介入（省部调度任务卡操作）：取消 / 推进 / 重试 / 升级 / 解阻
  ipcMain.handle("edict:cancel", (_e, taskId: string): Promise<EdictOp> => edictCancel(deps, taskId));
  ipcMain.handle("edict:advance", (_e, taskId: string): Promise<EdictOp> => edictAdvance(deps, taskId));
  ipcMain.handle("edict:escalate", (_e, taskId: string): Promise<EdictOp> => escalateOneLevel(deps, taskId));
  ipcMain.handle("edict:unblock", (_e, taskId: string): Promise<EdictOp> => edictUnblock(deps, taskId));
  ipcMain.handle("edict:retry", (_e, taskId: string): EdictOp => {
    if (runningTasks.has(taskId)) return { ok: false, error: "该任务正在编排执行中，请稍候" };
    runPipelineSafe(taskId);
    return { ok: true, data: "已重新触发三省六部编排" };
  });

  // P5 结果回传通知配置（桌面端本地持久化）
  ipcMain.handle("edict:notify-config", (): EdictNotifyConfig => readEdictNotifyConfig());
  ipcMain.handle("edict:save-notify-config", (_e, cfg: EdictNotifyConfig): EdictOp => saveEdictNotifyConfig(cfg));
  ipcMain.handle("edict:test-notify", async (): Promise<EdictOp> => {
    try {
      const cfg = readEdictNotifyConfig();
      if (!cfg.enabled) return { ok: false, error: "通知开关未开启" };
      if (!cfg.feishuWebhook && !cfg.wecomWebhook) return { ok: false, error: "未配置任何 Webhook（飞书/企微至少填一个）" };
      await sendEdictNotify({ title: "🧪 三省六部通知测试", content: "这是一条来自深瞳AI桌面端的测试消息，通知配置已生效。" });
      return { ok: true, data: "测试消息已发送" };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

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

  // P2 停滞检测器（照搬 orchestrator_worker._check_stalled）：每 60s 扫描停滞任务
  // 恢复策略：重试（≤2 次）→ 升级（≤3 级）→ 标记 Blocked 人工介入
  const STALL_THRESHOLD_MS = 10 * 60_000;
  const MAX_STALL_RETRIES = 2;
  const MAX_ESCALATION_LEVEL = 3;

  const applyStallRecovery = async (task: EdictTask): Promise<void> => {
    const taskId = task.id;
    const nowIso = new Date().toISOString();
    const { stallCount, escalationLevel } = stallMetaOf(task);
    const cur = deps.readBoard().find((t) => t.id === taskId);
    if (!cur || runningTasks.has(taskId)) return;
    // 停滞检测落痕（flow_log 可见）
    await appendFlowLog(deps, taskId, {
      from: cur.state,
      to: cur.state,
      remark: `⏰ 停滞检测：${cur.state} 超过 10 分钟无进展`,
      agent: "orchestrator",
      agentLabel: "编排器",
    });
    if (stallCount < MAX_STALL_RETRIES) {
      const tasks = deps.readBoard();
      deps.writeBoard(tasks.map((t) => (t.id === taskId ? { ...t, meta: { ...(t.meta || {}), stall_count: stallCount + 1, last_stall_at: nowIso } } : t)));
      deps.log?.(`[edict] 停滞重试 ${taskId}（第 ${stallCount + 1} 次）`);
      runPipelineSafe(taskId);
      return;
    }
    if (escalationLevel < MAX_ESCALATION_LEVEL) {
      deps.log?.(`[edict] 停滞升级 ${taskId}（第 ${escalationLevel + 1} 级）`);
      await escalateOneLevel(deps, taskId);
      // 升级到可继续流转的状态（如 Menxia→Zhongshu）后重新编排；Blocked 则停在人工介入
      runPipelineSafe(taskId);
      return;
    }
    deps.log?.(`[edict] 停滞转阻塞 ${taskId}（重试${MAX_STALL_RETRIES}次+升级${MAX_ESCALATION_LEVEL}级）`);
    await edictBlock(deps, taskId, "任务多次停滞（重试2次+升级3级），需人工介入", "zhongshu");
  };

  const stallTimer = setInterval(() => {
    const now = Date.now();
    for (const t of deps.readBoard()) {
      if (!isStalledTask(t, now, STALL_THRESHOLD_MS)) continue;
      void applyStallRecovery(t);
    }
  }, 60_000);
  stallTimer.unref?.();

  return () => {
    clearInterval(timer);
    clearInterval(stallTimer);
  };
}

// ===== 补齐面板依赖（edict-extra） =====

// ===== Hermes 运行时真实状态探测（P1） =====

/** Hermes 服务端口（与 service-manager SERVICE_DEFS.hermes.port 对齐） */
const HERMES_STATUS_PORT = 8642;

function tcpProbe(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    setTimeout(() => done(false), 1200);
  });
}

/** 本地探测 Hermes 运行时：alive=端口监听；probe=HTTP 有响应（任意非 5xx） */
export async function probeHermesRuntime(): Promise<{ alive: boolean; probe: boolean; status: string; checkedAt: string }> {
  const alive = await tcpProbe(HERMES_STATUS_PORT);
  let probe = false;
  if (alive) {
    try {
      const res = await fetch("http://127.0.0.1:" + HERMES_STATUS_PORT + "/health", { signal: AbortSignal.timeout(1500) });
      probe = res.status < 500;
    } catch {
      probe = false;
    }
  }
  return {
    alive,
    probe,
    status: alive ? (probe ? "Hermes 运行时正常" : "Hermes 已监听（API 未就绪）") : "Hermes 运行时未启动",
    checkedAt: new Date().toISOString(),
  };
}

export interface CreateEdictExtraDepsOptions {
  /** 真实 Hermes 运行时状态（P1）：优先注入 serviceManager 状态；缺省走本地端口探测 */
  getHermesRuntimeStatus?: () => Promise<{ alive: boolean; probe: boolean; status: string; checkedAt?: string }>;
}

/** 构建补齐面板（monitor/court/models/skills/morning/sessions）依赖；复用同一份看板 deps */
export function createEdictExtraDeps(base: EdictDeps, opts: CreateEdictExtraDepsOptions = {}): EdictExtraDeps {
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
    getHermesRuntimeStatus: opts.getHermesRuntimeStatus ?? (() => probeHermesRuntime()),
  };
}
