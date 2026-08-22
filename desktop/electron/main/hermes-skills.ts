/** 本地 Hermes 技能管理桥：封装 hermes skills CLI（list/search/install/update/uninstall/check） */
import { spawn } from "node:child_process";
import { readdirSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { app } from "electron";
import { getRuntimeRoot } from "./runtime-config";

export interface HermesSkillItem {
  name: string;
  /** source: hub / builtin / local（--json 输出可用时） */
  source?: string;
  version?: string;
  /** 是否随桌面端分发的内置技能 */
  builtin?: boolean;
}

export interface HermesSkillsListResult {
  ok: boolean;
  error?: string;
  items?: HermesSkillItem[];
  /** 原始输出（JSON 解析失败时供 UI 兜底展示） */
  stdout?: string;
}

export interface HermesSkillsOpResult {
  ok: boolean;
  error?: string;
  stdout?: string;
}

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** 内置 Hermes 技能目录（打包后 resources/hermes/skills；开发环境 desktop/resources/hermes/skills） */
function getBundledSkillsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "hermes", "skills")
    : join(process.cwd(), "resources", "hermes", "skills");
}

/** 内置技能名单（目录名） */
export function listBundledHermesSkills(): string[] {
  try {
    const dir = getBundledSkillsDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function runHermes(args: string[], timeoutMs = 120000): Promise<CliRun> {
  return new Promise((resolve) => {
    const root = getRuntimeRoot();
    const nodeBin = join(root, "hermes", "node", "node.exe");
    const entry = join(root, "hermes", "node_modules", "hermes-agent", "bin", "hermes.js");
    if (!existsSync(nodeBin) || !existsSync(entry)) {
      resolve({ code: -1, stdout: "", stderr: "Hermes 运行时未安装或未配置" });
      return;
    }
    const env = {
      ...process.env,
      HERMES_NODE: nodeBin,
      HERMES_ENTRY: entry,
      HERMES_HOME: join(app.getPath("userData"), "hermes-home"),
    };
    const child = spawn(nodeBin, [entry, ...args], {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + "\n" + err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** 容错解析 CLI 输出的 JSON 数组（支持 ```json 代码块 / 前后杂文本） */
function tryParseJsonArray(stdout: string): Array<Record<string, unknown>> | null {
  const m = stdout.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

/** 解析 hermes skills list --json 输出 → 技能项（builtin 标注） */
export function parseSkillsList(stdout: string, builtinNames: string[]): HermesSkillItem[] {
  const raw = tryParseJsonArray(stdout);
  if (raw) {
    return raw.map((r) => ({
      name: String(r.name ?? r.id ?? ""),
      source: r.source ? String(r.source) : undefined,
      version: r.version ? String(r.version) : undefined,
      builtin: builtinNames.includes(String(r.name ?? r.id ?? "")),
    }));
  }
  // 文本兜底：解析 hermes skills list 的表格输出（│ name │ category │ source │ trust │ status │）
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[│┃]\s*[\w.-]+/.test(l))
    .map((l) => l.replace(/^[│┃]\s*/, "").split(/[│┃\s]+/)[0])
    .filter((n) => !!n && n.toLowerCase() !== "name")
    .map((name) => ({ name, builtin: builtinNames.includes(name) }));
}

/** 解析 hermes skills search --json 输出 → 结果项 */
export function parseSkillsSearch(stdout: string): HermesSkillItem[] {
  const raw = tryParseJsonArray(stdout);
  if (!raw) return [];
  return raw.map((r) => ({
    name: String(r.id ?? r.name ?? ""),
    source: r.source ? String(r.source) : undefined,
  }));
}

/** 已安装技能列表（含内置标注） */
export async function listSkills(): Promise<HermesSkillsListResult> {
  const builtin = listBundledHermesSkills();
  const run = await runHermes(["skills", "list"], 60000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills list 失败", stdout: run.stdout };
  }
  return { ok: true, items: parseSkillsList(run.stdout, builtin), stdout: run.stdout };
}

/** 搜索技能市场 */
export async function searchSkills(query: string): Promise<HermesSkillsListResult> {
  const q = (query || "").trim();
  if (!q) return { ok: false, error: "搜索词为空" };
  const run = await runHermes(["skills", "search", q, "--json"], 60000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills search 失败", stdout: run.stdout };
  }
  return { ok: true, items: parseSkillsSearch(run.stdout), stdout: run.stdout };
}

/** 安装技能（identifier: openai/skills/skill-creator 或 SKILL.md URL） */
export async function installSkill(identifier: string): Promise<HermesSkillsOpResult> {
  const id = (identifier || "").trim();
  if (!id) return { ok: false, error: "技能标识为空" };
  const run = await runHermes(["skills", "install", id, "-y"], 180000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills install 失败", stdout: run.stdout };
  }
  return { ok: true, stdout: run.stdout };
}

/** 更新技能（name 缺省 = 全部过期技能） */
export async function updateSkills(name?: string): Promise<HermesSkillsOpResult> {
  const args = name && name.trim() ? ["skills", "update", name.trim()] : ["skills", "update"];
  const run = await runHermes(args, 180000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills update 失败", stdout: run.stdout };
  }
  return { ok: true, stdout: run.stdout };
}

/** 卸载技能 */
export async function uninstallSkill(name: string): Promise<HermesSkillsOpResult> {
  const n = (name || "").trim();
  if (!n) return { ok: false, error: "技能名为空" };
  const run = await runHermes(["skills", "uninstall", n, "-y"], 60000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills uninstall 失败", stdout: run.stdout };
  }
  return { ok: true, stdout: run.stdout };
}

/** 检查可更新技能 */
export async function checkSkills(): Promise<HermesSkillsOpResult> {
  const run = await runHermes(["skills", "check"], 60000);
  if (run.code !== 0) {
    return { ok: false, error: run.stderr.trim() || "hermes skills check 失败", stdout: run.stdout };
  }
  return { ok: true, stdout: run.stdout };
}



/** 本地技能目录（$HERMES_HOME/skills，与 runHermes 的 HERMES_HOME 保持一致） */
export function getLocalSkillsDir(): string {
  return join(app.getPath("userData"), "hermes-home", "skills");
}

/** 从本地文件夹安装技能：文件夹内需含 SKILL.md，复制到 $HERMES_HOME/skills/<name> */
export async function installSkillLocal(dirPath: string): Promise<HermesSkillsOpResult> {
  const dir = (dirPath || "").trim();
  if (!dir) return { ok: false, error: "技能文件夹路径为空" };
  if (!existsSync(dir)) return { ok: false, error: "所选文件夹不存在" };
  const hasSkillMd = readdirSync(dir).some((f) => f.toLowerCase() === "skill.md");
  if (!hasSkillMd) {
    return { ok: false, error: "所选文件夹内未找到 SKILL.md，不是有效的技能目录" };
  }
  const name = basename(dir).replace(/[^\w\-. ]/g, "_").trim();
  if (!name) return { ok: false, error: "无法从文件夹名解析技能名" };
  const targetDir = join(getLocalSkillsDir(), name);
  if (existsSync(targetDir)) {
    return { ok: false, error: "本地已存在同名技能「" + name + "」，请先卸载或换文件夹名" };
  }
  try {
    mkdirSync(getLocalSkillsDir(), { recursive: true });
    cpSync(dir, targetDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: "复制技能失败: " + (err instanceof Error ? err.message : String(err)) };
  }
  return { ok: true, stdout: "已安装本地技能: " + name };
}
