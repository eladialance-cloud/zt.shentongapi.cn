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
    return [{ id: 'deep-shentong', object: 'model', owned_by: 'shentong-ai' }];
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
    const modelId = await this.resolveModelId(body.model, userId);

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
      if (!model || !model.providerId) return null;
      const provider = await this.providerRepository.findOne({
        where: { id: model.providerId, status: 'active' },
      });
      if (!provider || !provider.apiKey || !provider.baseUrl) return null;
      const decrypted = this.encryptionService.decryptAes(provider.apiKey);
      if (!decrypted) return null;
      return {
        endpoint: provider.baseUrl,
        apiKey: decrypted,
        upstreamModelId: model.upstreamModelId || model.modelId,
        providerSlug: provider.slug,
      };
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

  health() { return { status: 'ok', module: 'llm-proxy' }; }
}
