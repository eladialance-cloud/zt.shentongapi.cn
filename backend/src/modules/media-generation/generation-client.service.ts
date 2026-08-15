import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PROVIDER_TEMPLATES } from '../admin-model/constants/model-templates';
import { normalizeResolutionTier, upstreamResolution } from './billing';

/** 生成适配模板（存于 model_providers.config.generation） */
export interface GenerationAdapterConfig {
  imagesPath?: string;
  videosPath?: string;
  taskPath?: string;
  /** 文生图专用请求体模板（优先于通用 requestTemplate；如 DashScope text2image） */
  imageRequestTemplate?: Record<string, unknown>;
  /** 文生图异步任务查询路径（默认 endpoint + /text2image/task/{id}） */
  imageTaskPath?: string;
  /** 文生图异步结果地址字段路径（默认 output.results[0].url） */
  imageResultUrlPath?: string;
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
  /** 任务查询请求方法（默认 GET；个别上游要求 POST，如部分 DashScope 任务查询） */
  taskMethod?: 'GET' | 'POST';
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

/** 合并供应商级适配模板与模型级 generationParams 覆盖（模型级优先；键名 snake_case）
 * - admin-model 测试连接 与 media-generation 运行时共用，保证「测试 = 运行」
 */
export function mergeGenerationAdapter(
  baseAdapter: GenerationAdapterConfig,
  gen: Record<string, unknown> | null | undefined,
): GenerationAdapterConfig {
  const adapter: GenerationAdapterConfig = { ...baseAdapter };
  const g = gen ?? {};
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
  const arr = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : undefined);
  const obj = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  const s = str(g.video_submit_path); if (s) adapter.videosPath = s;
  const q = str(g.video_query_path); if (q) adapter.taskPath = q;
  const img = str(g.images_path); if (img) adapter.imagesPath = img;
  const tid = str(g.task_id_path); if (tid) adapter.taskIdPath = tid;
  const st = str(g.task_status_path); if (st) adapter.statusPath = st;
  const sv = arr(g.success_values); if (sv) adapter.successValues = sv;
  const fv = arr(g.failed_values); if (fv) adapter.failedValues = fv;
  const ru = str(g.result_url_path); if (ru) adapter.resultUrlPath = ru;
  const rb = str(g.result_b64_path); if (rb) adapter.resultB64Path = rb;
  const eh = obj(g.extra_headers); if (eh) adapter.extraHeaders = eh as Record<string, string>;
  const rt = obj(g.request_template); if (rt) adapter.requestTemplate = rt;
  const irt = obj(g.image_request_template); if (irt) adapter.imageRequestTemplate = irt;
  const itp = str(g.image_task_path); if (itp) adapter.imageTaskPath = itp;
  if (g.task_method === 'GET' || g.task_method === 'POST') adapter.taskMethod = g.task_method;
  const irp = str(g.image_result_url_path); if (irp) adapter.imageResultUrlPath = irp;
  if (typeof g.poll_interval === 'number' && g.poll_interval > 0) adapter.pollInterval = g.poll_interval;
  if (typeof g.timeout_ms === 'number' && g.timeout_ms > 0) adapter.timeoutMs = g.timeout_ms;
  if (g.images_style === 'json' || g.images_style === 'multipart') adapter.imagesStyle = g.images_style;
  const ifields = arr(g.image_fields); if (ifields) adapter.imageFields = ifields;
  const pf = str(g.prompt_field); if (pf) adapter.promptField = pf;
  const mf = str(g.model_field); if (mf) adapter.modelField = mf;
  const sf = str(g.size_field); if (sf) adapter.sizeField = sf;
  const mp = obj(g.multipart_fields); if (mp) adapter.multipartFields = mp as Record<string, unknown>;
  return adapter;
}

/**
 * 构建媒体生成适配器（admin 测试连接 与 运行时 resolveModel 共用，保证「测试 = 运行」）：
 * - 厂商最新预设模板优先（端点随上游演进，自动修复存量供应商 config 里存旧地址的问题）；
 * - 供应商 config.generation 仅补齐模板没有的键（如用户自定义字段）；
 * - 模型级 generationParams 最后覆盖（最高优先级）。
 */
export function buildMediaGenerationAdapter(
  provider: { config?: Record<string, unknown> | null; slug?: string } | null | undefined,
  modelGenerationParams?: Record<string, unknown> | null,
): GenerationAdapterConfig {
  const stored = ((provider?.config?.generation ?? {}) as Record<string, unknown>) || {};
  const vendorKey = (provider?.config?.vendorKey as string) || provider?.slug || '';
  const vendorTpl = PROVIDER_TEMPLATES.find((p) => p.vendor === vendorKey);
  const base = (vendorTpl?.generation ?? {}) as Record<string, unknown>;
  return mergeGenerationAdapter(
    { ...stored, ...base } as GenerationAdapterConfig,
    modelGenerationParams ?? {},
  );
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
  buildBody(template: Record<string, unknown> | undefined, vars: Record<string, unknown>): Record<string, unknown> {
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
    const vars: Record<string, string | number> = {
      upstreamModelId: model,
      prompt,
      size: size ? upstreamResolution(size) : '',
    };
    vars.imageCount = inputImages.length;
    vars.imageUrl = urls[0] || '';
    vars.imageB64 = b64s[0] || '';
    // 预初始化 4 个槽位：无输入图时占位解析为空串，由 stripEmptyFields 剔除
    for (let i = 0; i < 4; i++) {
      vars[`imageUrl${i}`] = urls[i] || '';
      vars[`imageB64${i}`] = b64s[i] || '';
    }
    let body = this.buildBody(adapter.imageRequestTemplate ?? adapter.requestTemplate, vars);
    // 图片专用模板：剔除解析后为空的字段（如未传参考图时 base_image_url 占位为空，避免上游 400 url error）
    if (adapter.imageRequestTemplate) {
      body = this.stripEmptyFields(body);
    }
    if (Object.keys(body).length === 0) {
      body = { model, prompt, response_format: 'b64_json' };
      if (size) body.size = size;
      if (inputImages[0]) body.image = urls[0] || b64s[0];
    }
    return { url, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  /** 递归剔除值为空字符串的字段（图片模板可选占位符专用） */
  private stripEmptyFields(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === '') continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const child = this.stripEmptyFields(v as Record<string, unknown>);
        if (Object.keys(child).length) out[k] = child;
      } else {
        out[k] = v;
      }
    }
    return out;
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
      throw new BadRequestException(`上游接口错误(${res.status}) ${url}: ${text.slice(0, 300)}`);
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
      throw new BadRequestException(`上游接口错误(${res.status}) ${url}: ${text.slice(0, 300)}`);
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
    if (!res.ok) throw new BadRequestException(`上游任务查询错误(${res.status}) ${url}: ${text.slice(0, 300)}`);
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
    // 原生异步任务（如 DashScope text2image/image-synthesis）：提交返回 task_id，轮询拿结果
    if (adapter.async || adapter.taskIdPath) {
      const taskId = this.getByPath(json, adapter.taskIdPath || 'output.task_id') as string | undefined;
      if (taskId) {
        const pollAdapter: GenerationAdapterConfig = {
          ...adapter,
          taskPath: adapter.imageTaskPath || adapter.taskPath,
          resultUrlPath: adapter.imageResultUrlPath || adapter.resultUrlPath || 'output.results[0].url',
          statusPath: adapter.statusPath || 'output.task_status',
        };
        const deadline = Date.now() + (adapter.timeoutMs || 120000);
        while (Date.now() < deadline) {
          const polled = await this.pollVideoTask({ endpoint, apiKey, adapter: pollAdapter, taskId });
          if (polled.status === 'done') {
            if (!polled.url) throw new BadRequestException('上游图片任务完成但未返回图片地址');
            return { url: polled.url };
          }
          if (polled.status === 'failed') {
            throw new BadRequestException(polled.message || '上游图片任务失败');
          }
          await new Promise((r) => setTimeout(r, adapter.pollInterval || 3000));
        }
        throw new BadRequestException('上游图片任务超时');
      }
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
    inputImages?: string[];
  }): Promise<{ taskId: string }> {
    const { endpoint, apiKey, adapter } = cfg;
    const res = upstreamResolution(cfg.resolution ?? '');
    const vars: Record<string, unknown> = {
      upstreamModelId: cfg.model,
      prompt: cfg.prompt,
      resolution: res,
      duration: cfg.duration ?? 5,
      fps: cfg.fps ?? 24,
    };
    // 图生视频：首帧图注入 input.media（模板内 {media} 占位符或强制注入）
    if (cfg.inputImages?.length) {
      vars.media = cfg.inputImages.map((url) => ({ type: 'first_frame', url }));
    }
    let body = this.buildBody(adapter.requestTemplate, vars);
    if (cfg.inputImages?.length && !adapter.requestTemplate) {
      body = { model: cfg.model, input: { prompt: cfg.prompt }, parameters: {} };
      (body.input as Record<string, unknown>).media = vars.media;
      if (res) (body.parameters as Record<string, unknown>).resolution = res;
      if (cfg.duration) (body.parameters as Record<string, unknown>).duration = cfg.duration;
      if (cfg.fps) (body.parameters as Record<string, unknown>).fps = cfg.fps;
    }
    // 剔除空字段（如未传分辨率时 resolution=''，避免上游 400）
    body = this.stripEmptyFields(body);
    if (Object.keys(body).length === 0) {
      body = { model: cfg.model, prompt: cfg.prompt };
      if (res) body.resolution = res;
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
    const json =
      adapter.taskMethod === 'POST'
        ? await this.postJson(url, apiKey, {}, adapter.extraHeaders, adapter.timeoutMs || 30000)
        : await this.getJson(url, apiKey, adapter.extraHeaders, adapter.timeoutMs || 30000);
    const status = this.getByPath(json, adapter.statusPath || 'data.task_status') as string;
    const successValues = adapter.successValues || ['succeed'];
    const failedValues = adapter.failedValues || ['failed'];
    if (successValues.includes(status)) {
      let u = this.getByPath(json, adapter.resultUrlPath || '') as string;
      if (!u) u = this.getByPath(json, 'output.results[0].url') as string;
      if (!u) u = this.getByPath(json, 'output.video_url') as string;
      if (!u) u = this.getByPath(json, 'data.task_result.videos[0].url') as string;
      return { status: 'done', url: u };
    }
    if (failedValues.includes(status)) {
      return { status: 'failed', message: `上游任务失败(status=${status})` };
    }
    return { status: 'processing' };
  }
}
