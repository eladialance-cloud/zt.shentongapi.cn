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
import * as crypto from 'crypto';

@Injectable()
export class LlmProxyService {
  private readonly logger = new Logger(LlmProxyService.name);
  private readonly KEY_PREFIX = 'sk-shentong-';

  constructor(
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
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
  ): Promise<{ stream: boolean; iterator: AsyncGenerator<string, void, unknown> }> {
    const { userId } = await this.verifyApiKey(apiKey);
    const modelId = this.resolveModelId(body.model);

    const provider = this.llmClient.getProviderFromModelId(modelId);
    const apiKeyEntry = await this.apiKeyPoolService.getNextAvailableKey(provider);
    if (!apiKeyEntry) throw new BadRequestException(`No available ${provider} API Key`);

    let decryptedKey = '';
    try {
      decryptedKey = this.encryptionService.decryptAes(apiKeyEntry.apiKey);
    } catch {
      throw new BadRequestException('API Key decryption failed');
    }

    const userLevel = await this.pricingService.getUserLevel(userId);
    let frozenTxnId: number | null = null;
    try {
      const freezeTxn = await this.creditsService.freezeCredits(
        userId, 10, 'llm_proxy', `proxy_${modelId}_${Date.now()}`,
      );
      frozenTxnId = freezeTxn.id;
    } catch {
      throw new ForbiddenException('Insufficient credits');
    }

    const isStream = body.stream ?? false;
    const self = this;
    const entryId = apiKeyEntry.id;

    async function* generate(): AsyncGenerator<string, void, unknown> {
      const queue: string[] = [];
      let done = false;
      let error: Error | null = null;
      let resolveWait: (() => void) | null = null;
      const push = (data: string) => { queue.push(data); if (resolveWait) { const r = resolveWait; resolveWait = null; r(); } };

      void (async () => {
        try {
          let fullResponse = '';
          await self.llmClient.streamChat(
            {
              model: modelId,
              apiKey: decryptedKey,
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
              onDone: async (u: { input: number; output: number; total: number }, _resp: unknown) => {
                const { cost } = await self.pricingService.calculateActualCost(null, u);
                const finalCost = self.pricingService.applyDiscount(cost, userLevel);
                if (frozenTxnId && finalCost > 0) {
                  try { await self.creditsService.settleCredits(userId, frozenTxnId, finalCost); } catch (_e) {}
                } else if (frozenTxnId) {
                  try { await self.creditsService.refundCredits(userId, frozenTxnId); } catch (_e) {}
                }
                try { await self.apiKeyPoolService.deductQuota(entryId, u.total); } catch (_e) {}

                if (isStream) {
                  push(`data: ${JSON.stringify({
                    id: `chatcmpl-${Date.now()}`, object: 'chat.completion.chunk',
                    model: body.model,
                    choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
                  })}\n\n`);
                  push('data: [DONE]\n\n');
                } else {
                  push(`data: ${JSON.stringify({
                    id: `chatcmpl-${Date.now()}`, object: 'chat.completion',
                    model: body.model,
                    choices: [{ message: { role: 'assistant', content: fullResponse }, finish_reason: 'stop', index: 0 }],
                    usage: { prompt_tokens: u.input, completion_tokens: u.output, total_tokens: u.total },
                  })}\n\n`);
                  push('data: [DONE]\n\n');
                }
                done = true;
                if (resolveWait) { const r = resolveWait; resolveWait = null; r(); }
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

  private resolveModelId(modelFromRequest: string): string {
    if (modelFromRequest.startsWith('custom/')) {
      const extracted = modelFromRequest.slice(7);
      if (extracted && extracted !== 'deep-shentong') return extracted;
    }
    if (modelFromRequest && !modelFromRequest.startsWith('custom/')) return modelFromRequest;
    return process.env.DEFAULT_LLM_MODEL || 'deepseek-chat';
  }

  health() { return { status: 'ok', module: 'llm-proxy' }; }
}
