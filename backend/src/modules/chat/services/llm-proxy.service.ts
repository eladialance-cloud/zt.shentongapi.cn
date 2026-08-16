import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyPoolService } from '../../api-key-pool/services/api-key-pool.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { LlmClientService } from './llm-client.service';
import { PricingService } from '../../credits/services/pricing.service';
import { CreditsService } from '../../credits/services/credits.service';
import { UserEntity } from '../../user/entities/user.entity';
import { ModelEntity } from '../../model/entities/model.entity';
import { ModelProviderEntity } from '../../admin-model/entities/model-provider.entity';
import { LlmFileEntity } from '../entities/llm-file.entity';
import { resolveRelay } from '../../admin-model/utils/relay-resolver';
import { MediaGenerationService } from '../../media-generation/media-generation.service';
import * as crypto from 'crypto';

@Injectable()
export class LlmProxyService {
  private readonly logger = new Logger(LlmProxyService.name);
  private readonly KEY_PREFIX = 'sk-shentong-';

  constructor(
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ModelEntity) private readonly modelRepository: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity) private readonly providerRepository: Repository<ModelProviderEntity>,
    private readonly apiKeyPoolService: ApiKeyPoolService,
    private readonly encryptionService: EncryptionService,
    private readonly llmClient: LlmClientService,
    private readonly pricingService: PricingService,
    private readonly creditsService: CreditsService,
    private readonly mediaGeneration: MediaGenerationService,
    @InjectRepository(LlmFileEntity) private readonly llmFileRepo: Repository<LlmFileEntity>,
  ) {}

  generateLlmProxyKey(): string {
    return this.KEY_PREFIX + crypto.randomBytes(16).toString('hex');
  }

  async ensureLlmProxyKey(userId: number): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.llmProxyKey) return user.llmProxyKey;
    const newKey = this.generateLlmProxyKey();
    await this.userRepository.update(userId, { llmProxyKey: newKey });
    this.logger.log(`Generated LLM proxy key for user ${userId}`);
    return newKey;
  }

  async regenerateLlmProxyKey(userId: number): Promise<string> {
    const newKey = this.generateLlmProxyKey();
    await this.userRepository.update(userId, { llmProxyKey: newKey });
    this.logger.log(`Regenerated LLM proxy key for user ${userId}`);
    return newKey;
  }

  private async verifyApiKey(apiKey: string): Promise<{ userId: number }> {
    if (!apiKey || !apiKey.startsWith(this.KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API Key format');
    }
    const user = await this.userRepository.findOne({
      where: { llmProxyKey: apiKey },
      select: ['id', 'status'],
    });
    if (!user) throw new UnauthorizedException('API Key invalid');
    if (user.status !== 'active') throw new ForbiddenException('Account disabled');
    return { userId: user.id };
  }

  async getModels(apiKey: string) {
    await this.verifyApiKey(apiKey);
    const models = await this.modelRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return [
      { id: 'deep-shentong', object: 'model', owned_by: 'shentong-ai', type: 'chat' },
      ...models.map((m) => ({
        id: m.modelId,
        object: 'model',
        owned_by: 'shentong-ai',
        type: m.modelType || 'chat',
        name: m.name,
        supports_vision: !!m.supportsVision,
      })),
    ];
  }

  async chatCompletions(
    apiKey: string,
    body: {
      model: string;
      messages: Array<{ role: string; content: string | unknown[] }>;
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      tools?: unknown[];
      /** 两步式专用模型：本用户此前上传得到的上游文件 ID 列表 */
      files?: string[];
    },
    onCost?: (finalCost: number) => void,
  ): Promise<{ stream: boolean; iterator: AsyncGenerator<string, void, unknown> }> {
    const { userId } = await this.verifyApiKey(apiKey);
    let modelId = await this.resolveModelId(body.model, userId);

    // 识图自动切换：消息含图片且当前默认对话模型不支持视觉时，改用用户默认识图模型
    const hasImageContent = body.messages.some(
      (m) =>
        Array.isArray(m.content) &&
        (m.content as Array<{ type?: string }>).some((p) => p && p.type === 'image_url'),
    );
    if (hasImageContent) {
      const chatModel = await this.modelRepository.findOne({ where: { modelId } });
      if (chatModel && !chatModel.supportsVision) {
        const visionUser = await this.userRepository.findOne({
          where: { id: userId },
          select: ['id', 'defaultModelVision'],
        });
        if (visionUser?.defaultModelVision) {
          const visionModel = await this.modelRepository.findOne({
            where: { modelId: visionUser.defaultModelVision, isActive: true },
          });
          if (
            visionModel &&
            (visionModel.supportsVision ||
              (visionModel.modelType || '').toLowerCase() === 'vision')
          ) {
            modelId = visionUser.defaultModelVision;
            this.logger.log(
              `消息含图片，默认对话模型不支持视觉，切换到识图模型: ${modelId}`,
            );
          }
        }
      }
    }

    // v0.7.0 供应商体系：优先使用模型所属供应商的 Base URL + API Key + upstreamModelId 直连上游，
    // 费用在第三方 API 侧扣除；未配置供应商时回退到 API Key 池
    // 专用文本模型适配：读取模型 generationParams（qwen-long 两步式 / 翻译 / 联网等）
    const chatModel = await this.modelRepository.findOne({ where: { modelId, isActive: true } });
    const gen = ((chatModel?.generationParams ?? {}) as Record<string, unknown>);
    const extraBody: Record<string, unknown> = {};
    if (gen.chat_body_extra && typeof gen.chat_body_extra === 'object') {
      Object.assign(extraBody, gen.chat_body_extra as Record<string, unknown>);
    }
    let resolvedFileIds: string[] = [];
    if (body.files != null) {
      if (!Array.isArray(body.files)) {
        throw new BadRequestException('files 必须为数组');
      }
      if (body.files.length > 0) {
        resolvedFileIds = await this.resolveChatFileIds(userId, body.files);
      }
    }
    if (gen.file_id_required === true && resolvedFileIds.length === 0) {
      throw new BadRequestException('该模型要求先上传文件（files）');
    }
    if (resolvedFileIds.length > 0) {
      const field = gen.chat_files_field ? String(gen.chat_files_field) : 'files';
      extraBody[field] = resolvedFileIds;
    }

    const upstreamTarget = await this.resolveUpstreamTarget(modelId);
    let decryptedKey = '';
    let upstreamModel = modelId;
    let endpoint: string | undefined;
    let entryId: number | null = null;
    if (upstreamTarget) {
      endpoint = upstreamTarget.endpoint;
      upstreamModel = upstreamTarget.upstreamModelId;
      decryptedKey = upstreamTarget.apiKey;
      this.logger.log(
        `供应商直连: model=${modelId} upstream=${upstreamModel} provider=${upstreamTarget.providerSlug}`,
      );
    } else {
      const provider = this.llmClient.getProviderFromModelId(modelId);
      const apiKeyEntry = await this.apiKeyPoolService.getNextAvailableKey(provider);
      if (!apiKeyEntry) throw new BadRequestException(`No available ${provider} API Key`);
      try {
        decryptedKey = this.encryptionService.decryptAes(apiKeyEntry.apiKey);
      } catch {
        throw new BadRequestException('API Key decryption failed');
      }
      entryId = apiKeyEntry.id;
    }

    const userLevel = await this.pricingService.getUserLevel(userId);
    // 预扣：按模型单价 × 默认预估 token(2000 in / 500 out) 估值冻结，至少冻结 1 积分
    let estimatedCost = 10;
    try {
      estimatedCost = await this.pricingService.calculateModelCost(modelId, {
        input: 2000,
        output: 500,
      });
      estimatedCost = Math.max(estimatedCost, 1);
    } catch (e) {
      this.logger.warn(`模型定价查询失败，使用默认预扣 10: ${(e as Error).message}`);
    }
    let frozenTxnId: number | null = null;
    try {
      const freezeTxn = await this.creditsService.freezeCredits(
        userId, estimatedCost, 'llm_proxy', `proxy_${modelId}_${Date.now()}`,
      );
      frozenTxnId = freezeTxn.id;
    } catch {
      throw new ForbiddenException('Insufficient credits');
    }

    const isStream = body.stream ?? false;
    const self = this;

    async function* generate(): AsyncGenerator<string, void, unknown> {
      const queue: string[] = [];
      let done = false;
      let error: Error | null = null;
      let resolveWait: (() => void) | null = null;
      const push = (data: string) => { queue.push(data); if (resolveWait) { const r = resolveWait; resolveWait = null; r(); } };
      let fullResponse = '';

      // 统一结算：按后台定价 × 实际 token 扣费（streamChat callbacks 共用）
      const settle = async (u: { input: number; output: number; total: number }) => {
        const cost = await self.pricingService.calculateModelCost(modelId, {
          input: u.input,
          output: u.output,
        });
        const finalCost = self.pricingService.applyDiscount(cost, userLevel);
        if (onCost) { try { onCost(finalCost); } catch (_e) {} }
        if (frozenTxnId && finalCost > 0) {
          try { await self.creditsService.settleCredits(userId, frozenTxnId, finalCost); } catch (_e) {}
        } else if (frozenTxnId) {
          try { await self.creditsService.refundCredits(userId, frozenTxnId); } catch (_e) {}
        }
        if (entryId) {
          try { await self.apiKeyPoolService.deductQuota(entryId, u.total); } catch (_e) {}
        }
      };
      // 结束帧：文本完成 stop / 工具调用完成 tool_calls（工具由客户端本地执行）
      const emitFinish = (
        u: { input: number; output: number; total: number },
        finishReason: string,
        toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>,
      ) => {
        if (isStream) {
          push(`data: ${JSON.stringify({
            id: `chatcmpl-${Date.now()}`, object: 'chat.completion.chunk',
            model: body.model,
            choices: [{ delta: toolCalls ? { tool_calls: toolCalls } : {}, index: 0, finish_reason: finishReason }],
          })}\n\n`);
          push('data: [DONE]\n\n');
        } else {
          push(`data: ${JSON.stringify({
            id: `chatcmpl-${Date.now()}`, object: 'chat.completion',
            model: body.model,
            choices: [{
              message: toolCalls
                ? { role: 'assistant', content: fullResponse || null, tool_calls: toolCalls }
                : { role: 'assistant', content: fullResponse },
              finish_reason: finishReason, index: 0,
            }],
            usage: { prompt_tokens: u.input, completion_tokens: u.output, total_tokens: u.total },
          })}\n\n`);
          push('data: [DONE]\n\n');
        }
        done = true;
        if (resolveWait) { const r = resolveWait; resolveWait = null; r(); }
      };

      void (async () => {
        try {

          await self.llmClient.streamChat(
            {
              model: upstreamModel,
              apiKey: decryptedKey,
              endpoint,
              systemPrompt: '',
              messages: body.messages as any,
              tools: body.tools as any,
              extraBody,
            },
            {
              onMessage: (chunk: string) => {
                fullResponse += chunk;
                if (isStream) {
                  push(`data: ${JSON.stringify({
                    id: `chatcmpl-${Date.now()}`, object: 'chat.completion.chunk',
                    model: body.model,
                    choices: [{ delta: { content: chunk }, index: 0, finish_reason: null }],
                  })}\n\n`);
                }
              },
              // 流式透传上游 tool_calls delta（OpenClaw 等网关客户端原样接收并本地执行工具）
              onToolCallDelta: (toolCalls: unknown[]) => {
                if (isStream) {
                  push(`data: ${JSON.stringify({
                    id: `chatcmpl-${Date.now()}`, object: 'chat.completion.chunk',
                    model: body.model,
                    choices: [{ delta: { tool_calls: toolCalls }, index: 0, finish_reason: null }],
                  })}\n\n`);
                }
              },

              onDone: async (u: { input: number; output: number; total: number }, _resp: unknown) => {
                await settle(u);
                emitFinish(u, 'stop');
              },
              onToolCallsDone: async (
                calls: Array<{ id: string; name: string; args: string }>,
                u: { input: number; output: number; total: number },
              ) => {
                await settle(u);
                emitFinish(u, 'tool_calls', calls.map((tc) => ({
                  id: tc.id, type: 'function' as const,
                  function: { name: tc.name, arguments: tc.args },
                })));
              },
              onError: (err: Error) => {
                error = err;
                if (frozenTxnId) { try { void self.creditsService.refundCredits(userId, frozenTxnId); } catch (_e) {} }
                done = true;
                if (resolveWait) { const r = resolveWait as () => void; resolveWait = null; r(); }
              },
            },
          );
        } catch (err) {
          error = err as Error;
          done = true;
          if (resolveWait) { const r = resolveWait as () => void; resolveWait = null; r(); }
        }
      })();

      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (!done) {
          await new Promise<void>(resolve => { resolveWait = resolve; });
          resolveWait = null;
        }
      }
      if (error) throw error;
    }

    return { stream: isStream, iterator: generate() };
  }

  /** 通用上游 JSON 调用（验证 token 后直连模型所属供应商） */
  private async callUpstreamJson(
    path: string,
    model: string,
    body: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    const { userId } = await this.verifyApiKey(token);
    const modelId = await this.resolveModelId(model, userId);
    const target = await this.resolveUpstreamTarget(modelId);
    if (!target) throw new BadRequestException('模型未配置供应商，无法直连');
    const url = target.endpoint.replace(/\/+$/, '') + path;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.apiKey}` },
      body: JSON.stringify({ ...body, model: target.upstreamModelId || modelId }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`上游接口错误(${res.status}): ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  /** 向量嵌入（OpenAI 兼容 v1/embeddings） */
  async embeddings(
    token: string,
    body: { model: string; input: string | string[] },
  ): Promise<{ data: unknown; usage?: unknown }> {
    const out = await this.callUpstreamJson(
      '/embeddings',
      body.model,
      { model: body.model, input: body.input },
      token,
    );
    return { data: out.data, usage: out.usage };
  }

  /** 重排序（OpenAI 兼容 v1/rerank） */
  async rerank(
    token: string,
    body: { model: string; query: string; documents: string[]; top_n?: number },
  ): Promise<{ results: Array<{ index: number; score?: number }> }> {
    const out = await this.callUpstreamJson(
      '/rerank',
      body.model,
      { model: body.model, query: body.query, documents: body.documents, top_n: body.top_n ?? 10 },
      token,
    );
    return { results: out.results };
  }

  /** OCR 文字提取（专用接口，图片/PDF -> 文本） */
  async ocr(
    token: string,
    body: { model: string; imageUrl?: string; fileUrl?: string },
  ): Promise<{ text: string }> {
    const out = await this.callUpstreamJson('/ocr', body.model, { imageUrl: body.imageUrl, fileUrl: body.fileUrl }, token);
    return { text: String(out.text ?? '') };
  }

  /** 语音识别（audio -> 文本） */
  async stt(
    token: string,
    body: { model: string; audioUrl: string; language?: string },
  ): Promise<{ text: string }> {
    const out = await this.callUpstreamJson('/audio/transcriptions', body.model, { audioUrl: body.audioUrl, language: body.language }, token);
    return { text: String(out.text ?? '') };
  }

  /** 语音转语音（音频 + 参考音色 -> 音频 URL） */
  async voiceConversion(
    token: string,
    body: { model: string; audioUrl: string; referenceUrl?: string },
  ): Promise<{ url: string }> {
    const out = await this.callUpstreamJson('/audio/voice-conversion', body.model, { audioUrl: body.audioUrl, referenceUrl: body.referenceUrl }, token);
    return { url: String(out.url ?? out.audio_url ?? '') };
  }

  /** 音乐生成（P1 同步降级直连；P5 接入异步任务框架） */
  async musicGeneration(
    token: string,
    body: { model?: string; prompt: string; duration?: number },
  ): Promise<{ url?: string }> {
    const out = await this.callUpstreamJson('/music/generations', body.model || '', { prompt: body.prompt, duration: body.duration }, token);
    return { url: String(out.url ?? out.audio_url ?? '') };
  }


  /** 点号路径取值（file_id_path 配置支持 data.file_id 等嵌套路径） */
  private getByPathValue(obj: unknown, path: string): unknown {
    if (!path || obj == null) return undefined;
    let cur: any = obj;
    for (const part of path.split('.')) {
      if (cur == null) return undefined;
      const m = part.match(/^(\w+)\[(\d+)\]$/);
      cur = m ? cur?.[m[1]]?.[Number(m[2])] : cur?.[part];
    }
    return cur;
  }

  /**
   * 计算直连 endpoint（追加 /chat/completions 即为 chat URL）：
   * - 供应商 config.chatPath 含路径前缀（如 /compatible-mode/v1）而 baseUrl 未含时补前缀
   * - 兼容新旧两种存储：baseUrl 裸域名 + chatPath 完整路径均可
   */
  private chatBaseOf(provider: { baseUrl?: string; config?: Record<string, unknown> | null }): string {
    const base = (provider.baseUrl || '').replace(/\/+$/, '');
    const chatPath = provider.config?.chatPath;
    if (typeof chatPath === 'string' && chatPath.startsWith('/')) {
      const p = chatPath.replace(/\/+$/, '');
      const suffix = '/chat/completions';
      if (p.endsWith(suffix) && p.length > suffix.length) {
        const prefix = p.slice(0, -suffix.length);
        if (prefix && !base.endsWith(prefix)) return base + prefix;
      }
    }
    return base;
  }

  /** 解析模型所属供应商直连目标（model -> provider.baseUrl + apiKey + upstreamModelId） */
  private async resolveUpstreamTarget(
    modelId: string,
  ): Promise<{ endpoint: string; apiKey: string; upstreamModelId: string; providerSlug: string } | null> {
    try {
      const model = await this.modelRepository.findOne({
        where: { modelId, isActive: true },
      });
      if (!model) return null;

      // 1) 模型绑定供应商优先（原逻辑）
      if (model.providerId) {
        const provider = await this.providerRepository.findOne({
          where: { id: model.providerId, status: 'active' },
        });
        if (provider && provider.apiKey && provider.baseUrl) {
          const decrypted = this.encryptionService.decryptAes(provider.apiKey);
          if (decrypted) {
            return {
              endpoint: this.chatBaseOf(provider),
              apiKey: decrypted,
              upstreamModelId: model.upstreamModelId || model.modelId,
              providerSlug: provider.slug,
            };
          }
        }
      }

      // 2) 全局中转回退（严格单全局；老数据无全局时回退第一个 active 供应商）
      const relay = await resolveRelay(this.providerRepository);
      if (relay && relay.apiKey && relay.baseUrl) {
        const decrypted = this.encryptionService.decryptAes(relay.apiKey);
        if (decrypted) {
          return {
            endpoint: this.chatBaseOf(relay),
            apiKey: decrypted,
            upstreamModelId: model.upstreamModelId || model.modelId,
            providerSlug: relay.slug,
          };
        }
      }

      // 3) 无供应商/中转 → 走 API Key 池（保持原行为）
      return null;
    } catch (err) {
      this.logger.warn(
        `解析供应商直连目标失败，回退 Key 池: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 解析请求模型：
   * - custom/<id> 或后台已上线的模型 → 原样使用（按后台供应商直连）
   * - OpenClaw 内部模型名（openclaw/default、gpt-5.5 等）或未知模型 → 用户默认对话模型
   * - 兜底 DEFAULT_LLM_MODEL / deepseek-chat
   */
  private async resolveModelId(modelFromRequest: string, userId: number): Promise<string> {
    // custom/<id> 显式指定 → 直接使用
    if (modelFromRequest.startsWith('custom/')) {
      const extracted = modelFromRequest.slice(7);
      if (extracted && extracted !== 'deep-shentong') return extracted;
    }

    // OpenClaw 内部模型别名（openclaw/default、openai/gpt-5.5 等）不视为用户显式选择：
    // 优先使用用户默认对话模型，避免后台启用了同名模型时把用户选择顶掉（桌面端一直回 gpt-5.5 的根因）
    if (this.isOpenClawInternalModel(modelFromRequest)) {
      const aliasUser = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'defaultChatModel'],
      });
      if (aliasUser?.defaultChatModel) return aliasUser.defaultChatModel;
    }

    // 请求模型是后台已上线的模型 → 原样使用（第三方 OpenAI 兼容客户端显式指定）
    if (modelFromRequest) {
      const enabled = await this.modelRepository.findOne({
        where: { modelId: modelFromRequest, isActive: true },
        select: ['modelId'],
      });
      if (enabled) return modelFromRequest;
    }

    // 否则（未知模型）→ 用户默认对话模型 → 兜底 DEFAULT_LLM_MODEL / deepseek-chat
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'defaultChatModel'],
    });
    if (user?.defaultChatModel) return user.defaultChatModel;
    return process.env.DEFAULT_LLM_MODEL || 'deepseek-chat';
  }

  /** OpenClaw 本地网关内部模型别名（openclaw/default 及内置默认模型 openai/gpt-5.5），不视为用户显式选择 */
  private isOpenClawInternalModel(model: string): boolean {
    const m = (model || '').trim().toLowerCase();
    return (
      m === 'openclaw' ||
      m.startsWith('openclaw/') ||
      m === 'deep-shentong' ||
      m === 'gpt-5.5' ||
      m === 'openai/gpt-5.5'
    );
  }

  // ============ 多模态网关（文本/图片/视频/语音统一静态 Key 鉴权 + 分类路由） ============

  /** 解析生成类模型：显式 model 优先（custom/<id> 或 <type>/<id>），否则取该类型默认（sortOrder 最小且启用） */
  private async resolveMediaModel(
    type: 'image' | 'video' | 'tts' | 'stt',
    requested?: string,
    userId?: number,
  ): Promise<ModelEntity> {
    if (requested) {
      const id = requested.startsWith('custom/')
        ? requested.slice(7)
        : requested.includes('/')
          ? requested.slice(requested.lastIndexOf('/') + 1)
          : requested;
      const model = await this.modelRepository.findOne({
        where: { modelId: id, isActive: true },
      });
      if (model && this.typeMatches(model.modelType, type)) return model;
      throw new BadRequestException(`生成模型不存在或类型不匹配: ${requested}`);
    }
    // 用户分类默认模型优先（设置页每类默认模型）
    if (userId) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'defaultModelImage', 'defaultModelVideo', 'defaultModelTts'],
      });
      const defaultId =
        type === 'image'
          ? user?.defaultModelImage
          : type === 'video'
            ? user?.defaultModelVideo
            : user?.defaultModelTts;
      if (defaultId) {
        const model = await this.modelRepository.findOne({
          where: { modelId: defaultId, isActive: true },
        });
        if (model && this.typeMatches(model.modelType, type)) return model;
      }
    }
    const models = await this.modelRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const model = models.find((m) => this.typeMatches(m.modelType, type));
    if (!model) throw new BadRequestException(`未上架可用的${type}生成模型`);
    return model;
  }

  private typeMatches(modelType: string | undefined, type: 'image' | 'video' | 'tts' | 'stt'): boolean {
    const t = (modelType || '').toLowerCase();
    if (type === 'image') return t === 'image' || t === 'image_edit';
    if (type === 'stt') return t === 'stt' || t === 'audio';
    return t === type;
  }

  /** 按张/按次预扣（图片、语音）；0 或负价为免费，跳过冻结 */
  private async freezePerCall(
    userId: number,
    price: number,
    sourceId: string,
  ): Promise<{ price: number; frozenTxnId: number | null }> {
    const level = await this.pricingService.getUserLevel(userId);
    const finalPrice = this.pricingService.applyDiscount(Math.max(Math.round(price), 0), level);
    if (finalPrice <= 0) return { price: 0, frozenTxnId: null };
    const frozen = await this.creditsService.freezeCredits(userId, finalPrice, 'media_generation' as any, sourceId);
    return { price: finalPrice, frozenTxnId: frozen.id };
  }

  /** 文生图/图生图（OpenAI 兼容 /v1/images/generations，同步） */
  async imagesGeneration(
    apiKey: string,
    body: { model?: string; prompt: string; size?: string; n?: number },
  ): Promise<{ created: number; data: Array<Record<string, unknown>> }> {
    const { userId } = await this.verifyApiKey(apiKey);
    const model = await this.resolveMediaModel('image', body.model, userId);
    const target = await this.resolveUpstreamTarget(model.modelId);
    if (!target) throw new BadRequestException('模型无可用中转凭据（Base URL / API Key）');
    const sourceId = `proxy-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.freezePerCall(userId, model.pricePerImage ?? 10, sourceId);
    try {
      const url = target.endpoint.replace(/\/+$/, '') + '/images/generations';
      const reqBody: Record<string, unknown> = { model: target.upstreamModelId, prompt: body.prompt, n: body.n ?? 1 };
      if (body.size) reqBody.size = body.size;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.apiKey}` },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(120000),
      });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
      if (!res.ok) throw new BadRequestException(`文生图上游错误(${res.status}): ${text.slice(0, 300)}`);
      if (frozenTxnId) { try { await this.creditsService.settleCredits(userId, frozenTxnId, price); } catch (_e) {} }
      const data = Array.isArray(json?.data) ? json.data : [];
      return { created: Math.floor(Date.now() / 1000), data };
    } catch (err) {
      if (frozenTxnId) { try { await this.creditsService.refundCredits(userId, frozenTxnId); } catch (_e) {} }
      throw err;
    }
  }

  /** 语音合成（OpenAI 兼容 /v1/audio/speech，同步，返回音频字节） */
  async audioSpeech(
    apiKey: string,
    body: { model?: string; input: string; voice?: string; speed?: number },
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { userId } = await this.verifyApiKey(apiKey);
    const model = await this.resolveMediaModel('tts', body.model, userId);
    const target = await this.resolveUpstreamTarget(model.modelId);
    if (!target) throw new BadRequestException('模型无可用中转凭据（Base URL / API Key）');
    const sourceId = `proxy-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.freezePerCall(userId, model.pricePerCall ?? 1, sourceId);
    try {
      const url = target.endpoint.replace(/\/+$/, '') + '/audio/speech';
      const reqBody: Record<string, unknown> = { model: target.upstreamModelId, input: body.input };
      if (body.voice) reqBody.voice = body.voice;
      if (body.speed !== undefined) reqBody.speed = body.speed;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.apiKey}` },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new BadRequestException(`语音合成上游错误(${res.status}): ${text.slice(0, 300)}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'audio/mpeg';
      if (frozenTxnId) { try { await this.creditsService.settleCredits(userId, frozenTxnId, price); } catch (_e) {} }
      return { buffer, contentType };
    } catch (err) {
      if (frozenTxnId) { try { await this.creditsService.refundCredits(userId, frozenTxnId); } catch (_e) {} }
      throw err;
    }
  }


  /** 文生视频/图生视频（异步任务制，复用 MediaGenerationService 的作业/退款链路） */
  async videoGeneration(
    apiKey: string,
    body: { model?: string; prompt: string; resolution?: string; duration?: number; fps?: number; inputImages?: string[] },
  ) {
    const { userId } = await this.verifyApiKey(apiKey);
    const model = await this.resolveMediaModel('video', body.model, userId);
    return this.mediaGeneration.generateVideo(userId, {
      modelId: model.modelId,
      prompt: body.prompt,
      resolution: body.resolution,
      duration: body.duration,
      fps: body.fps,
      inputImages: body.inputImages,
    });
  }

  /** 视频任务查询（异步轮询） */
  async videoJob(apiKey: string, id: number) {
    const { userId } = await this.verifyApiKey(apiKey);
    return this.mediaGeneration.getJob(userId, id);
  }


  /** 两步式专用文本模型：上传文件到模型配置的 submit_path，返回上游 file_id 并落映射表 */
  async uploadLlmFile(
    userId: number,
    modelName: string | undefined,
    file: Express.Multer.File,
  ): Promise<{ id: string; object: 'file'; bytes: number; filename: string; created_at: number }> {
    const modelId = await this.resolveModelId(modelName || '', userId);
    const model = await this.modelRepository.findOne({ where: { modelId, isActive: true } });
    if (!model) throw new BadRequestException('模型不存在或未上架');
    const gen = (model.generationParams ?? {}) as Record<string, unknown>;
    const submitPath = gen.submit_path ? String(gen.submit_path) : '';
    if (!submitPath) {
      throw new BadRequestException('该模型未配置文件上传接口（请在模型高级参数 generationParams.submit_path 中配置）');
    }
    const target = await this.resolveUpstreamTarget(modelId);
    if (!target) throw new BadRequestException('模型无可用中转凭据（Base URL / API Key）');
    const base = target.endpoint.replace(/\/+$/, '');
    // 防路径重复：base 已含 submit_path 前缀段时去重（如 base=.../compatible-mode/v1 + submit=/compatible-mode/v1/file-uploads）
    let url: string;
    if (submitPath.startsWith('http')) {
      url = submitPath;
    } else {
      const submit = submitPath.startsWith('/') ? submitPath : '/' + submitPath;
      let basePath = '/';
      try { basePath = new URL(base).pathname.replace(/\/+$/, '') || '/'; } catch { /* 忽略解析失败 */ }
      url = basePath !== '/' && submit.startsWith(basePath + '/') ? base + submit.slice(basePath.length) : base + submit;
    }
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'application/octet-stream' }),
      file.originalname || 'file.bin',
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${target.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
    if (!res.ok) {
      throw new BadRequestException(`文件上传上游错误(${res.status}): ${text.slice(0, 300)}`);
    }
    const idPath = gen.file_id_path ? String(gen.file_id_path) : 'file_id';
    const upstreamFileId = this.getByPathValue(json, idPath) ?? json?.id;
    if (!upstreamFileId) {
      throw new BadRequestException(`上游未返回文件 ID: ${text.slice(0, 300)}`);
    }
    await this.llmFileRepo.save(this.llmFileRepo.create({
      userId,
      modelId,
      upstreamFileId: String(upstreamFileId),
      fileName: file.originalname || undefined,
      fileSize: file.size || undefined,
    }));
    this.logger.log(`两步式文件上传成功: user=${userId} model=${modelId} file=${String(upstreamFileId)}`);
    return {
      id: String(upstreamFileId),
      object: 'file',
      bytes: file.size,
      filename: file.originalname,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /** 校验 chat 请求中的文件 ID 归属当前用户并返回上游 ID 列表 */
  private async resolveChatFileIds(userId: number, fileIds: string[]): Promise<string[]> {
    const resolved: string[] = [];
    for (const fid of fileIds) {
      const rec = await this.llmFileRepo.findOne({ where: { upstreamFileId: fid, userId } });
      if (!rec) {
        throw new BadRequestException(`文件不存在或不属于当前用户: ${String(fid).slice(0, 64)}`);
      }
      resolved.push(rec.upstreamFileId);
    }
    return resolved;
  }

  /** 按 llm-proxy token 上传两步式文件（控制器入口） */
  async uploadLlmFileByToken(
    token: string,
    model: string | undefined,
    file: Express.Multer.File,
  ) {
    const { userId } = await this.verifyApiKey(token);
    return this.uploadLlmFile(userId, model, file);
  }

  health() { return { status: 'ok', module: 'llm-proxy' }; }
}
