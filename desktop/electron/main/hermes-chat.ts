/** @file Hermes 对话主进程桥接（B1）
 *
 * 链路：渲染层 → IPC → 本服务 → 本地 Hermes Agent（127.0.0.1:8642）
 *       POST /v1/chat/completions（OpenAI 兼容 SSE 流式）。
 *
 * 鉴权：Hermes Dashboard 会话 token（hermes.sessionToken），请求头
 *       Authorization: Bearer <sessionToken>（兼容 X-Hermes-Session-Token）。
 *
 * 计费：由引擎层 llm-proxy 完成（模型映射 custom/deep-shentong），本服务
 *       不重复记账，只负责流式转发 + 工具调用/生命周期/终审事件。
 *
 * 依赖注入便于单测（node:test）：baseUrl / sessionToken / fetchImpl 均可注入。
 */
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const HERMES_CHAT_BASE_URL = 'http://127.0.0.1:8642';
export const HERMES_CHAT_MODEL = 'custom/deep-shentong';

export interface HermesChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface HermesChatToolCall {
  id: string;
  name: string;
  input: unknown;
  state?: 'running' | 'done' | 'error';
  output?: string;
}

export interface HermesChatUsage {
  input: number;
  output: number;
  total: number;
}

export type HermesChatEvent =
  | { type: 'message'; content: string }
  | { type: 'tool-call'; toolCall: HermesChatToolCall }
  | { type: 'lifecycle'; lifecycle: { phase: 'start' | 'finishing' | 'end' | 'error'; stopReason?: string; error?: string } }
  | { type: 'finalize'; content: string }
  | { type: 'done'; usage?: HermesChatUsage }
  | { type: 'error'; message: string };

export interface HermesChatSendParams {
  text: string;
  /** 用户登录 JWT（用于上下文/审计；空则拒绝） */
  token?: string;
  /** Hermes Dashboard 会话 token（缺省读取 deps.sessionToken） */
  sessionToken?: string;
  history?: HermesChatMessage[];
  modelId?: string;
  knowledgeBaseId?: number;
  sessionId?: number;
  /** 官署人格：主进程读取对应 SOUL.md 注入 system 人设 */
  profileId?: string;
  /** 直接注入的 system 人设（优先于 profileId） */
  soul?: string;
  /** 推理强度（auto/minimal/low/medium/high/xhigh；缺省 auto 不传） */
  reasoningEffort?: string;
}

export interface HermesChatDeps {
  baseUrl?: string;
  /** 返回 hermes.sessionToken（优先）；auth 失败时返回空串 */
  sessionToken?: () => string;
  /** 可注入 fetch 便于单测 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** 工具卡上下文目录（缺省不写；注入 userData/hermes-chat 供 knowledge-query / n8n-run-workflow 读取） */
  contextDir?: string;
  /** 官署人格 SOUL 解析（profileId -> SOUL.md 文本；缺省不注入） */
  readSoul?: (profileId: string) => string | null;
}

export interface HermesChatSendResult {
  aborted: boolean;
  usage?: HermesChatUsage;
}

export function isHermesAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
}

/** 解析一帧 OpenAI 兼容 SSE 数据（含 Hermes 结构化 tool 事件与 usage） */
export function parseHermesSseFrame(frame: string): {
  content?: string;
  toolCalls?: HermesChatToolCall[];
  hermesTool?: HermesChatToolCall;
  usage?: HermesChatUsage;
  done?: boolean;
} {
  if (!frame || !frame.startsWith('data:')) return {};
  const data = frame.slice(5).trim();
  if (!data || data === '[DONE]') return { done: true };
  try {
    const json = JSON.parse(data);
    const usage = json.usage
      ? {
          input: Number(json.usage.prompt_tokens ?? 0),
          output: Number(json.usage.completion_tokens ?? 0),
          total: Number(json.usage.total_tokens ?? 0),
        }
      : undefined;

    const delta = json.choices?.[0]?.delta;
    let toolCalls: HermesChatToolCall[] | undefined;
    if (Array.isArray(delta?.tool_calls)) {
      toolCalls = delta.tool_calls
        .filter((tc: { function?: { name?: string }; id?: string }) => tc?.function?.name)
        .map((tc: { id?: string; function?: { name?: string; arguments?: string } }) => ({
          id: tc.id || '',
          name: tc.function?.name || 'tool',
          input: safeJson(tc.function?.arguments),
          state: 'running',
        }));
    }

    let hermesTool: HermesChatToolCall | undefined;
    if (json.type === 'tool' || json.tool) {
      const status: HermesChatToolCall['state'] =
        json.status === 'completed' ? 'done' : json.status === 'failed' ? 'error' : 'running';
      hermesTool = {
        id: json.toolCallId || json.call_id || '',
        name: json.tool || json.label || 'tool',
        input: safeJson(json.input),
        state: status,
        ...(json.result ? { output: String(json.result) } : {}),
      };
    }

    const content =
      delta?.content ?? json.choices?.[0]?.message?.content ?? '';
    return { content, toolCalls, hermesTool, usage };
  } catch {
    return {};
  }
}

function safeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 组装 Hermes messages：可选 system 人设 + 历史 + 当前用户消息 */
export function buildHermesMessages(text: string, history?: HermesChatMessage[], soul?: string): HermesChatMessage[] {
  const messages: HermesChatMessage[] = [];
  if (soul && soul.trim()) messages.push({ role: 'system', content: soul.trim() });
  messages.push(...(history || []), { role: 'user', content: text });
  return messages;
}

/**
 * Hermes 对话主进程服务：把 /v1/chat/completions 的 SSE 流转成
 * message/tool-call/lifecycle/done/error 事件；计费归 llm-proxy。
 */
export class HermesChatService extends EventEmitter {
  private activeAbort: AbortController | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly deps: HermesChatDeps) {
    super();
    this.baseUrl = deps.baseUrl || HERMES_CHAT_BASE_URL;
    this.fetchImpl = deps.fetchImpl || fetch;
    this.timeoutMs = deps.timeoutMs ?? 120_000;
  }

  get busy(): boolean {
    return this.activeAbort !== null;
  }

  async send(
    params: HermesChatSendParams,
    onChunk: (chunk: string) => void,
    onEvent: (e: HermesChatEvent) => void,
  ): Promise<HermesChatSendResult> {
    if (!params.token) throw new Error('未登录');
    const text = params.text?.trim();
    if (!text) throw new Error('消息内容为空');

    const sessionToken = params.sessionToken || this.deps.sessionToken?.() || '';
    if (!sessionToken) {
      throw new Error('Hermes 会话未就绪（session token 缺失）');
    }
    // 工具卡上下文：auth.json / current-accounting.json / knowledge-scope.json
    this.writeContext(params);

    const abort = new AbortController();
    this.activeAbort = abort;
    this.emit('busy', true);
    onEvent({ type: 'lifecycle', lifecycle: { phase: 'start' } });

    let usage: HermesChatUsage | undefined;
    let error: Error | null = null;
    let fullText = '';
    const seenTools = new Map<string, HermesChatToolCall>();

    try {
      const model = params.modelId && params.modelId.startsWith('custom/')
        ? params.modelId
        : HERMES_CHAT_MODEL;

      const soul = params.soul || (params.profileId ? this.deps.readSoul?.(params.profileId) || '' : '');
      const messages = buildHermesMessages(text, params.history, soul);

      const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'X-Hermes-Session-Token': sessionToken,
        },
        body: JSON.stringify({ model, messages, stream: true, ...(params.reasoningEffort && params.reasoningEffort !== 'auto' ? { reasoning_effort: params.reasoningEffort } : {}) }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Hermes Agent API ${res.status}: ${errText}`);
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const reader = res.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? item_buffer(lines)[0] ?? '';
          for (const line of lines) {
            const parsed = parseHermesSseFrame(line);
            if (parsed.usage) usage = parsed.usage;
            if (parsed.content) {
              fullText += parsed.content;
              onChunk(parsed.content);
              onEvent({ type: 'message', content: parsed.content });
            }
            const tools = [...(parsed.toolCalls || []), ...(parsed.hermesTool ? [parsed.hermesTool] : [])];
            for (const tc of tools) {
              const existing = seenTools.get(tc.id || tc.name);
              const merged: HermesChatToolCall = existing
                ? { ...existing, ...tc, id: existing.id || tc.id }
                : tc;
              seenTools.set(merged.id || merged.name, merged);
              onEvent({ type: 'tool-call', toolCall: merged });
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      onEvent({ type: 'lifecycle', lifecycle: { phase: 'finishing' } });
      const reviewed = this.terminalReview(fullText, seenTools);
      const finalText = this.formatResult(reviewed, seenTools);
      if (finalText && finalText !== fullText) onEvent({ type: 'finalize', content: finalText });
      onEvent({ type: 'lifecycle', lifecycle: { phase: 'end' } });
      onEvent({ type: 'done', usage });
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      onEvent({ type: 'error', message: error.message });
      onEvent({ type: 'lifecycle', lifecycle: { phase: 'error', error: error.message } });
    } finally {
      this.activeAbort = null;
      this.emit('busy', false);
    }

    const aborted = error ? isHermesAbortError(error) : false;
    if (error && !aborted) throw error;
    return { aborted, usage };
  }

  /** 同步工具卡上下文（JWT + 会话范围），供 Hermes 技能脚本读取 */
  private writeContext(params: HermesChatSendParams): void {
    if (!this.deps.contextDir || typeof params.token !== 'string' || !params.token) return;
    try {
      const dir = this.deps.contextDir;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'auth.json'), JSON.stringify({ token: params.token }), 'utf-8');
      writeFileSync(
        join(dir, 'current-accounting.json'),
        JSON.stringify({ modelId: params.modelId ?? null }),
        'utf-8',
      );
      writeFileSync(
        join(dir, 'knowledge-scope.json'),
        JSON.stringify(params.knowledgeBaseId ? { mode: 'kb', kbId: params.knowledgeBaseId } : { mode: 'global' }),
        'utf-8',
      );
    } catch (err) {
      console.error('[hermes-chat] write context failed:', err);
    }
  }

  abort(): void {
    this.activeAbort?.abort();
  }

  /** 同步最新云端 token 到 auth.json（登录/刷新 token 时调用，供工具卡读取） */
  syncAuthToken(token: string): void {
    if (!this.deps.contextDir || !token) return;
    try {
      mkdirSync(this.deps.contextDir, { recursive: true });
      writeFileSync(join(this.deps.contextDir, 'auth.json'), JSON.stringify({ token }), 'utf-8');
    } catch (err) {
      console.error('[hermes-chat] sync auth failed:', err);
    }
  }

  /** 终审：脱敏 + 空结果兜底 + 工具调用无解释时补充说明 */
  private terminalReview(content: string, tools: Map<string, HermesChatToolCall>): string {
    let sanitized = content
      .replace(/\b\d{16,19}\b/g, '****')
      .replace(/\b\d{17}[\dXx]\b/g, '****')
    if (!sanitized.trim()) return '(结果为空，请检查输入或重试)'
    const hasToolCall = tools.size > 0
    const hasExplanation = sanitized.length > 20
    if (hasToolCall && !hasExplanation) {
      sanitized = sanitized + '\n\n*(以上结果由工具自动生成)*'
    }
    return sanitized
  }

  /** 产物来源标注：根据工具调用追加 📊 数据来源 */
  private formatResult(content: string, tools: Map<string, HermesChatToolCall>): string {
    if (tools.size === 0) return content
    const sources = [
      ...new Set(
        [...tools.values()].map((tc) => {
          switch (tc.name) {
            case 'hermes-agent':
              return 'Hermes 编排引擎'
            case 'n8n-run-workflow':
              return 'N8N 工作流'
            case 'knowledge-query':
              return '知识库'
            default:
              return tc.name
          }
        }),
      ),
    ]
    return content + '\n\n---\n📊 数据来源: ' + sources.join('、')
  }
}

/** 保留 buffer 最后一行（简化 CRLF 多行解析的兜底） */

function item_buffer(lines: string[]): string[] {
  return lines.slice(-1);
}

/** 等待本地端口就绪（ensureHermes 用） */
export async function waitForLocalPort(port: number, timeoutMs = 30_000, intervalMs = 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const { createConnection } = require('node:net');
    const socket = createConnection({ port, host });
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 1000);
  });
}
