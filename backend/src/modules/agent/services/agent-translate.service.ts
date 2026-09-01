import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelProviderEntity } from '../../admin-model/entities/model-provider.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ApiKeyPoolService } from '../../api-key-pool/services/api-key-pool.service';
import { ModelEntity } from '../../model/entities/model.entity';

/** 文本是否已包含中文字符 */
function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text || '');
}

export interface AgentTranslateResult {
  displayName?: string;
  description?: string;
}

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

/**
 * Agent 名称/介绍自动翻译为简体中文（导入时调用）
 * 复用管理后台已配置的模型供应商（ai_model_providers 表，AES 加密的 key 解密后直连）
 * 单次调用同时翻译 name + description，失败返回 null，由调用方保留原文
 */
@Injectable()
export class AgentTranslateService {
  private readonly logger = new Logger(AgentTranslateService.name);

  constructor(
    @InjectRepository(ModelProviderEntity)
    private readonly providerRepo: Repository<ModelProviderEntity>,
    private readonly encryptionService: EncryptionService,
    private readonly apiKeyPoolService: ApiKeyPoolService,
    @InjectRepository(ModelEntity)
    private readonly modelRepo: Repository<ModelEntity>,
  ) {}

  /** 解析用户指定的翻译模型（后台模型 → 供应商直连 / 模型直连 / Key 池兜底） */
  private async resolvePreferredModel(
    preferredModel: string,
  ): Promise<{ endpoint: string; apiKey: string; model: string } | null> {
    try {
      const model = await this.modelRepo.findOne({
        where: { modelId: preferredModel, isActive: true },
        relations: { credentials: true },
      });
      if (!model) {
        this.logger.warn(`翻译模型不存在或未启用: ${preferredModel}`);
        return null;
      }
      const upstream = model.upstreamModelId || model.modelId;
      // 1) 模型所属供应商直连
      if (model.providerId) {
        const provider = await this.providerRepo.findOne({
          where: { id: model.providerId, status: 'active' },
        });
        if (provider?.apiKey && provider.baseUrl) {
          try {
            return {
              endpoint: provider.baseUrl.replace(/\/+$/, ''),
              apiKey: this.encryptionService.decryptAes(provider.apiKey),
              model: upstream,
            };
          } catch (e) {
            this.logger.warn(`解密供应商 ${provider.slug} 的 API Key 失败: ${(e as Error).message}`);
          }
        }
      }
      // 2) 模型自身直连配置（老数据）
      if (model.credentials?.apiEndpoint && model.credentials.apiKey) {
        try {
          return {
            endpoint: model.credentials.apiEndpoint.replace(/\/+$/, ''),
            apiKey: this.encryptionService.decryptAes(model.credentials.apiKey),
            model: upstream,
          };
        } catch (e) {
          this.logger.warn(`解密模型 ${model.modelId} 的 API Key 失败: ${(e as Error).message}`);
        }
      }
      // 3) 模型所属供应商 Key 池兜底
      const poolKey = await this.apiKeyPoolService.getNextAvailableKey(model.provider);
      if (poolKey) {
        try {
          const providerRow = await this.providerRepo.findOne({
            where: { id: model.providerId || 0 } as any,
          });
          const endpoint = providerRow?.baseUrl || DEFAULT_ENDPOINTS[model.provider];
          if (endpoint) {
            return {
              endpoint: endpoint.replace(/\/+$/, ''),
              apiKey: this.encryptionService.decryptAes(poolKey.apiKey),
              model: upstream,
            };
          }
        } catch (e) {
          this.logger.warn(`模型 ${model.modelId} 的 Key 池 Key 解密失败: ${(e as Error).message}`);
        }
      }
      this.logger.warn(`翻译模型 ${preferredModel} 无法解析到可用 Key，回退自动选择`);
      return null;
    } catch (e) {
      this.logger.warn(`解析翻译模型失败: ${(e as Error).message}`);
      return null;
    }
  }

  /** 选择翻译目标：优先用户指定的模型，否则自动挑选可用供应商（优先 deepseek/openai） */
  private async resolveTarget(
    preferredModel?: string,
  ): Promise<{ endpoint: string; apiKey: string; model: string } | null> {
    if (preferredModel) {
      const resolved = await this.resolvePreferredModel(preferredModel);
      if (resolved) return resolved;
    }
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
          model: process.env.AI_TRANSLATE_MODEL || DEFAULT_MODEL_BY_SLUG[p.slug] || 'gpt-4o-mini',
        };
      } catch (e) {
        this.logger.warn(`解密供应商 ${p.slug} 的 API Key 失败: ${(e as Error).message}`);
      }
    }

    // 兜底：从 API Key 池取可用 key（与 llm-proxy 同一套 key）
    for (const slug of PROVIDER_PREFERENCE) {
      const poolKey = await this.apiKeyPoolService.getNextAvailableKey(slug);
      if (!poolKey) continue;
      const providerRow = providers.find((p) => p.slug === slug);
      const endpoint = providerRow?.baseUrl || DEFAULT_ENDPOINTS[slug];
      if (!endpoint) continue;
      try {
        return {
          endpoint: endpoint.replace(/\/+$/, ''),
          apiKey: this.encryptionService.decryptAes(poolKey.apiKey),
          model: process.env.AI_TRANSLATE_MODEL || DEFAULT_MODEL_BY_SLUG[slug] || 'gpt-4o-mini',
        };
      } catch (e) {
        this.logger.warn(`解密 API Key 池 ${slug} 的 Key 失败: ${(e as Error).message}`);
      }
    }
    return null;
  }

  /**
   * 翻译 Agent 名称与介绍（已含中文或已填显示名则跳过对应字段）
   * 任一步失败返回 null，调用方保留原文
   */
  async translateNameAndDescription(
    name: string,
    description: string,
    existingDisplayName?: string,
    preferredModel?: string,
  ): Promise<AgentTranslateResult | null> {
    const needName = !existingDisplayName && !hasCjk(name);
    const needDesc = !!description && !hasCjk(description);
    if (!needName && !needDesc) return null;

    const target = await this.resolveTarget(preferredModel);
    if (!target) {
      this.logger.warn('未找到可用的大模型供应商用于翻译，跳过中文化');
      return null;
    }

    const payload: Record<string, string> = {};
    if (needName) payload.name = name;
    if (needDesc) payload.description = description;

    const systemPrompt =
      '你是专业的中英翻译。把用户提供的 Agent 名称(name)和介绍(description)翻译成简体中文。' +
      '专有名词/品牌名(如 DeepSeek、GPT、OpenAI)保持原样。只输出一个 JSON 对象，格式：' +
      '{"name":"翻译后的名称","description":"翻译后的介绍"}，不要输出其他内容。';
    const body = {
      model: target.model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    };

    try {
      const resp = await fetch(`${target.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${target.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (!resp.ok) {
        this.logger.warn(`翻译请求失败: HTTP ${resp.status}`);
        return null;
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content || '';
      const parsed = this.parseJson(content);
      if (!parsed) {
        this.logger.warn('翻译响应 JSON 解析失败: ' + content.slice(0, 120));
        return null;
      }
      const result: AgentTranslateResult = {};
      if (needName && typeof parsed.name === 'string' && parsed.name.trim()) {
        result.displayName = parsed.name.trim();
      }
      if (needDesc && typeof parsed.description === 'string' && parsed.description.trim()) {
        result.description = parsed.description.trim();
      }
      if (!result.displayName && !result.description) return null;
      return result;
    } catch (e) {
      this.logger.warn(`翻译调用异常: ${(e as Error).message}`);
      return null;
    }
  }

  /** 从模型输出中提取 JSON（兼容 ```json 围栏与前后多余文本） */
  private parseJson(content: string): Record<string, unknown> | null {
    if (!content) return null;
    let text = content.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
