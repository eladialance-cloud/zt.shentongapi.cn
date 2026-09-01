/** @file Hermes 原生控制平面客户端（P0）
 *
 * 面向最终用户：Hermes 由桌面端下载/安装并以 serve 模式启动（127.0.0.1:8642），
 * 本模块只依赖 baseUrl + 会话 token，不解析任何运行时文件路径。
 *
 * 鉴权：桌面端 mint HERMES_DASHBOARD_SESSION_TOKEN 并注入 Hermes 进程
 * （web_server.py _resolve_session_token 语义：desktop shell mints the token and injects it），
 * 请求携带 X-Hermes-Session-Token（兼容 Authorization: Bearer）。
 *
 * 失败一律抛 HermesApiError，由调用方（hermes-evolution 等）降级到旧实现。
 */
import { getCredential } from "./services/credential-store";

export const HERMES_BASE_URL = "http://127.0.0.1:8642";

/** credential-store 中会话 token 的 key（与 service-manager 注入 HERMES_DASHBOARD_SESSION_TOKEN 同源） */
export const HERMES_SESSION_TOKEN_CREDENTIAL = "hermes.sessionToken";

export class HermesApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HermesApiError";
    this.status = status;
  }
}

export interface HermesClientOptions {
  baseUrl?: string;
  /** 显式传入会话 token（优先）；缺省读 credential-store hermes.sessionToken */
  token?: string;
  /** 可注入 fetch 便于单测 */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  logger?: (msg: string) => void;
}

export interface HermesStatusPayload {
  version?: string;
  overall?: string;
  active_agents?: number;
  active_sessions?: number;
  [key: string]: unknown;
}

export interface LearningGraphNode {
  id: string;
  label?: string;
  kind?: string;
  date?: string | null;
  [key: string]: unknown;
}

export interface LearningGraph {
  nodes: LearningGraphNode[];
  edges: Array<Record<string, unknown>>;
  clusters: Array<Record<string, unknown>>;
  memory: Array<Record<string, unknown>>;
  stats?: Record<string, unknown>;
}

export interface MemoryProvider {
  name: string;
  description?: string;
  available?: boolean;
  configured?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface CuratorState {
  enabled?: boolean;
  paused?: boolean;
  interval_hours?: number;
  last_run_at?: string | null;
  min_idle_hours?: number;
  stale_after_days?: number;
  archive_after_days?: number;
  [key: string]: unknown;
}

export interface SystemStatsPayload {
  hermes_version?: string;
  cpu_percent?: number;
  memory?: Record<string, unknown>;
  disk?: Record<string, unknown>;
  process?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HermesSkillInfo {
  name: string;
  description?: string;
  category?: string;
  enabled?: boolean;
  usage?: number;
  provenance?: string;
  version?: string;
  source?: string;
  identifier?: string;
  trust_level?: string;
  repo?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface ModelOptionsPayload {
  providers?: Array<Record<string, unknown>>;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface HermesSkillsHubSearchPayload {
  results: HermesSkillInfo[];
  source_counts?: Record<string, number>;
  timed_out?: string[];
  installed?: Record<string, unknown>;
}

export interface HermesSkillOpResult {
  ok: boolean;
  pid?: number;
  name?: string;
  error?: string;
}

export interface HermesModelAssignment {
  scope: "main" | "auxiliary";
  provider: string;
  model: string;
  task?: string;
  base_url?: string;
  api_key?: string;
  confirm_expensive_model?: boolean;
}

export interface HermesSetModelResult {
  ok: boolean;
  scope?: string;
  provider?: string;
  model?: string;
  confirm_required?: boolean;
  confirm_message?: string;
  error?: string;
  [key: string]: unknown;
}

interface RequestInitLike {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Hermes 原生 API 客户端（127.0.0.1:8642）。
 * 零路径依赖：baseUrl 固定、token 来自凭据存储；全部请求带超时。
 */
export class HermesClient {
  private readonly opts: HermesClientOptions;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly logger?: (msg: string) => void;

  constructor(opts: HermesClientOptions = {}) {
    this.opts = opts;
    this.baseUrl = opts.baseUrl ?? HERMES_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.logger = opts.logger;
  }

  /** 会话 token 惰性解析：显式传入优先，否则每次请求读 credential-store（首启时凭据可能尚未生成） */
  private resolveToken(): string {
    return this.opts.token ?? getCredential(HERMES_SESSION_TOKEN_CREDENTIAL) ?? "";
  }

  private async request<T>(path: string, init: RequestInitLike = {}): Promise<T> {
    const method = init.method ?? "GET";
    const timeout = init.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = this.resolveToken();
      if (token) headers["X-Hermes-Session-Token"] = token;
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new HermesApiError(
          `Hermes ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`,
          res.status,
        );
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (err) {
      if (err instanceof HermesApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.(`[hermes-client] ${method} ${path} 失败: ${msg}`);
      throw new HermesApiError(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 服务是否就绪（/api/status 为公开端点，无需 token；401 视为已监听但未授权） */
  async isAlive(): Promise<boolean> {
    try {
      const st = await this.status();
      return st !== null;
    } catch {
      return false;
    }
  }

  /** 服务状态（版本/组件健康；失败返回 null，不抛错） */
  async status(): Promise<HermesStatusPayload | null> {
    try {
      return await this.request<HermesStatusPayload>("/api/status");
    } catch {
      return null;
    }
  }

  /** 进化图谱（替代 journey --json）：nodes/edges/clusters/memory/stats */
  async getLearningGraph(): Promise<LearningGraph> {
    const data = await this.request<Partial<LearningGraph>>("/api/learning/graph");
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      clusters: Array.isArray(data.clusters) ? data.clusters : [],
      memory: Array.isArray(data.memory) ? data.memory : [],
      stats: data.stats ?? {},
    };
  }

  /** 改写进化节点（SKILL.md 或记忆 chunk；PUT /api/learning/node，body={id, content}） */
  async putLearningNode(id: string, content: string): Promise<{ ok: boolean }> {
    const res = await this.request<{ ok?: boolean }>("/api/learning/node", {
      method: "PUT",
      body: { id, content },
    });
    return { ok: res?.ok !== false };
  }

  /** 记忆提供商状态（GET /api/memory；注意：MEMORY.md 内容仍走本地文件读写，无原生 API） */
  async getMemoryProviders(): Promise<MemoryProvider[]> {
    const data = await this.request<{ providers?: MemoryProvider[] }>("/api/memory");
    return Array.isArray(data.providers) ? data.providers : [];
  }

  /** 策展状态（P1） */
  async getCurator(): Promise<CuratorState> {
    return this.request<CuratorState>("/api/curator");
  }

  /** 暂停/恢复策展（P1） */
  async setCuratorPaused(paused: boolean): Promise<{ ok: boolean }> {
    const res = await this.request<{ ok?: boolean }>("/api/curator/paused", {
      method: "PUT",
      body: { paused },
    });
    return { ok: res?.ok !== false };
  }

  /** 立即运行策展（P1，后台执行） */
  async runCurator(): Promise<{ ok: boolean; pid?: number }> {
    return this.request<{ ok: boolean; pid?: number }>("/api/curator/run", {
      method: "POST",
    });
  }

  /** 系统统计（P1） */
  async getSystemStats(): Promise<SystemStatsPayload> {
    return this.request<SystemStatsPayload>("/api/system/stats");
  }

  /** 技能列表（P2） */
  async listSkills(): Promise<HermesSkillInfo[]> {
    const data = await this.request<HermesSkillInfo[] | { skills?: HermesSkillInfo[] }>("/api/skills");
    return Array.isArray(data) ? data : Array.isArray(data.skills) ? data.skills : [];
  }

  /** 模型选项（P2） */
  async getModelOptions(): Promise<ModelOptionsPayload> {
    return this.request<ModelOptionsPayload>("/api/model/options");
  }

  /** 技能市场搜索（P2：GET /api/skills/hub/search） */
  async searchSkills(query: string): Promise<HermesSkillsHubSearchPayload> {
    const q = (query || "").trim();
    if (!q) return { results: [] };
    return this.request<HermesSkillsHubSearchPayload>("/api/skills/hub/search?q=" + encodeURIComponent(q));
  }

  /** 安装技能（P2：POST /api/skills/hub/install，后台异步 spawn CLI 安装） */
  async installSkill(identifier: string): Promise<HermesSkillOpResult> {
    return this.request<HermesSkillOpResult>("/api/skills/hub/install", {
      method: "POST",
      body: { identifier },
    });
  }

  /** 卸载技能（P2：POST /api/skills/hub/uninstall，后台异步） */
  async uninstallSkill(name: string): Promise<HermesSkillOpResult> {
    return this.request<HermesSkillOpResult>("/api/skills/hub/uninstall", {
      method: "POST",
      body: { name },
    });
  }

  /** 更新全部技能（P2：POST /api/skills/hub/update，后台异步；原生不支持单技能更新） */
  async updateSkills(profile?: string): Promise<HermesSkillOpResult> {
    return this.request<HermesSkillOpResult>("/api/skills/hub/update", {
      method: "POST",
      body: profile ? { profile } : {},
    });
  }

  /** 启用/停用技能（P2：PUT /api/skills/toggle） */
  async toggleSkill(name: string, enabled: boolean): Promise<{ ok: boolean }> {
    const res = await this.request<{ ok?: boolean }>("/api/skills/toggle", {
      method: "PUT",
      body: { name, enabled },
    });
    return { ok: res?.ok !== false };
  }

  /** 设置模型分配（P2：POST /api/model/set，注意是 POST 不是方案初稿的 PUT；昂贵模型返回 confirm_required 需二次确认） */
  async setModel(assignment: HermesModelAssignment): Promise<HermesSetModelResult> {
    try {
      return await this.request<HermesSetModelResult>("/api/model/set", {
        method: "POST",
        body: {
          scope: assignment.scope,
          provider: assignment.provider,
          model: assignment.model,
          task: assignment.task ?? "",
          base_url: assignment.base_url ?? "",
          api_key: assignment.api_key ?? "",
          confirm_expensive_model: assignment.confirm_expensive_model ?? false,
        },
      });
    } catch (err) {
      if (err instanceof HermesApiError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }
}
