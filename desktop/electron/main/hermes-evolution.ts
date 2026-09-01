/** Hermes 进化可视化桥：记忆卡片（MEMORY.md/USER.md）+ 学习时间线（journey --json / 原生 learning graph）+ 策展/记忆状态
 * P0：优先走 Hermes 原生 API（HermesClient.getLearningGraph / getCurator / getMemoryProviders），
 * 失败或未接入时降级 CLI（journey --json / curator status / memory status），各失败独立降级不阻断。
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getRuntimeRoot } from "./runtime-config";
import { HermesClient } from "./hermes-client";

export interface MemoryCard {
  source: "memory" | "profile";
  text: string;
}

export interface HermesEvolutionResult {
  ok: boolean;
  error?: string;
  memory?: MemoryCard[];
  journey?: Record<string, unknown> | null;
  journeyRaw?: string;
  curator?: string;
  memoryStatus?: string;
}

/** 解析 MEMORY.md / USER.md 为卡片（learning_mutations 同款：§ 分隔，空块过滤） */
export function parseMemoryCards(source: "memory" | "profile", content: string): MemoryCard[] {
  return (content || "")
    .split(/§/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((text) => ({ source, text }));
}

/** 容错解析 journey --json 输出（去掉前后杂文本，取第一个 JSON 对象/数组） */
export function parseJourneyJson(stdout: string): Record<string, unknown> | null {
  const m = stdout.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getHermesHome(): string {
  return join(app.getPath("userData"), "hermes-home");
}

function runHermes(args: string[], timeoutMs = 60000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const root = getRuntimeRoot();
    const nodeBin = join(root, "hermes", "node", "node.exe");
    const entry = join(root, "hermes", "node_modules", "hermes-agent", "bin", "hermes.js");
    if (!existsSync(nodeBin) || !existsSync(entry)) {
      resolve({ code: -1, stdout: "", stderr: "Hermes 运行时未安装或未配置" });
      return;
    }
    const child = spawn(nodeBin, [entry, ...args], {
      env: { ...process.env, HERMES_HOME: getHermesHome() },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs);
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

function readMemoryFile(name: string): string {
  const p = join(getHermesHome(), name);
  if (!existsSync(p)) return "";
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 原生路径：进化图谱 / 策展状态 / 记忆 provider 状态 */
async function collectNative(client: HermesClient): Promise<{
  journey: Record<string, unknown> | null;
  journeyRaw?: string;
  curator?: string;
  memoryStatus?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  let journey: Record<string, unknown> | null = null;
  let journeyRaw: string | undefined;
  let curator: string | undefined;
  let memoryStatus: string | undefined;
  try {
    const graph = await client.getLearningGraph();
    journey = graph as unknown as Record<string, unknown>;
    journeyRaw = JSON.stringify(graph).slice(0, 4000) || undefined;
  } catch (err) {
    errors.push("journey: " + errMsg(err));
  }
  try {
    const state = await client.getCurator();
    curator = JSON.stringify(state, null, 2).slice(0, 4000);
  } catch (err) {
    errors.push("curator: " + errMsg(err));
  }
  try {
    const providers = await client.getMemoryProviders();
    memoryStatus = providers.length > 0
      ? providers.map((p) => "- " + p.name + ": " + (p.status ?? "unknown") + (p.available ? "" : "（未就绪）")).join("\n")
      : "（无记忆提供商）";
  } catch (err) {
    errors.push("memory: " + errMsg(err));
  }
  return { journey, journeyRaw, curator, memoryStatus, errors };
}

/** CLI 降级路径：journey --json / curator status / memory status */
async function collectCli(): Promise<{
  journey: Record<string, unknown> | null;
  journeyRaw?: string;
  curator?: string;
  memoryStatus?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  const journeyRun = await runHermes(["journey", "--json"], 60000);
  const curatorRun = await runHermes(["curator", "status"], 60000);
  const memoryRun = await runHermes(["memory", "status"], 60000);
  if (journeyRun.code !== 0 && !journeyRun.stdout) errors.push("journey: " + (journeyRun.stderr.trim() || "失败"));
  if (curatorRun.code !== 0 && !curatorRun.stdout) errors.push("curator: " + (curatorRun.stderr.trim() || "失败"));
  if (memoryRun.code !== 0 && !memoryRun.stdout) errors.push("memory: " + (memoryRun.stderr.trim() || "失败"));
  return {
    journey: parseJourneyJson(journeyRun.stdout),
    journeyRaw: journeyRun.stdout.trim().slice(0, 4000) || undefined,
    curator: curatorRun.stdout.trim().slice(0, 4000) || undefined,
    memoryStatus: memoryRun.stdout.trim().slice(0, 2000) || undefined,
    errors,
  };
}

/** 汇总：记忆卡片 + 学习时间线 + 策展/记忆状态（各失败独立降级，不阻断）
 * @param client Hermes 原生客户端；缺省时走 CLI 降级
 */
export async function getEvolution(client?: HermesClient): Promise<HermesEvolutionResult> {
  const memoryCards = [
    ...parseMemoryCards("memory", readMemoryFile("MEMORY.md")),
    ...parseMemoryCards("profile", readMemoryFile("USER.md")),
  ];
  const collected = client
    ? await collectNative(client)
    : await collectCli();
  return {
    ok: true,
    error: collected.errors.length > 0 ? collected.errors.join("；") : undefined,
    memory: memoryCards,
    journey: collected.journey,
    journeyRaw: collected.journeyRaw,
    curator: collected.curator,
    memoryStatus: collected.memoryStatus,
  };
}
