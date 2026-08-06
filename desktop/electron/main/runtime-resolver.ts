// 跨平台运行时路径解析器（Task 2 + Task 9.1）
//
// 职责：
// - 解析 N8N / OpenClaw / MCP Gateway / Hermes Agent 四个本地服务运行时的入口绝对路径
// - 解析优先级：内置 extraResources → userData 补丁 → 宿主机命令回退
// - 校验运行时文件完整性（SHA-256，流式处理大文件）
// - 读取 manifest.json（Task 9.1：比对 builtin 与 userData 的 version 字段，返回较新者）
//
// 说明：
// - 服务 key 即目录名：n8n → runtime/n8n/，mcp → runtime/mcp/（非 mcp-gateway）
// - 入口文件名在 manifest 的 entry 字段中（如 mcp 服务的 win32 入口是 mcp-gateway.exe）
// - 开发环境下 process.resourcesPath 指向 electron 自身目录，需用 process.cwd() 兜底

import { app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { getRuntimeRoot } from "./runtime-config";
import { EMBEDDED_MANIFEST } from "./runtime-manifest-embedded";
import type {
  ServiceName,
  RuntimeManifest,
  ResolvedRuntime,
} from "../shared/types";

/** 宿主机回退命令映射（服务 key -> 命令名 + 默认参数） */
const HOST_COMMANDS: Record<ServiceName, { cmd: string; args: string[] }> = {
  n8n: { cmd: "n8n", args: ["start"] },
  openclaw: { cmd: "openclaw", args: [] },
  mcp: { cmd: "mcp-gateway", args: [] },
  hermes: { cmd: "hermes", args: [] },
};

/** 内置运行时根目录：打包后为 process.resourcesPath/runtime，开发环境为 cwd/runtime */
function getBuiltinRuntimePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime");
  }
  return path.join(process.cwd(), "runtime");
}

/** 运行时根目录（默认 userData/runtime，可被用户自定义）：用于 CDN 下载的补丁版本 */
function getUserDataRuntimePath(): string {
  return getRuntimeRoot();
}

/** 检测宿主机命令是否存在：Windows 用 where，Linux/Mac 用 which */
function findHostCommand(cmd: string): boolean {
  try {
    const tool = process.platform === "win32" ? "where" : "which";
    execSync(`${tool} ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 流式计算文件 SHA-256（兼容大文件） */
function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * 读取单个 manifest.json 文件
 * 解析失败或格式不合法返回 null
 */
function readManifestFile(filePath: string): RuntimeManifest | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RuntimeManifest;
    if (parsed && parsed.services) {
      return parsed;
    }
    return null;
  } catch {
    // 读取/解析失败
    return null;
  }
}

/**
 * 比较两个语义化版本字符串（major.minor.patch）
 * 返回值 > 0 表示 a 较新，< 0 表示 b 较新，0 表示相等
 * 非法版本按 0.0.0 处理
 */
function compareSemver(a: string, b: string): number {
  const parseSemver = (v: string): [number, number, number] => {
    if (!v || typeof v !== "string") return [0, 0, 0];
    const parts = v.split(".").map((s) => {
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? 0 : n;
    });
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [aMaj, aMin, aPatch] = parseSemver(a);
  const [bMaj, bMin, bPatch] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

/**
 * 比较两个 manifest 的服务版本，返回较新者
 *
 * - 两者都为 null → null
 * - 其中一个为 null → 返回另一个
 * - 两者都存在 → 比较 manifest.version 字段（语义化版本比较），返回较大者
 * - 版本相等时以 builtin 为准（内置清单是当前安装包权威来源，
 *   避免旧版本残留的 userData manifest（版本号相同但字段过时）遮蔽当前构建条目）
 */
export function pickNewerManifest(
  builtin: RuntimeManifest | null,
  userData: RuntimeManifest | null,
): RuntimeManifest | null {
  if (!builtin && !userData) return null;
  if (!builtin) return userData;
  if (!userData) return builtin;

  const cmp = compareSemver(builtin.version, userData.version);
  // builtin 更新（例如 electron-updater 更新后自带新 runtime）
  if (cmp > 0) return builtin;
  // 版本相等：以 builtin 为准（内置清单是当前安装包权威来源）
  if (cmp === 0) return builtin;
  // userData 严格更新（补丁优先）
  return userData;
}

/**
 * 读取 manifest.json
 * 优先级：比对 builtin 与 userData manifest 的 version 字段，返回较新者（Task 9.1）
 * 解析失败返回 null
 */
export function loadManifest(): RuntimeManifest | null {
  // 内置清单候选路径（extraResources / app.asar / 开发目录）
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath, "runtime", "manifest.json"),
    );
    candidates.push(path.join(__dirname, "..", "..", "runtime", "manifest.json"));
  } else {
    candidates.push(path.join(getBuiltinRuntimePath(), "manifest.json"));
  }
  let builtin: RuntimeManifest | null = null;
  for (const p of candidates) {
    const m = readManifestFile(p);
    if (m) {
      builtin = m;
      break;
    }
  }
  const userData = readManifestFile(
    path.join(getUserDataRuntimePath(), "manifest.json"),
  );
  return pickNewerManifest(builtin, userData);
}

/**
 * 读取内置 manifest（打包 extraResources / app.asar / 开发目录依次尝试）
 */
function readBuiltinManifest(): RuntimeManifest | null {
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath, "runtime", "manifest.json"),
    );
    candidates.push(path.join(__dirname, "..", "..", "runtime", "manifest.json"));
  } else {
    candidates.push(path.join(getBuiltinRuntimePath(), "manifest.json"));
  }
  for (const p of candidates) {
    const m = readManifestFile(p);
    if (m) return m;
  }
  // 文件缺失（打包遗漏）时使用代码内嵌兜底副本，保证下载/校验始终可用
  return EMBEDDED_MANIFEST;
}

/**
 * 计算某服务在 userData 与 builtin manifest 中的版本差
 *
 * 返回 userDataVersion 相对 builtinVersion 的语义化比较：
 * - 负数：userData 版本过旧（旧版本 App 残留，应重装该服务运行时）
 * - 0：版本一致
 * - 正数：userData 是补丁更新（保留，不强制重装）
 * 任一侧缺失该服务时返回 null（无法比较）
 */
export function getServiceVersionGap(
  name: ServiceName,
): number | null {
  const builtin = readBuiltinManifest();
  if (!builtin) return null;
  const userData = readManifestFile(
    path.join(getUserDataRuntimePath(), "manifest.json"),
  );
  if (!userData) return null;
  const b = builtin.services?.[name]?.version;
  const u = userData.services?.[name]?.version;
  if (!b || !u) return null;
  return compareSemver(u, b);
}

/**
 * 解析服务入口路径，返回启动命令组合
 *
 * 解析优先级链路（依次检查，返回首个存在路径的）：
 * 1. 内置 extraResources: resourcesPath/runtime/<service>/<entry>
 * 2. userData 补丁: userData/runtime/<service>/<entry>
 * 3. 宿主机命令回退: 通过 which/where 检测命令是否存在
 *
 * 内置/userData 来源：cmd = 入口文件绝对路径，args = []
 * 宿主机来源：cmd = 命令名，args = 服务特定参数（n8n 用 ['start']，其他为 []）
 */
export function resolve(name: ServiceName): ResolvedRuntime | null {
  const manifest = loadManifest();

  // 从 manifest 获取当前平台的入口文件名
  let entryFile: string | null = null;
  if (manifest) {
    const serviceEntry = manifest.services[name];
    if (serviceEntry) {
      entryFile = serviceEntry.entry[process.platform] ?? null;
    }
  }

  // 1. 内置 extraResources
  if (entryFile) {
    const builtinPath = path.join(getBuiltinRuntimePath(), name, entryFile);
    if (fs.existsSync(builtinPath)) {
      return {
        cmd: builtinPath,
        args: name === "n8n" ? ["start"] : [],
        env: { ...process.env },
        source: "builtin",
      };
    }

    // 2. userData 补丁
    const userDataPath = path.join(getUserDataRuntimePath(), name, entryFile);
    if (fs.existsSync(userDataPath)) {
      return {
        cmd: userDataPath,
        args: name === "n8n" ? ["start"] : [],
        env: { ...process.env },
        source: "userData",
      };
    }
  }

  // 3. 宿主机命令回退
  const hostCmd = HOST_COMMANDS[name];
  if (findHostCommand(hostCmd.cmd)) {
    return {
      cmd: hostCmd.cmd,
      args: hostCmd.args,
      env: { ...process.env },
      source: "host",
    };
  }

  return null;
}

/**
 * 校验服务运行时完整性
 *
 * 注意：manifest 中的 sha256[platform-arch] 是 CDN 压缩包（tar.gz）的哈希，
 * 不是解压后入口文件的哈希，因此不能把入口文件与 sha256 直接比对
 * （历史上该错误导致所有服务永远“校验不通过”，下载完成后仍提示失败）。
 *
 * 校验逻辑（对 builtin/userData 来源）：
 * 1. 入口文件存在（manifest entry[platform]）
 * 2. 自带 node 运行时存在（runtime/<service>/node/node.exe 或 node/node）
 * 3. 若 manifest 提供可选的 entrySha256[platform-arch]，再比对入口文件哈希
 * host 来源（宿主机命令回退）无本地文件可校验，直接视为可用。
 */
export async function verifyIntegrity(name: ServiceName): Promise<boolean> {
  const manifest = loadManifest();
  if (!manifest) return false;

  const serviceEntry = manifest.services[name];
  if (!serviceEntry) return false;

  const platformKey = `${process.platform}-${process.arch}`;

  // 解析入口文件路径（仅 builtin / userData 来源有效）
  const resolved = resolve(name);
  if (!resolved) return false;
  if (resolved.source === "host") return true;

  try {
    // 1. 入口文件存在
    if (!fs.existsSync(resolved.cmd)) return false;
    // 2. 自带 node 运行时存在
    const runtimeDir = path.dirname(resolved.cmd);
    const nodeBin = path.join(
      runtimeDir,
      "node",
      process.platform === "win32" ? "node.exe" : "node",
    );
    if (!fs.existsSync(nodeBin)) return false;
    // 3. 可选的入口文件哈希校验（manifest 未提供则跳过）
    const serviceWithEntryHash = serviceEntry as typeof serviceEntry & {
      entrySha256?: Record<string, string>;
    };
    const entrySha = serviceWithEntryHash.entrySha256?.[platformKey];
    if (entrySha) {
      const actualHash = await computeFileSha256(resolved.cmd);
      if (actualHash !== entrySha) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 校验所有服务，返回各服务完整性 */
export async function verifyAll(): Promise<Record<ServiceName, boolean>> {
  const [n8n, openclaw, mcp, hermes] = await Promise.all([
    verifyIntegrity("n8n"),
    verifyIntegrity("openclaw"),
    verifyIntegrity("mcp"),
    verifyIntegrity("hermes"),
  ]);
  return { n8n, openclaw, mcp, hermes };
}
