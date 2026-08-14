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
  /** 图片请求形状：json=JSON 内嵌图（占位符）/ multipart=multipart 文件字段（默认 json）*/
  imagesStyle?: 'json' | 'multipart';
  /** multipart 图片字段名（位置对应 inputImages；默认第 1 张 image，第 n 张 image_n）*/
  imageFields?: string[];
  /** multipart 文本字段名（默认 prompt / model / size）*/
  promptField?: string;
  modelField?: string;
  sizeField?: string;
  /** multipart 静态额外字段（如 negative_prompt）*/
  multipartFields?: Record<string, unknown>;
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

  /** 输入图解析为 Buffer：data URI 直接解码 / http(s) 下载（URL 已由 service 层 SSRF 校验）*/
  private async resolveInputImageBuffer(img: string): Promise<Buffer> {
    if (/^data:image\//i.test(img)) {
      const comma = img.indexOf(',');
      if (comma < 0) throw new BadRequestException('data URI 格式无效');
      return Buffer.from(img.slice(comma + 1), 'base64');
    }
    const res = await fetch(img, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new BadRequestException(`输入图片下载失败(${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) throw new BadRequestException('输入图片超过 20MB 限制');
    return buf;
  }

  private mimeOfInputImage(img: string): string {
    const m = img.match(/^data:(image\/[a-z0-9.+-]+)/i);
    return m ? m[1].toLowerCase() : 'image/png';
  }

  /** 按适配配置构造图片请求：JSON 内嵌（占位符）或 multipart（文件字段），返回 { url, headers, body } */
  async buildImageRequest(cfg: {
    endpoint: string;
    adapter: GenerationAdapterConfig;
    model: string;
    prompt: string;
    size?: string;
    inputImages?: string[];
  }): Promise<{ url: string; headers: Record<string, string>; body: string | FormData }> {
    const { endpoint, adapter, model, prompt, size, inputImages = [] } = cfg;
    const url = this.buildUrl(endpoint, adapter.imagesPath || '/images/generations');
    const wantMultipart =
      adapter.imagesStyle === 'multipart' ||
      (inputImages.length > 0 && !adapter.requestTemplate && !adapter.imagesStyle);
    if (wantMultipart) {
      const form = new FormData();
      form.append(adapter.modelField || 'model', model);
      form.append(adapter.promptField || 'prompt', prompt);
      if (size) form.append(adapter.sizeField || 'size', size);
      for (const [k, v] of Object.entries(adapter.multipartFields ?? {})) {
        form.append(k, String(v));
      }
      const fields = adapter.imageFields?.length ? adapter.imageFields : [];
      for (let i = 0; i < inputImages.length; i++) {
        const fieldName = fields[i] || (i === 0 ? 'image' : `image_${i + 1}`);
        const buf = await this.resolveInputImageBuffer(inputImages[i]);
        const mime = this.mimeOfInputImage(inputImages[i]);
        form.append(fieldName, new Blob([new Uint8Array(buf)], { type: mime }), `input-${i + 1}`);
      }
      return { url, headers: {}, body: form };
    }
    // JSON 分支：imageUrlN=仅 http(s) URL；imageB64N=仅 data URI；imageCount=张数
    const urls = inputImages.map((v) => (/^https?:\/\//i.test(v) ? v : ''));
    const b64s = inputImages.map((v) => (/^data:image\//i.test(v) ? v : ''));
    const vars: Record<string, string | number> = { upstreamModelId: model, prompt, size: size ?? '' };
    vars.imageCount = inputImages.length;
    vars.imageUrl = urls[0] || '';
    vars.imageB64 = b64s[0] || '';
    inputImages.forEach((_v, i) => {
      vars[`imageUrl${i}`] = urls[i] || '';
      vars[`imageB64${i}`] = b64s[i] || '';
    });
    let body = this.buildBody(adapter.requestTemplate, vars);
    if (Object.keys(body).length === 0) {
      body = { model, prompt, response_format: 'b64_json' };
      if (size) body.size = size;
      if (inputImages[0]) body.image = urls[0] || b64s[0];
    }
    return { url, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  /** multipart 上传（不手动设置 Content-Type，fetch 自动带 boundary） */
  private async postFormData(
    url: string,
    apiKey: string,
    form: FormData,
    headers: Record<string, string> = {},
    timeoutMs = 120000,
  ): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      body: form,
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

  /** 文生图 / 图生图（同步；请求形状由适配配置决定：JSON 内嵌 或 multipart） */
  async generateImage(cfg: {
    endpoint: string;
    apiKey: string;
    adapter: GenerationAdapterConfig;
    model: string;
    prompt: string;
    size?: string;
    inputImages?: string[];
  }): Promise<{ b64?: string; url?: string }> {
    const { endpoint, apiKey, adapter } = cfg;
    const req = await this.buildImageRequest(cfg);
    let json: any;
    if (req.body instanceof FormData) {
      json = await this.postFormData(req.url, apiKey, req.body, adapter.extraHeaders, adapter.timeoutMs || 120000);
    } else {
      json = await this.postJson(req.url, apiKey, JSON.parse(req.body as string), adapter.extraHeaders, adapter.timeoutMs || 120000);
    }
    const b64 = this.getByPath(json, adapter.resultB64Path || 'data[0].b64_json') as string | undefined;
    const u = this.getByPath(json, adapter.resultUrlPath || 'data[0].url') as string | undefined;
    if (!b64 && !u) {
      this.logger.warn(`图片生成上游未返回数据: ${JSON.stringify(json).slice(0, 300)}`);
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
