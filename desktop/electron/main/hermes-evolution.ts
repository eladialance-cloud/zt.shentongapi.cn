/** Hermes 进化可视化桥：记忆卡片（MEMORY.md/USER.md）+ 学习时间线（journey --json）+ 策展/记忆状态（curator/memory status） */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { getRuntimeRoot } from "./runtime-config";

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

/** 汇总：记忆卡片 + 学习时间线 + 策展/记忆状态（各失败独立降级，不阻断） */
export async function getEvolution(): Promise<HermesEvolutionResult> {
  const memoryCards = [
    ...parseMemoryCards("memory", readMemoryFile("MEMORY.md")),
    ...parseMemoryCards("profile", readMemoryFile("USER.md")),
  ];
  const journeyRun = await runHermes(["journey", "--json"], 60000);
  const curatorRun = await runHermes(["curator", "status"], 60000);
  const memoryRun = await runHermes(["memory", "status"], 60000);
  const errors: string[] = [];
  if (journeyRun.code !== 0 && !journeyRun.stdout) errors.push("journey: " + (journeyRun.stderr.trim() || "失败"));
  if (curatorRun.code !== 0 && !curatorRun.stdout) errors.push("curator: " + (curatorRun.stderr.trim() || "失败"));
  if (memoryRun.code !== 0 && !memoryRun.stdout) errors.push("memory: " + (memoryRun.stderr.trim() || "失败"));
  return {
    ok: true,
    error: errors.length > 0 ? errors.join("；") : undefined,
    memory: memoryCards,
    journey: parseJourneyJson(journeyRun.stdout),
    journeyRaw: journeyRun.stdout.trim().slice(0, 4000) || undefined,
    curator: curatorRun.stdout.trim().slice(0, 4000) || undefined,
    memoryStatus: memoryRun.stdout.trim().slice(0, 2000) || undefined,
  };
}
