/**
 * 口播工坊系统级 LLM 调用器（M0-2 确认：服务端直连，不走 llm-proxy，避免与任务预扣双重计费）
 *
 * 通道：admin-model 已配置的 ai_model_providers（优先 deepseek/openai/qwen/doubao）+ API Key 池兜底，
 * 直连 OpenAI 兼容 /chat/completions（与 agent-translate 同一模式）。
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { ApiKeyPoolService } from '../api-key-pool/services/api-key-pool.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { LlmCaller, LlmMessage } from './llm';

const PROVIDER_PREFERENCE = ['deepseek', 'openai', 'qwen', 'doubao'];

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
};

const DEFAULT_MODEL_BY_SLUG: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  qwen: 'qwen-plus',
  doubao: 'doubao-pro-32k',
};

/** 向量嵌入供应商偏好（deepseek 无 embedding 接口，跳过） */
const EMBEDDING_PROVIDER_PREFERENCE = ['qwen', 'openai', 'doubao'];

/** 各供应商默认 embedding 模型（可用环境变量 ORAL_WORKSHOP_EMBEDDING_MODEL 覆盖） */
const EMBEDDING_MODEL_BY_SLUG: Record<string, string> = {
  qwen: 'text-embedding-v3',
  openai: 'text-embedding-3-small',
  doubao: 'doubao-embedding',
};

/** 口播工坊 LLM 用途（对应管理后台各用途模型配置） */
export type OralLlmPurpose =
  | 'topic'      // 爆款选题
  | 'script'     // IP口播文案 / 营销文案
  | 'rewrite'    // 文案改写
  | 'title'      // 标题 / 封面 H1/H2
  | 'translate'  // 翻译 / 双语字幕
  | 'review'     // 法务审核
  | 'default';   // 兜底

/** 用途 -> 管理后台 oral_workshop 配置键 */
const PURPOSE_MODEL_KEYS: Record<Exclude<OralLlmPurpose, 'default'>, string> = {
  topic: 'topicModel',
  script: 'scriptModel',
  rewrite: 'rewriteModel',
  title: 'titleModel',
  translate: 'translateModel',
  review: 'reviewModel',
};

/** 用途展示名（错误提示用，便于用户定位是哪个配置项生效） */
const PURPOSE_LABELS: Partial<Record<OralLlmPurpose, string>> = {
  topic: '爆款选题',
  script: '口播/营销文案',
  rewrite: '文案改写',
  title: '标题/封面',
  translate: '翻译/双语字幕',
  review: '法务审核',
};

/** 火山方舟默认 LLM 端点 / 模型（管理后台可覆盖） */
const DEFAULT_VOLCANO_LLM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_VOLCANO_LLM_MODEL = 'doubao-seed-1-6-250615';

/** LLM 上游目标（endpoint + key + model） */
export interface LlmTarget {
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * 系统级 LLM 调用器：以系统配置的供应商直连，不冻结/结算用户 Credits
 * （任务整体成本已由 oral-workshop 预扣覆盖）。
 */
@Injectable()
export class SystemLlmService implements LlmCaller {
  private readonly logger = new Logger(SystemLlmService.name);

  constructor(
    @InjectRepository(ModelProviderEntity)
    private readonly providerRepo: Repository<ModelProviderEntity>,
    @InjectRepository(SystemConfigEntity)
    private readonly configRepo: Repository<SystemConfigEntity>,
    private readonly apiKeyPool: ApiKeyPoolService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /** 读取口播工坊配置（system_config.oral_workshop），失败返回空对象 */
  private async readOralConfig(): Promise<Record<string, unknown>> {
    if (!this.configRepo) return {};
    try {
      const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
      return (row?.configValue ?? {}) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn('[oral-workshop] 读取口播工坊模型配置失败: ' + (err as Error).message);
      return {};
    }
  }

  /** 解析可用供应商（与 agent-translate 一致：优先配置供应商，再走 API Key 池） */
  /** 解析可用供应商（云端直连优先，其次配置供应商，最后 API Key 池） */
  async resolveTarget(preferredModel?: string, purpose?: OralLlmPurpose): Promise<LlmTarget | null> {
    const cfg = await this.readOralConfig();
    const cfgModel =
      typeof cfg.llmModel === 'string' && cfg.llmModel ? cfg.llmModel : process.env.ORAL_WORKSHOP_LLM_MODEL || '';
    const purposeModel = purpose ? this.purposeModelFrom(cfg, purpose) : '';
    const model = preferredModel || purposeModel || cfgModel || '';
    // 1) 云端直连（管理后台 llmSource=volcano/custom + llmApiKey）
    const direct = this.directLlmTarget(cfg, model);
    if (direct) return direct;
    // 2) 首选模型走配置供应商
    if (preferredModel) {
      const resolved = await this.resolvePreferredModel(preferredModel);
      if (resolved) return resolved;
    }
    // 3) 供应商池（ai_model_providers）
    const providers = await this.providerRepo.find({ where: { status: 'active' } });
    providers.sort((a, b) => {
      const ia = PROVIDER_PREFERENCE.indexOf(a.slug);
      const ib = PROVIDER_PREFERENCE.indexOf(b.slug);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const p of providers) {
      if (!p.apiKey || !p.baseUrl) continue;
      try {
        return {
          endpoint: p.baseUrl.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(p.apiKey),
          model: model || DEFAULT_MODEL_BY_SLUG[p.slug] || 'deepseek-chat',
        };
      } catch (e) {
        this.logger.warn(`[oral-workshop] 解密供应商 ${p.slug} 的 API Key 失败: ${(e as Error).message}`);
      }
    }
    // 4) 兜底：API Key 池（与 llm-proxy 同一套 key）
    for (const slug of PROVIDER_PREFERENCE) {
      const poolKey = await this.apiKeyPool.getNextAvailableKey(slug);
      if (!poolKey) continue;
      const providerRow = providers.find((p) => p.slug === slug);
      const endpoint = providerRow?.baseUrl || DEFAULT_ENDPOINTS[slug];
      if (!endpoint) continue;
      try {
        return {
          endpoint: endpoint.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(poolKey.apiKey),
          model: model || DEFAULT_MODEL_BY_SLUG[slug] || 'deepseek-chat',
        };
      } catch (e) {
        this.logger.warn(`[oral-workshop] 解密 API Key 池 ${slug} 的 Key 失败: ${(e as Error).message}`);
      }
    }
    return null;
  }

  /** 管理后台直连配置（llmSource=volcano/custom 且已填 llmApiKey 时优先） */
  private directLlmTarget(cfg: Record<string, unknown>, model: string): LlmTarget | null {
    const source = cfg.llmSource;
    if (source !== 'volcano' && source !== 'custom') return null;
    const apiKey = typeof cfg.llmApiKey === 'string' && cfg.llmApiKey ? cfg.llmApiKey.trim() : '';
    if (!apiKey) return null;
    const base = typeof cfg.llmBaseUrl === 'string' && cfg.llmBaseUrl ? cfg.llmBaseUrl : DEFAULT_VOLCANO_LLM_ENDPOINT;
    return {
      endpoint: base.replace(/\/+$/, ''),
      apiKey,
      model: model || DEFAULT_VOLCANO_LLM_MODEL,
    };
  }

  /** 按用途取模型名（topicModel/scriptModel/...） */
  private purposeModelFrom(cfg: Record<string, unknown>, purpose: OralLlmPurpose): string {
    if (purpose === 'default') return '';
    const key = PURPOSE_MODEL_KEYS[purpose];
    if (!key) return '';
    const v = cfg[key];
    return typeof v === 'string' && v ? v.trim() : '';
  }

  /** 管理后台测试连接：用给定三元组调一次 /chat/completions */
  async testConnection(input: { baseUrl?: string; apiKey?: string; model?: string }): Promise<{ success: boolean; message: string }> {
    const base = (input.baseUrl || DEFAULT_VOLCANO_LLM_ENDPOINT).replace(/\/+$/, '');
    const apiKey = (input.apiKey || '').trim();
    if (!apiKey) return { success: false, message: 'API Key 不能为空' };
    const model = (input.model || '').trim() || DEFAULT_VOLCANO_LLM_MODEL;
    try {
      const resp = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 }),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { success: false, message: 'HTTP ' + resp.status + ': ' + text.slice(0, 200) };
      }
      return { success: true, message: '连接成功（' + model + '）' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  /** 按首选模型解析目标（模型属于哪个供应商走哪个） */
  private async resolvePreferredModel(modelId: string): Promise<LlmTarget | null> {
    const providers = await this.providerRepo.find({ where: { status: 'active' } });
    for (const p of providers) {
      if (!p.apiKey || !p.baseUrl) continue;
      try {
        return {
          endpoint: p.baseUrl.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(p.apiKey),
          model: modelId,
        };
      } catch {
        /* 该供应商 key 解密失败，尝试下一个 */
      }
    }
    return null;
  }

  /** 语音识别（audio -> 文本）
   *  - sttProvider=dashscope：百炼 paraformer 录音文件转写（提交任务+轮询，适配长音频，走公网音频 URL）
   *  - 其余：OpenAI 兼容 /audio/transcriptions（需显式 sttEndpoint/sttApiKey，或供应商池含真实识别通道）
   *  不计费（任务预扣已覆盖）。 */
  async stt(audioPath: string): Promise<string> {
    const cfg = await this.readOralConfig();
    const sttProvider = typeof cfg.sttProvider === 'string' && cfg.sttProvider
      ? String(cfg.sttProvider).trim().toLowerCase()
      : '';
    if (sttProvider === 'dashscope') {
      return this.sttViaDashscopeParaformer(cfg, audioPath);
    }
    const sttModel =
      (typeof cfg.sttModel === 'string' && cfg.sttModel) ||
      process.env.ORAL_WORKSHOP_STT_MODEL ||
      'whisper-1';
    const target = await this.resolveSttTarget(cfg, sttModel);
    if (!target) {
      throw new ServiceUnavailableException(
        '未配置可用的语音识别通道：请在口播工坊配置里选择 dashscope(百炼 paraformer)，或配置 sttEndpoint+sttApiKey(OpenAI 兼容 whisper)'
      );
    }
    const buf = readFileSync(audioPath);
    const form = new FormData();
    form.append('file', new Blob([buf]), path.basename(audioPath));
    form.append('model', target.model);
    let resp: Response;
    try {
      resp = await fetch(target.endpoint + '/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + target.apiKey },
        body: form,
        signal: AbortSignal.timeout(180000),
      });
    } catch (e) {
      throw new ServiceUnavailableException('STT 请求失败: ' + (e as Error).message);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new ServiceUnavailableException('STT 上游 HTTP ' + resp.status + ': ' + text.slice(0, 200));
    }
    const data = (await resp.json()) as { text?: string; data?: { text?: string } };
    const out = String(data?.text ?? data?.data?.text ?? '').trim();
    if (!out) throw new ServiceUnavailableException('STT 上游返回空文本');
    return out;
  }

  /** 百炼 paraformer 录音文件转写：本地 wav -> uploads 公网 URL -> 提交任务 -> 轮询结果 */
  private async sttViaDashscopeParaformer(cfg: Record<string, unknown>, audioPath: string): Promise<string> {
    const s = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');
    const model = s(cfg.sttModel) || process.env.ORAL_WORKSHOP_STT_MODEL || 'paraformer-v2';
    let apiKey = s(cfg.sttApiKey);
    if (!apiKey) {
      try {
        const providers = await this.providerRepo.find({ where: { status: 'active' } });
        const dash = providers.find((p) => /dashscope\.aliyuncs\.com/i.test(String(p.baseUrl || '')));
        if (dash?.apiKey) apiKey = this.encryptionService.decryptAes(dash.apiKey);
      } catch (e) {
        this.logger.warn('[oral-workshop] 读取百炼供应商 Key 失败: ' + (e as Error).message);
      }
    }
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '语音识别(dashscope)：未找到可用百炼 API Key（请在管理后台大模型配置百炼供应商，或在口播工坊配置填 sttApiKey）',
      );
    }
    const fileBase = (s(cfg.sttFileBase) || process.env.ORAL_WORKSHOP_PUBLIC_BASE || '').replace(/\/+$/, '');
    if (!fileBase) {
      throw new ServiceUnavailableException(
        '语音识别(dashscope)：缺少公网音频地址前缀，请在口播工坊配置填 sttFileBase（如 https://zt.shentongapi.cn）或设置环境变量 ORAL_WORKSHOP_PUBLIC_BASE',
      );
    }
    const fileUrl = fileBase + this.publicAudioPath(audioPath);
    let resp: Response;
    try {
      resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, input: { file_urls: [fileUrl] } }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new ServiceUnavailableException('百炼识别提交失败: ' + (e as Error).message);
    }
    const submitBody = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new ServiceUnavailableException('百炼识别提交 HTTP ' + resp.status + ': ' + submitBody.slice(0, 300));
    }
    let taskId = '';
    try {
      taskId = String((JSON.parse(submitBody) as { output?: { task_id?: string } }).output?.task_id || '');
    } catch {
      /* 解析失败走下方报错 */
    }
    if (!taskId) {
      throw new ServiceUnavailableException('百炼识别未返回任务 ID: ' + submitBody.slice(0, 200));
    }
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      let pollResp: Response;
      try {
        pollResp = await fetch('https://dashscope.aliyuncs.com/api/v1/tasks/' + taskId, {
          headers: { Authorization: 'Bearer ' + apiKey },
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        throw new ServiceUnavailableException('百炼识别查询失败: ' + (e as Error).message);
      }
      const pollBody = await pollResp.text().catch(() => '');
      if (!pollResp.ok) {
        throw new ServiceUnavailableException('百炼识别查询 HTTP ' + pollResp.status + ': ' + pollBody.slice(0, 200));
      }
      let parsed: { output?: { task_status?: string; message?: string; results?: Array<{ transcription?: string }> } } = {};
      try {
        parsed = JSON.parse(pollBody) as typeof parsed;
      } catch {
        continue;
      }
      const status = parsed.output?.task_status || '';
      if (status === 'SUCCEEDED') {
        const text = await this.pullDashscopeResultText(parsed.output);
        if (!text) throw new ServiceUnavailableException('百炼识别成功但返回空文本');
        return text;
      }
      if (status === 'FAILED' || status === 'CANCELED') {
        throw new ServiceUnavailableException(
          '百炼识别' + (status === 'FAILED' ? '失败' : '已取消') + ': ' + (parsed.output?.message || ''),
        );
      }
    }
    throw new ServiceUnavailableException('百炼识别超时（5 分钟），请重试');
  }

  /** 拉取百炼结果文件（OSS JSON），拼接全部 transcripts[].text */
  private async pullDashscopeResultText(node: unknown): Promise<string> {
    const urls: string[] = [];
    const walk = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      const rec = v as Record<string, unknown>;
      if (typeof rec.transcription_url === 'string') urls.push(String(rec.transcription_url));
      for (const val of Object.values(rec)) {
        if (Array.isArray(val)) val.forEach((x) => walk(x));
        else walk(val);
      }
    };
    walk(node);
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      let resp: Response;
      try {
        resp = await fetch(u, { signal: AbortSignal.timeout(30000) });
      } catch (e) {
        throw new ServiceUnavailableException('百炼识别结果文件拉取失败: ' + (e as Error).message);
      }
      const body = await resp.text().catch(() => '');
      if (!resp.ok) {
        throw new ServiceUnavailableException('百炼识别结果文件 HTTP ' + resp.status);
      }
      try {
        const data = JSON.parse(body) as { transcripts?: Array<{ text?: string }> };
        for (const t of data.transcripts || []) {
          const seg = (t.text || '').trim();
          if (seg) parts.push(seg);
        }
      } catch { /* 结果文件解析失败跳过 */ }
    }
    return parts.join('\n').trim();
  }

  /** 把本地音频放入可静态访问的 uploads 目录，返回 /uploads/… 相对路径 */
  private publicAudioPath(audioPath: string): string {
    const uploadsRoot = path.resolve(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads');
    const abs = path.resolve(audioPath);
    if (abs.startsWith(uploadsRoot + path.sep)) {
      return '/uploads/' + path.relative(uploadsRoot, abs).split(path.sep).join('/');
    }
    const dir = path.join(uploadsRoot, 'oral-workshop', 'stt');
    mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, Date.now() + '-' + randomUUID().slice(0, 8) + '.wav');
    copyFileSync(abs, dest);
    return '/uploads/oral-workshop/stt/' + path.basename(dest);
  }

  /** 非流式调用 OpenAI 兼容 /chat/completions，返回完整文本 */
  async chat(messages: LlmMessage[], opts?: { temperature?: number; purpose?: OralLlmPurpose }): Promise<string> {
    const target = await this.resolveTarget(undefined, opts?.purpose);
    if (!target) {
      throw new ServiceUnavailableException('未配置可用的大模型供应商（请在管理后台配置 ai_model_providers 或 API Key 池）');
    }
    const body = {
      model: target.model,
      stream: false,
      temperature: opts?.temperature ?? 0.7,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    let resp: Response;
    try {
      resp = await fetch(`${target.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${target.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new ServiceUnavailableException(`LLM 请求失败: ${(e as Error).message}`);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const purposeLabel = opts?.purpose ? PURPOSE_LABELS[opts.purpose] || opts.purpose : 'LLM';
      throw new ServiceUnavailableException(
        `LLM 上游 HTTP ${resp.status}（${purposeLabel}，当前使用模型=${target.model}）: ${text.slice(0, 200)}`,
      );
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ServiceUnavailableException('LLM 上游返回空内容');
    }
    return content;
  }

  /** 文本向量化（OpenAI 兼容 /embeddings）：供素材中心语义检索使用 */
  async embed(texts: string[]): Promise<number[][]> {
    const target = await this.resolveEmbeddingTarget();
    if (!target) {
      throw new ServiceUnavailableException(
        '未配置可用的向量嵌入模型（请配置 qwen/openai/doubao 供应商或设置 ORAL_WORKSHOP_EMBEDDING_MODEL）',
      );
    }
    const body = { model: target.model, input: texts };
    let resp: Response;
    try {
      resp = await fetch(target.endpoint + '/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + target.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new ServiceUnavailableException('Embedding 请求失败: ' + (e as Error).message);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new ServiceUnavailableException('Embedding 上游 HTTP ' + resp.status + ': ' + text.slice(0, 200));
    }
    const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
    const out = (data?.data ?? []).map((d) => d.embedding ?? []);
    if (out.length !== texts.length || out.some((v) => v.length === 0)) {
      throw new ServiceUnavailableException('Embedding 上游返回维度不完整');
    }
    return out;
  }

  /** 解析 STT 目标（独立接入点，不随 LLM 直连；sttProvider=volcano 走火山密钥/端点，否则供应商池） */
  private async resolveSttTarget(cfg: Record<string, unknown>, sttModel: string): Promise<LlmTarget | null> {
    const provider = cfg.sttProvider === 'volcano' ? 'volcano' : 'openai';
    if (provider === 'volcano') {
      const apiKey = String(cfg.volcanoApiKey || cfg.llmApiKey || '').trim();
      if (!apiKey) return null;
      const base = typeof cfg.sttEndpoint === 'string' && cfg.sttEndpoint ? cfg.sttEndpoint : DEFAULT_VOLCANO_LLM_ENDPOINT;
      return { endpoint: base.replace(/\/+$/, ''), apiKey, model: sttModel };
    }
    // openai whisper：优先独立 sttEndpoint/sttApiKey；否则走供应商池（跳过 LLM 直连）
    const sttApiKey = typeof cfg.sttApiKey === 'string' && cfg.sttApiKey ? cfg.sttApiKey.trim() : '';
    const sttEndpoint = typeof cfg.sttEndpoint === 'string' && cfg.sttEndpoint ? cfg.sttEndpoint.trim() : '';
    if (sttApiKey && sttEndpoint) {
      return { endpoint: sttEndpoint.replace(/\/+$/, ''), apiKey: sttApiKey, model: sttModel };
    }
    const providers = await this.providerRepo.find({ where: { status: 'active' } });
    for (const p of providers) {
      if (!p.apiKey || !p.baseUrl) continue;
      try {
        return {
          endpoint: p.baseUrl.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(p.apiKey),
          model: sttModel,
        };
      } catch (e) {
        this.logger.warn(`[oral-workshop] 解密 STT 供应商 ${p.slug} Key 失败: ${(e as Error).message}`);
      }
    }
    for (const slug of PROVIDER_PREFERENCE) {
      const poolKey = await this.apiKeyPool.getNextAvailableKey(slug);
      if (!poolKey) continue;
      const providerRow = providers.find((p) => p.slug === slug);
      const endpoint = providerRow?.baseUrl || DEFAULT_ENDPOINTS[slug];
      if (!endpoint) continue;
      try {
        return {
          endpoint: endpoint.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(poolKey.apiKey),
          model: sttModel,
        };
      } catch (e) {
        this.logger.warn(`[oral-workshop] 解密 STT Key 池 ${slug} 失败: ${(e as Error).message}`);
      }
    }
    return null;
  }

  /** 解析 embedding 目标：qwen > openai > doubao；环境变量 ORAL_WORKSHOP_EMBEDDING_MODEL 覆盖模型 */
  private async resolveEmbeddingTarget(): Promise<LlmTarget | null> {
    // 1) 管理后台口播工坊配置直连：embeddingProvider/embeddingModel + embeddingApiKey（llmApiKey/volcanoApiKey 兜底）
    const cfg = await this.readOralConfig();
    const cfgProvider = typeof cfg.embeddingProvider === 'string' && cfg.embeddingProvider ? cfg.embeddingProvider : '';
    const cfgModel = typeof cfg.embeddingModel === 'string' && cfg.embeddingModel ? cfg.embeddingModel.trim() : '';
    const cfgKey = String(cfg.embeddingApiKey || cfg.llmApiKey || cfg.volcanoApiKey || '').trim();
    if (cfgProvider && cfgKey) {
      const cfgEndpoint = typeof cfg.embeddingEndpoint === 'string' && cfg.embeddingEndpoint ? cfg.embeddingEndpoint : '';
      const endpoint = cfgEndpoint || (cfgProvider === 'doubao' ? DEFAULT_VOLCANO_LLM_ENDPOINT : DEFAULT_ENDPOINTS[cfgProvider]);
      if (endpoint) {
        return {
          endpoint: endpoint.replace(/\/+$/, ''),
          apiKey: cfgKey,
          model: cfgModel || process.env.ORAL_WORKSHOP_EMBEDDING_MODEL || EMBEDDING_MODEL_BY_SLUG[cfgProvider] || 'text-embedding-3-small',
        };
      }
    }
    const modelOverride = process.env.ORAL_WORKSHOP_EMBEDDING_MODEL;
    const providers = await this.providerRepo.find({ where: { status: 'active' } });
    for (const slug of EMBEDDING_PROVIDER_PREFERENCE) {
      const p = providers.find((x) => x.slug === slug);
      if (!p || !p.apiKey || !p.baseUrl) continue;
      try {
        return {
          endpoint: p.baseUrl.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(p.apiKey),
          model: modelOverride || EMBEDDING_MODEL_BY_SLUG[slug],
        };
      } catch (e) {
        this.logger.warn('[oral-workshop] 解密 embedding 供应商 ' + slug + ' 的 Key 失败: ' + (e as Error).message);
      }
    }
    for (const slug of EMBEDDING_PROVIDER_PREFERENCE) {
      const poolKey = await this.apiKeyPool.getNextAvailableKey(slug);
      if (!poolKey) continue;
      const providerRow = providers.find((p) => p.slug === slug);
      const endpoint = providerRow?.baseUrl || DEFAULT_ENDPOINTS[slug];
      if (!endpoint) continue;
      try {
        return {
          endpoint: endpoint.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(poolKey.apiKey),
          model: modelOverride || EMBEDDING_MODEL_BY_SLUG[slug],
        };
      } catch (e) {
        this.logger.warn('[oral-workshop] 解密 embedding Key 池 ' + slug + ' 失败: ' + (e as Error).message);
      }
    }
    return null;
  }
  /** 拉取 LLM 端点可用模型列表（OpenAI 兼容 /models，兼容火山方舟 ListModels） */
  async listModels(input: { baseUrl?: string; apiKey?: string; source?: string }): Promise<{ success: boolean; models: string[]; message?: string }> {
    const apiKey = String(input?.apiKey || '').trim();
    if (!apiKey) return { success: false, models: [], message: 'API Key 不能为空' };
    const rawBase = String(input?.baseUrl || '').trim();
    const base = (rawBase || (input?.source === 'custom' ? '' : DEFAULT_VOLCANO_LLM_ENDPOINT)).replace(/\/+$/, '');
    if (!base) return { success: false, models: [], message: '请填写 LLM 接入端点（baseUrl）' };
    try {
      const resp = await fetch(base + '/models', {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        const text = (await resp.text()).slice(0, 300);
        return { success: false, models: [], message: 'HTTP ' + resp.status + '：' + text };
      }
      const data = await resp.json();
      const models = extractModelIds(data);
      if (!models.length) return { success: false, models: [], message: '接口未返回可用模型：' + base + '/models' };
      return { success: true, models };
    } catch (err) {
      return { success: false, models: [], message: '请求失败：' + ((err as Error).message || String(err)) };
    }
  }

  /** 云端能力测试：TTS 合成 / 声音复刻 / 数字人 / 语音识别 / 向量 Embedding（用传入配置，不落库） */
  async testCapability(type: string, cfg: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    const str = (v: unknown): string => (typeof v === 'string' && v ? v.trim() : '');
    const apiKey = str(cfg.volcanoApiKey) || str(cfg.llmApiKey);
    try {
      switch (type) {
        case 'tts': {
          const ttsKey = str(cfg.voiceApiKey) || apiKey;
          if (!ttsKey) return { success: false, message: '未配置语音技术 API Key（voiceApiKey）' };
          const tierV2 = (cfg.voiceTierV2 ?? {}) as Record<string, unknown>;
          const tierV1 = (cfg.voiceTierV1 ?? {}) as Record<string, unknown>;
          const speakerId = str(tierV2.speakerId) || str(tierV1.speakerId) || str(cfg.voiceModelV2) || str(cfg.voiceModelV1) || str(cfg.voiceSpeakerId);
          if (!speakerId) return { success: false, message: '未配置音色 ID（V1/V2 档音色或 voiceSpeakerId）' };
          const resourceId = str(tierV2.resourceId) || str(tierV1.resourceId) || str(cfg.voiceResourceId) || 'seed-icl-2.0';
          const model = str(tierV2.model) || str(tierV1.model) || str(cfg.voiceModel);
          const endpoint = (str(cfg.voiceEndpoint) || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional').replace(/\/+$/, '');
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': ttsKey,
              'X-Api-Resource-Id': resourceId,
              'X-Api-Request-Id': randomUUID(),
            },
            body: JSON.stringify({ req_params: { text: '测试', speaker: speakerId, model: model || undefined, audio_params: { format: 'mp3', sample_rate: 24000 } } }),
            signal: AbortSignal.timeout(25000),
          });
          const text = (await resp.text().catch(() => '')).slice(0, 400);
          if (!resp.ok) return { success: false, message: 'HTTP ' + resp.status + ': ' + text };
          if (/\"code\"\s*:\s*(?!0|200)[1-9]/.test(text)) {
            return { success: false, message: text.slice(0, 300) };
          }
          return { success: true, message: 'TTS 合成成功（speaker=' + speakerId + '，resource=' + resourceId + '）' };
        }
        case 'clone': {
          const clKey = str(cfg.voiceApiKey) || apiKey;
          if (!clKey) return { success: false, message: '未配置语音技术 API Key（voiceApiKey）' };
          const tierC2 = (cfg.voiceTierV2 ?? {}) as Record<string, unknown>;
          const tierC1 = (cfg.voiceTierV1 ?? {}) as Record<string, unknown>;
          const refUrl = str(cfg.voiceRefAudioUrl) || str(tierC2.refAudioUrl) || str(tierC1.refAudioUrl);
          if (!refUrl) return { success: false, message: '未配置参考音频 URL（默认参考音频/V1/V2 档参考音频），无法测试声音复刻' };
          const audioBuf = await this.downloadBytes(refUrl);
          const customSpeakerId = 'st_probe_' + randomUUID().replace(/-/g, '').slice(0, 16);
          const cloneEndpoint = (str(cfg.voiceCloneEndpoint) || 'https://openspeech.bytedance.com/api/v3/tts/voice_clone').replace(/\/+$/, '');
          const resp = await fetch(cloneEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': clKey, 'X-Api-Request-Id': randomUUID() },
            body: JSON.stringify({
              speaker_id: 'custom_speaker_id',
              custom_speaker_id: customSpeakerId,
              audio: { data: audioBuf.toString('base64'), format: 'mp3', text: '', language: 0 },
              extra_params: { demo_text: '你好', enable_audio_denoise: true, disable_volume_normalization: false },
            }),
            signal: AbortSignal.timeout(60000),
          });
          const text = (await resp.text().catch(() => '')).slice(0, 300);
          if (!resp.ok) return { success: false, message: 'HTTP ' + resp.status + ': ' + text };
          return { success: true, message: '声音复刻已提交（custom_speaker_id=' + customSpeakerId + '）：' + text.slice(0, 150) };
        }
        case 'heygen': {
          const hKey = str(cfg.heygenApiKey) || process.env.HEYGEN_API_KEY || '';
          if (!hKey) return { success: false, message: '未配置 HeyGen API Key（heygenApiKey）' };
          const hEndpoint = (str(cfg.heygenEndpoint) || process.env.HEYGEN_ENDPOINT || 'https://api.heygen.com').replace(/\/+$/, '');
          try {
            const resp = await fetch(hEndpoint + '/v1/avatars', {
              headers: { 'X-Api-Key': hKey },
              signal: AbortSignal.timeout(20000),
            });
            const hText = (await resp.text().catch(() => '')).slice(0, 300);
            if (!resp.ok) return { success: false, message: 'HeyGen 请求失败 HTTP ' + resp.status + ': ' + hText };
            return { success: true, message: 'HeyGen 服务连通（可拉取形象列表）：' + hText.slice(0, 150) };
          } catch (err) {
            return { success: false, message: 'HeyGen 请求失败：' + ((err as Error).message || String(err)) };
          }
        }
        case 'dh': {
          const endpoint = str(cfg.dhEndpoint);
          if (!apiKey) return { success: false, message: '未配置火山方舟 API Key' };
          if (!endpoint) return { success: false, message: '未配置数字人服务端点（dhEndpoint）' };
          const submitPath = str(cfg.dhSubmitPath) || '/digital-human/submit';
          const resp = await fetch(endpoint.replace(/\/+$/, '') + submitPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
            body: JSON.stringify({ digital_human_id: '__probe__', audio_url: 'https://example.com/probe.mp3', model_version: 'V2' }),
            signal: AbortSignal.timeout(20000),
          });
          const text = (await resp.text().catch(() => '')).slice(0, 300);
          if (resp.ok) return { success: true, message: '数字人服务可达（HTTP ' + resp.status + '）：' + text.slice(0, 150) };
          return { success: true, message: '数字人服务可达（HTTP ' + resp.status + '，协议已通，请求被拒属预期）：' + text.slice(0, 200) };
        }
        case 'stt': {
          if (str(cfg.sttProvider) === 'dashscope') {
            const fBase = str(cfg.sttFileBase) || process.env.ORAL_WORKSHOP_PUBLIC_BASE || '';
            return { success: !!fBase, message: fBase ? '语音识别配置为百炼 paraformer（sttFileBase=' + fBase + '），保存后请到桌面端用「上传文件提取文案」实测一次' : '语音识别(dashscope)缺少 sttFileBase 公网音频前缀，请先填写' };
          }

          const sttKey = str(cfg.sttApiKey) || apiKey;
          if (!sttKey) return { success: false, message: '未配置语音识别 API Key（sttApiKey 或火山方舟 Key）' };
          const isVolcano = str(cfg.sttProvider) === 'volcano';
          const endpoint = (str(cfg.sttEndpoint) || (isVolcano ? DEFAULT_VOLCANO_LLM_ENDPOINT : 'https://api.openai.com/v1')).replace(/\/+$/, '');
          const resp = await fetch(endpoint + '/models', {
            headers: { Authorization: 'Bearer ' + sttKey },
            signal: AbortSignal.timeout(20000),
          });
          if (!resp.ok) {
            const text = (await resp.text().catch(() => '')).slice(0, 300);
            return { success: false, message: 'HTTP ' + resp.status + ': ' + text };
          }
          return { success: true, message: '语音识别服务连通（' + endpoint + '）' };
        }
        case 'embedding': {
          const provider = str(cfg.embeddingProvider);
          const endpoint = (str(cfg.embeddingEndpoint) || (provider === 'doubao' ? DEFAULT_VOLCANO_LLM_ENDPOINT : DEFAULT_ENDPOINTS[provider]) || '').replace(/\/+$/, '');
          const embKey = str(cfg.embeddingApiKey) || apiKey;
          if (!endpoint || !embKey) return { success: false, message: '未配置向量 Embedding 端点/Key' };
          const model = str(cfg.embeddingModel) || EMBEDDING_MODEL_BY_SLUG[provider] || 'text-embedding-3-small';
          const resp = await fetch(endpoint + '/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + embKey },
            body: JSON.stringify({ model, input: ['测试'] }),
            signal: AbortSignal.timeout(25000),
          });
          if (!resp.ok) {
            const text = (await resp.text().catch(() => '')).slice(0, 300);
            return { success: false, message: 'HTTP ' + resp.status + ': ' + text };
          }
          return { success: true, message: '向量 Embedding 测试成功（' + model + '）' };
        }
        default:
          return { success: false, message: '未知测试类型: ' + type };
      }
    } catch (e) {
      return { success: false, message: (e as Error).message || String(e) };
    }
  }

  /** 下载公网文件为 Buffer（能力测试用） */
  private async downloadBytes(url: string): Promise<Buffer> {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error('参考音频下载失败: HTTP ' + resp.status);
    return Buffer.from(await resp.arrayBuffer());
  }
}

/** 从模型列表接口响应中提取模型 ID（兼容 OpenAI-compatible data[].id / 火山方舟 data[].model_name / models[] 等形态） */
export function extractModelIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const rec = data as Record<string, unknown>;
  const arr = Array.isArray(rec.data) ? rec.data : Array.isArray(rec.models) ? rec.models : Array.isArray(rec.model_list) ? rec.model_list : null;
  if (!arr) return [];
  const out = new Set<string>();
  for (const item of arr) {
    if (typeof item === 'string') {
      if (item.trim()) out.add(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    for (const key of ['id', 'model_name', 'name', 'model']) {
      const v = r[key];
      if (typeof v === 'string' && v.trim()) {
        out.add(v.trim());
        break;
      }
    }
  }
  return [...out].sort();
}
