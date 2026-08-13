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
              endpoint: provider.baseUrl,
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
            endpoint: relay.baseUrl,
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

    // 请求模型是后台已上线的模型 → 直接使用
    if (modelFromRequest) {
      const enabled = await this.modelRepository.findOne({
        where: { modelId: modelFromRequest, isActive: true },
        select: ['modelId'],
      });
      if (enabled) return modelFromRequest;
    }

    // 否则（OpenClaw 内部模型名 openclaw/default 等或未知模型）→ 用户默认对话模型 → 兜底
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'defaultChatModel'],
    });
    if (user?.defaultChatModel) return user.defaultChatModel;
    return process.env.DEFAULT_LLM_MODEL || 'deepseek-chat';
  }

  // ============ 多模态网关（文本/图片/视频/语音统一静态 Key 鉴权 + 分类路由） ============

  /** 解析生成类模型：显式 model 优先（custom/<id> 或 <type>/<id>），否则取该类型默认（sortOrder 最小且启用） */
  private async resolveMediaModel(
    type: 'image' | 'video' | 'tts',
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

  private typeMatches(modelType: string | undefined, type: 'image' | 'video' | 'tts'): boolean {
    const t = (modelType || '').toLowerCase();
    if (type === 'image') return t === 'image' || t === 'image_edit';
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
    body: { model?: string; prompt: string; resolution?: string; duration?: number; fps?: number },
  ) {
    const { userId } = await this.verifyApiKey(apiKey);
    const model = await this.resolveMediaModel('video', body.model, userId);
    return this.mediaGeneration.generateVideo(userId, {
      modelId: model.modelId,
      prompt: body.prompt,
      resolution: body.resolution,
      duration: body.duration,
      fps: body.fps,
    });
  }

  /** 视频任务查询（异步轮询） */
  async videoJob(apiKey: string, id: number) {
    const { userId } = await this.verifyApiKey(apiKey);
    return this.mediaGeneration.getJob(userId, id);
  }

  health() { return { status: 'ok', module: 'llm-proxy' }; }
}
