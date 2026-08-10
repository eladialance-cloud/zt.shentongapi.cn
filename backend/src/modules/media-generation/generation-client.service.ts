import { Injectable, Logger, BadRequestException } from '@nestjs/common';

/** 生成适配模板（存于 model_providers.config.generation） */
export interface GenerationAdapterConfig {
  imagesPath?: string;
  videosPath?: string;
  taskPath?: string;
  extraHeaders?: Record<string, string>;
  async?: boolean;
  pollInterval?: number;
  requestTemplate?: Record<string, unknown>;
  taskIdPath?: string;
  statusPath?: string;
  successValues?: string[];
  failedValues?: string[];
  resultUrlPath?: string;
  resultB64Path?: string;
  timeoutMs?: number;
}

/**
 * 上游文生图/文生视频客户端
 * - 图片：OpenAI 兼容 /images/generations（同步返回 b64_json 或 url）
 * - 视频：异步任务制（提交 -> 拿 taskId -> 轮询 -> 拿视频 url）
 * - 请求/响应字段映射全部由供应商 config.generation 模板决定，不硬编码厂商
 */
@Injectable()
export class GenerationClientService {
  private readonly logger = new Logger(GenerationClientService.name);

  /** 点号路径取值，支持数组下标：data.task_result.videos[0].url */
  getByPath(obj: unknown, path?: string): unknown {
    if (!path || obj == null) return undefined;
    let cur: any = obj;
    for (const part of path.split('.')) {
      if (cur == null) return undefined;
      const m = part.match(/^(\w+)\[(\d+)\]$/);
      if (m) {
        cur = cur?.[m[1]]?.[Number(m[2])];
      } else {
        cur = cur?.[part];
      }
    }
    return cur;
  }

  /** 请求体占位符替换：{upstreamModelId} {prompt} {size} {resolution} {duration} {fps} */
  buildBody(template: Record<string, unknown> | undefined, vars: Record<string, string | number>): Record<string, unknown> {
    if (!template) return {};
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') {
        const full = v.match(/^\{(\w+)\}$/);
        if (full && full[1] in vars) return vars[full[1]];
        let out = v;
        for (const [k, val] of Object.entries(vars)) {
          out = out.split(`{${k}}`).join(String(val));
        }
        return out;
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const o: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
        return o;
      }
      return v;
    };
    return walk(template) as Record<string, unknown>;
  }

  private buildUrl(endpoint: string, path?: string): string {
    const base = endpoint.replace(/\/+$/, '');
    if (!path) return base;
    return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
  }

  private async postJson(url: string, apiKey: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 60000): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
    if (!res.ok) {
      throw new BadRequestException(`上游接口错误(${res.status}): ${text.slice(0, 300)}`);
    }
    return json;
  }

  private async getJson(url: string, apiKey: string, headers: Record<string, string> = {}, timeoutMs = 30000): Promise<any> {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok) throw new BadRequestException(`上游任务查询错误(${res.status}): ${text.slice(0, 300)}`);
    return json;
  }

  /** 文生图（同步） */
  async generateImage(cfg: {
    endpoint: string;
    apiKey: string;
    adapter: GenerationAdapterConfig;
    model: string;
    prompt: string;
    size?: string;
  }): Promise<{ b64?: string; url?: string }> {
    const { endpoint, apiKey, adapter } = cfg;
    let body = this.buildBody(adapter.requestTemplate, {
      upstreamModelId: cfg.model,
      prompt: cfg.prompt,
      size: cfg.size ?? '',
    });
    if (Object.keys(body).length === 0) {
      body = { model: cfg.model, prompt: cfg.prompt, response_format: 'b64_json' };
      if (cfg.size) body.size = cfg.size;
    }
    const url = this.buildUrl(endpoint, adapter.imagesPath || '/images/generations');
    const json = await this.postJson(url, apiKey, body, adapter.extraHeaders, adapter.timeoutMs || 120000);
    const b64 = this.getByPath(json, adapter.resultB64Path || 'data[0].b64_json') as string | undefined;
    const u = this.getByPath(json, adapter.resultUrlPath || 'data[0].url') as string | undefined;
    if (!b64 && !u) {
      this.logger.warn(`文生图上游未返回数据: ${JSON.stringify(json).slice(0, 300)}`);
      throw new BadRequestException('上游未返回图片数据（无 b64_json / url）');
    }
    return { b64, url: u };
  }

  /** 提交文生视频任务（异步），返回 taskId */
  async submitVideo(cfg: {
    endpoint: string;
    apiKey: string;
    adapter: GenerationAdapterConfig;
    model: string;
    prompt: string;
    resolution?: string;
    duration?: number;
    fps?: number;
  }): Promise<{ taskId: string }> {
    const { endpoint, apiKey, adapter } = cfg;
    let body = this.buildBody(adapter.requestTemplate, {
      upstreamModelId: cfg.model,
      prompt: cfg.prompt,
      resolution: cfg.resolution ?? '',
      duration: cfg.duration ?? 5,
      fps: cfg.fps ?? 24,
    });
    if (Object.keys(body).length === 0) {
      body = { model: cfg.model, prompt: cfg.prompt };
      if (cfg.resolution) body.resolution = cfg.resolution;
      if (cfg.duration) body.duration = cfg.duration;
    }
    const url = this.buildUrl(endpoint, adapter.videosPath || '/videos/generations');
    const json = await this.postJson(url, apiKey, body, adapter.extraHeaders, adapter.timeoutMs || 60000);
    const taskId = this.getByPath(json, adapter.taskIdPath || 'data.task_id') as string;
    if (!taskId) {
      this.logger.warn(`文生视频提交未返回 taskId: ${JSON.stringify(json).slice(0, 300)}`);
      throw new BadRequestException('上游未返回任务 ID');
    }
    return { taskId };
  }

  /** 查询视频任务状态 */
  async pollVideoTask(cfg: {
    endpoint: string;
    apiKey: string;
    adapter: GenerationAdapterConfig;
    taskId: string;
  }): Promise<{ status: 'processing' | 'done' | 'failed'; url?: string; message?: string }> {
    const { endpoint, apiKey, adapter } = cfg;
    const taskPath = (adapter.taskPath || '/videos/generations/{id}')
      .replace('{id}', encodeURIComponent(cfg.taskId))
      .replace('{task_id}', encodeURIComponent(cfg.taskId));
    const url = this.buildUrl(endpoint, taskPath);
    const json = await this.getJson(url, apiKey, adapter.extraHeaders);
    const status = this.getByPath(json, adapter.statusPath || 'data.task_status') as string;
    const successValues = adapter.successValues || ['succeed'];
    const failedValues = adapter.failedValues || ['failed'];
    if (successValues.includes(status)) {
      const u = this.getByPath(json, adapter.resultUrlPath || 'data.task_result.videos[0].url') as string;
      return { status: 'done', url: u };
    }
    if (failedValues.includes(status)) {
      return { status: 'failed', message: `上游任务失败(status=${status})` };
    }
    return { status: 'processing' };
  }
}
