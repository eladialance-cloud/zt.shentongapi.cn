// Hermes 第三方记忆 Provider 配置管理：active + env 持久化到 userData/hermes-chat/memory-provider.json
// 纯函数（normalize/apply）与文件读写分离，便于 node:test / jest 直接单测。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { HermesMemoryProviderConfig } from "../shared/types";

export const MEMORY_PROVIDER_FILE = "memory-provider.json";

export function memoryProviderConfigPath(): string {
  return join(app.getPath("userData"), "hermes-chat", MEMORY_PROVIDER_FILE);
}

/** 空配置（active 为空 = 未激活；providers 为空） */
export function emptyMemoryProviderConfig(): HermesMemoryProviderConfig {
  return { active: "", providers: {} };
}

/** 纯逻辑：把任意 JSON 值归一化为合法配置（异常字段忽略，不抛错） */
export function normalizeProviderConfig(raw: unknown): HermesMemoryProviderConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Partial<HermesMemoryProviderConfig>;
  const active = typeof cfg.active === "string" ? cfg.active.trim() : "";
  const providers: Record<string, Record<string, string>> = {};
  if (cfg.providers && typeof cfg.providers === "object") {
    for (const [name, envObj] of Object.entries(cfg.providers as Record<string, unknown>)) {
      if (!envObj || typeof envObj !== "object") continue;
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(envObj as Record<string, unknown>)) {
        if (!key.trim()) continue;
        env[key] = typeof value === "string" ? value : value == null ? "" : String(value);
      }
      if (Object.keys(env).length > 0) providers[name] = env;
    }
  }
  return { active, providers };
}

/** 纯逻辑：设置 active provider（name 为空字符串表示停用） */
export function applyActiveProvider(cfg: HermesMemoryProviderConfig, name: string): HermesMemoryProviderConfig {
  return { ...normalizeProviderConfig(cfg), active: name ? name.trim() : "" };
}

/** 纯逻辑：写入某 provider 的 env 键值（value 为空则移除该键） */
export function applyProviderEnv(
  cfg: HermesMemoryProviderConfig,
  name: string,
  key: string,
  value: string,
): HermesMemoryProviderConfig {
  const base = normalizeProviderConfig(cfg);
  const provider = name.trim();
  const envKey = key.trim();
  if (!provider || !envKey) return base;
  const providers = { ...base.providers };
  const env = { ...(providers[provider] || {}) };
  const val = typeof value === "string" ? value : "";
  if (val) env[envKey] = val;
  else delete env[envKey];
  if (Object.keys(env).length === 0) delete providers[provider];
  else providers[provider] = env;
  return { ...base, providers };
}

/** 读取配置（文件缺失或损坏时返回空配置） */
export function readMemoryProviderConfig(): HermesMemoryProviderConfig {
  try {
    const p = memoryProviderConfigPath();
    if (!existsSync(p)) return emptyMemoryProviderConfig();
    return normalizeProviderConfig(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return emptyMemoryProviderConfig();
  }
}

/** 写入配置 */
export function writeMemoryProviderConfig(cfg: HermesMemoryProviderConfig): void {
  const p = memoryProviderConfigPath();
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(normalizeProviderConfig(cfg), null, 2), "utf8");
}

/** IPC 入口：get / set-active / set-env */
export function handleMemoryProviderOp(
  op: "get" | "set-active" | "set-env",
  name?: unknown,
  key?: unknown,
  value?: unknown,
): HermesMemoryProviderConfig {
  if (op === "get") return readMemoryProviderConfig();
  if (op === "set-active") {
    const cfg = applyActiveProvider(readMemoryProviderConfig(), typeof name === "string" ? name : "");
    writeMemoryProviderConfig(cfg);
    return cfg;
  }
  const cfg = applyProviderEnv(
    readMemoryProviderConfig(),
    typeof name === "string" ? name : "",
    typeof key === "string" ? key : "",
    typeof value === "string" ? value : "",
  );
  writeMemoryProviderConfig(cfg);
  return cfg;
}
