// Hermes 工具集启用/停用（对齐上游 src/main/tools.ts：读/写 config.yaml 的 platform_toolsets.cli）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { load } from "js-yaml";

export interface HermesToolsetInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

/** 工具集定义（语义对齐上游 TOOLSET_DEFS，label/description 为中文） */
const TOOLSET_DEFS: Array<{ key: string; label: string; description: string }> = [
  { key: "web", label: "联网搜索", description: "让 Agent 联网搜索资料" },
  { key: "x_search", label: "社交搜索", description: "X/Twitter 等平台搜索" },
  { key: "browser", label: "浏览器", description: "打开并浏览网页" },
  { key: "terminal", label: "终端", description: "执行 shell 命令" },
  { key: "file", label: "文件", description: "读取/写入文件" },
  { key: "code_execution", label: "代码执行", description: "编写并运行代码" },
  { key: "computer_use", label: "电脑操控", description: "操纵桌面/应用" },
  { key: "vision", label: "视觉", description: "看图/识别图片" },
  { key: "image_gen", label: "图片生成", description: "文生图" },
  { key: "video_gen", label: "视频生成", description: "文生视频" },
  { key: "tts", label: "语音合成", description: "文本转语音" },
  { key: "skills", label: "技能", description: "调用已安装技能" },
  { key: "memory", label: "记忆", description: "使用长期记忆" },
  { key: "session_search", label: "会话检索", description: "搜索历史会话" },
  { key: "clarify", label: "澄清", description: "向用户发起澄清提问" },
  { key: "delegation", label: "委派", description: "委派给子代理" },
  { key: "cronjob", label: "定时任务", description: "创建周期任务" },
  { key: "moa", label: "多智能体", description: "多智能体协作" },
  { key: "todo", label: "待办", description: "维护待办清单" },
  { key: "toolbox", label: "工具箱", description: "调用统一工具箱能力（飞书/MySQL 等）" },
  { key: "wx", label: "微信", description: "调用微信域桥能力（发消息/好友/朋友圈等，默认关闭）" },
  { key: "douyin", label: "抖音", description: "调用抖音采集/转写能力（采集/转写/入库，发布私信默认关闭）" },
]

export function hermesHomeDir(): string {
  return join(app.getPath("userData"), "hermes-home");
}

export function hermesConfigPath(): string {
  return join(hermesHomeDir(), "config.yaml");
}

/** 解析 config.yaml 中 platform_toolsets 的某平台启用列表（行级解析，无 yaml 依赖） */
export function parsePlatformCliToolsets(content: string, platform = "cli"): Set<string> {
  const result = new Set<string>();
  const lines = content.split(/\r?\n/);
  let inPlatform = false;
  let current: string | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/\s*platform_toolsets\s*:/.test(line)) {
      inPlatform = true;
      current = null;
      continue;
    }
    if (inPlatform && /^\S/.test(line) && line !== "") { // 下一个顶层段
      inPlatform = false;
      current = null;
      continue;
    }
    if (!inPlatform) continue;
    const m = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(\[\])?\s*(?:#.*)?$/);
    if (m) {
      current = m[2] ? null : m[1];
      continue;
    }
    if (current === platform) {
      const item = line.match(/^\s+-\s+["']?([A-Za-z0-9_-]+)["']?/);
      if (item) result.add(item[1]);
    }
  }
  return result;
}

/** 工具集是否被显式配置（segment 存在且含非占位 key）。无配置段视为全部启用（对齐上游默认）。 */
export function hasExplicitCliToolsets(content: string): boolean {
  const set = parsePlatformCliToolsets(content);
  if (set.size === 0) return false;
  for (const k of set) if (k !== "no_mcp" && k !== "all") return true;
  return false;
}

/** 纯逻辑：由启用集合构建工具集条目列表（enabledKeys 为 null 时全部启用） */
export function buildToolsetInfos(enabledKeys: Set<string> | null): HermesToolsetInfo[] {
  return TOOLSET_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    enabled: enabledKeys ? enabledKeys.has(def.key) : true,
  }));
}

/** 读取工具集列表 */
export function getHermesToolsets(): HermesToolsetInfo[] {
  const p = hermesConfigPath();
  try {
    const content = existsSync(p) ? readFileSync(p, "utf-8") : "";
    if (!content.trim() || !hasExplicitCliToolsets(content)) return buildToolsetInfos(null);
    return buildToolsetInfos(parsePlatformCliToolsets(content));
  } catch {
    return buildToolsetInfos(null);
  }
}

/** 只读：读取 config.yaml 的 mcp_servers（对齐上游 Tools 面板的 MCP 列表，深瞳侧不提供假增删改） */
export function getHermesMcpServers(): HermesMcpServerInfo[] {
  const p = hermesConfigPath();
  try {
    if (!existsSync(p)) return [];
    const raw = readFileSync(p, "utf-8");
    const cfg = load(raw) as Record<string, unknown> | null;
    const servers = cfg?.mcp_servers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
    return Object.entries(servers as Record<string, unknown>).map(([name, rawCfg]) => {
      const c = (rawCfg && typeof rawCfg === "object" && !Array.isArray(rawCfg) ? rawCfg : {}) as Record<string, unknown>;
      const url = typeof c.url === "string" ? c.url : undefined;
      const command = typeof c.command === "string" ? c.command : undefined;
      const args = Array.isArray(c.args) ? c.args.map((a) => String(a)) : [];
      const envRaw = c.env && typeof c.env === "object" && !Array.isArray(c.env) ? (c.env as Record<string, unknown>) : {};
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(envRaw)) env[k] = String(v);
      const auth = typeof c.auth === "string" ? c.auth : undefined;
      const type: HermesMcpServerInfo["type"] = url ? "http" : command ? "stdio" : "unknown";
      const enabled = c.enabled !== false;
      const detail = url || [command, ...args].filter(Boolean).join(" ");
      return { name, type, transport: type, enabled, detail, url, command, args, env, auth };
    });
  } catch {
    return [];
  }
}

export interface HermesMcpServerInfo {
  name: string;
  type: "http" | "stdio" | "unknown";
  transport: "http" | "stdio" | "unknown";
  enabled: boolean;
  detail: string;
  url?: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  auth?: string;
}

/** 写回 config.yaml 的 platform_toolsets.<platform> 段（保持其它段不变） */
export function applyPlatformToolsetEnabled(content: string, platform: string, key: string, enabled: boolean): string {
  const set = new Set(parsePlatformCliToolsets(content, platform));
  // 无平台段时默认全部启用，写入时只保留启用的工具集？此处采用上游语义：显式列出启用项。
  if (enabled) set.add(key);
  else set.delete(key);
  const items = Array.from(set).sort();
  const newSection = "  " + platform + ":" + (items.length ? "\n" + items.map((i) => "      - " + i).join("\n") : "");
  const header = new RegExp("^\\s+" + platform + "\\s*:", "m");
  if (/platform_toolsets\s*:/.test(content)) {
    const lines = content.split(/\r?\n/);
    const out: string[] = [];
    let inBlock = false;
    let inTarget = false;
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trimEnd();
      if (/^\s*platform_toolsets\s*:/.test(t)) { inBlock = true; inTarget = false; out.push(line); continue; }
      if (inBlock && /^\S/.test(t) && t !== "") { inBlock = false; if (!inserted) { out.push(newSection); inserted = true; } }
      if (inBlock && header.test(t)) { inTarget = true; out.push(newSection); inserted = true; continue; }
      if (inTarget) { if (/^\s+-\s/.test(t)) continue; inTarget = false; }
      out.push(line);
    }
    if (inBlock && !inserted) out.push(newSection);
    return out.join("\n");
  }
  const trimmed = content.trimEnd();
  return (trimmed ? trimmed + "\n\n" : "") + "platform_toolsets:\n" + newSection + "\n";
}

/** 设置某工具集启用（写回 config.yaml；Hermes 重启后生效） */
export function setHermesToolsetEnabled(key: string, enabled: boolean): { ok: boolean; error?: string; toolsets?: HermesToolsetInfo[] } {
  const name = key.trim();
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, error: "非法工具集 key" };
  const p = hermesConfigPath();
  try {
    const content = existsSync(p) ? readFileSync(p, "utf-8") : "";
    const next = applyPlatformToolsetEnabled(content, "cli", name, enabled);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, next, "utf-8");
    return { ok: true, toolsets: getHermesToolsets() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
