/**
 * 口播工坊系统级 LLM 调用器（M0-2 确认：服务端直连，不走 llm-proxy，避免与任务预扣双重计费）
 *
 * 通道：admin-model 已配置的 model_providers（优先 deepseek/openai/qwen/doubao）+ API Key 池兜底，
 * 直连 OpenAI 兼容 /chat/completions（与 agent-translate 同一模式）。
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { ApiKeyPoolService } from '../api-key-pool/services/api-key-pool.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { readFileSync } from 'fs';
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
    // 3) 供应商池（model_providers）
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

  /** 语音识别（audio -> 文本）：直连 OpenAI 兼容 /audio/transcriptions（multipart），不计费（任务预扣已覆盖） */
  async stt(audioPath: string): Promise<string> {
    const cfg = await this.readOralConfig();
    const sttModel =
      (typeof cfg.sttModel === 'string' && cfg.sttModel) ||
      process.env.ORAL_WORKSHOP_STT_MODEL ||
      'whisper-1';
    const target = await this.resolveSttTarget(cfg, sttModel);
    if (!target) {
      throw new ServiceUnavailableException('未配置可用的大模型供应商（STT 识别）');
    }
    const buf = readFileSync(audioPath);
    const form = new FormData();
    form.append('file', new Blob([buf]), path.basename(audioPath));
    form.append('model', target.model);
    let resp: Response;
    try {
      resp = await fetch(`${target.endpoint}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${target.apiKey}` },
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
  /** 非流式调用 OpenAI 兼容 /chat/completions，返回完整文本 */
  async chat(messages: LlmMessage[], opts?: { temperature?: number; purpose?: OralLlmPurpose }): Promise<string> {
    const target = await this.resolveTarget(undefined, opts?.purpose);
    if (!target) {
      throw new ServiceUnavailableException('未配置可用的大模型供应商（请在管理后台配置 model_providers 或 API Key 池）');
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
      throw new ServiceUnavailableException(`LLM 上游 HTTP ${resp.status}: ${text.slice(0, 200)}`);
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
}
