// Hermes 记忆读写桥：MEMORY.md / USER.md 的本地读写（§ 分隔，字符上限，幂等去重）
// 语义对齐 hermes-agent memory_tool：add / replace / remove / list
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export type MemoryTarget = "memory" | "profile";

export interface MemoryEntry {
  target: MemoryTarget;
  text: string;
}

export interface MemoryOpResult {
  ok: boolean;
  error?: string;
  entries?: MemoryEntry[];
  /** 超出字符上限时被逐出的最旧条目 */
  evicted?: string[];
}

export const MEMORY_FILE = "MEMORY.md";
export const USER_FILE = "USER.md";
/** MEMORY.md（代理笔记）字符上限 */
export const MEMORY_CHAR_LIMIT = 2200;
/** USER.md（用户画像）字符上限 */
export const USER_CHAR_LIMIT = 1375;

export function isMemoryTarget(v: unknown): v is MemoryTarget {
  return v === "memory" || v === "profile";
}

export function memoryFileName(target: MemoryTarget): string {
  return target === "memory" ? MEMORY_FILE : USER_FILE;
}

export function memoryCharLimit(target: MemoryTarget): number {
  return target === "memory" ? MEMORY_CHAR_LIMIT : USER_CHAR_LIMIT;
}

/** 按 § 分隔为条目（与 hermes-evolution.parseMemoryCards 同款，空块过滤） */
export function splitMemory(content: string): string[] {
  return (content || "")
    .split(/§/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/** 归一化条目文本（去 § 与首尾空白，用于去重/定位） */
export function normalizeEntry(text: string): string {
  return String(text || "").replace(/§/g, " ").trim();
}

export function getMemoryDir(): string {
  return join(app.getPath("userData"), "hermes-home");
}

export function memoryFilePath(target: MemoryTarget): string {
  return join(getMemoryDir(), memoryFileName(target));
}

function readRaw(p: string): string {
  try {
    return existsSync(p) ? readFileSync(p, "utf-8") : "";
  } catch {
    return "";
  }
}

function writeRaw(p: string, content: string): void {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, content, "utf-8");
}

/** 纯逻辑：追加条目（幂等去重 + 超限逐出最旧），供单测直接调用 */
export function applyAddEntry(
  rawContent: string,
  text: string,
  limit: number,
): { content: string; entries: string[]; duplicate: boolean; evicted: string[] } {
  const clean = normalizeEntry(text);
  const entries = splitMemory(rawContent);
  if (!clean) return { content: rawContent, entries, duplicate: false, evicted: [] };
  const normalized = entries.map(normalizeEntry);
  if (normalized.includes(clean)) {
    return { content: rawContent, entries, duplicate: true, evicted: [] };
  }
  const next = [...entries, clean];
  const evicted: string[] = [];
  while (next.join(" § ").length > limit && next.length > 1) {
    const dropped = next.shift();
    if (dropped !== undefined) evicted.push(dropped);
  }
  return { content: next.join(" § "), entries: next, duplicate: false, evicted };
}

/** 纯逻辑：按文本移除条目（未命中不报错） */
export function applyRemoveEntry(
  rawContent: string,
  text: string,
): { content: string; entries: string[] } {
  const match = normalizeEntry(text);
  if (!match) return { content: rawContent, entries: splitMemory(rawContent) };
  const entries = splitMemory(rawContent).filter((e) => normalizeEntry(e) !== match);
  return { content: entries.join(" § "), entries };
}

/** 纯逻辑：替换命中条目（按归一化文本定位；未命中则追加为新条目） */
export function applyReplaceEntry(
  rawContent: string,
  matchText: string,
  text: string,
  limit: number,
): { content: string; entries: string[]; evicted: string[] } {
  const clean = normalizeEntry(text);
  const match = normalizeEntry(matchText);
  const entries = splitMemory(rawContent);
  if (!clean) return { content: rawContent, entries, evicted: [] };
  const idx = entries.findIndex((e) => normalizeEntry(e) === match);
  const next = idx >= 0 ? [...entries] : [...entries, clean];
  if (idx >= 0) next[idx] = clean;
  const evicted: string[] = [];
  while (next.join(" § ").length > limit && next.length > 1) {
    const dropped = next.shift();
    if (dropped !== undefined) evicted.push(dropped);
  }
  return { content: next.join(" § "), entries: next, evicted };
}

/** 读取条目列表 */
export function listMemory(target: MemoryTarget): MemoryEntry[] {
  return splitMemory(readRaw(memoryFilePath(target))).map((text) => ({ target, text }));
}

/** 追加条目（幂等去重；超上限逐出最旧） */
export function addMemoryEntry(target: MemoryTarget, text: string): MemoryOpResult {
  const clean = normalizeEntry(text);
  if (!clean) return { ok: false, error: "内容为空" };
  const p = memoryFilePath(target);
  const raw = readRaw(p);
  const r = applyAddEntry(raw, clean, memoryCharLimit(target));
  if (r.duplicate) {
    return { ok: true, entries: r.entries.map((t) => ({ target, text: t })) };
  }
  writeRaw(p, r.content);
  return {
    ok: true,
    entries: r.entries.map((t) => ({ target, text: t })),
    evicted: r.evicted.length > 0 ? r.evicted : undefined,
  };
}

/** 替换命中条目（未命中则追加） */
export function replaceMemoryEntry(
  target: MemoryTarget,
  matchText: string,
  text: string,
): MemoryOpResult {
  const clean = normalizeEntry(text);
  if (!clean) return { ok: false, error: "内容为空" };
  const p = memoryFilePath(target);
  const raw = readRaw(p);
  const r = applyReplaceEntry(raw, matchText, clean, memoryCharLimit(target));
  writeRaw(p, r.content);
  return {
    ok: true,
    entries: r.entries.map((t) => ({ target, text: t })),
    evicted: r.evicted.length > 0 ? r.evicted : undefined,
  };
}

/** 移除条目 */
export function removeMemoryEntry(target: MemoryTarget, text: string): MemoryOpResult {
  const p = memoryFilePath(target);
  const raw = readRaw(p);
  const r = applyRemoveEntry(raw, text);
  writeRaw(p, r.content);
  return { ok: true, entries: r.entries.map((t) => ({ target, text: t })) };
}

/** IPC 入口：add/replace/remove/list（target 白名单校验） */
export function handleMemoryOp(
  op: "add" | "replace" | "remove" | "list",
  target: unknown,
  text?: unknown,
  match?: unknown,
): MemoryOpResult {
  if (!isMemoryTarget(target)) return { ok: false, error: "target 必须是 memory 或 profile" };
  if (op === "list") {
    const entries = listMemory(target);
    return { ok: true, entries };
  }
  const cleanText = typeof text === "string" ? text : "";
  if (op === "add") return addMemoryEntry(target, cleanText);
  if (op === "remove") return removeMemoryEntry(target, cleanText);
  return replaceMemoryEntry(target, typeof match === "string" ? match : "", cleanText);
}