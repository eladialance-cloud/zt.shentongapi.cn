import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelEntity } from '../../model/entities/model.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { CreditAccountEntity } from '../entities/credit-account.entity';
import { RedisService } from '../../../common/services/redis.service';
import { UserService } from '../../user/services/user.service';

/**
 * 统一计费服务
 *
 * 定价策略：
 * - model: 使用模型表 pricePer1kInput / pricePer1kOutput 换算为积分
 * - agent: 使用 Agent 自身 pricePerCall / pricePerToken
 * - hybrid: 模型价格 + Agent 加价（Agent pricePerCall 作为附加费）
 *
 * 会员折扣：根据用户等级（MembershipPlan.level）给予消耗倍率优惠
 * 价格单位：模型表价格已按「积分/千token」存储（v0.7.0 迁移后不再乘汇率）
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private static readonly CACHE_KEY = 'cache:pricing:model:';
  private static readonly CACHE_TTL = 300; // 5 分钟
  static readonly CREDITS_RATE = 100; // 1 元 = 100 积分

  constructor(
    @InjectRepository(ModelEntity)
    private readonly modelRepo: Repository<ModelEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(CreditAccountEntity)
    private readonly accountRepo: Repository<CreditAccountEntity>,
    private readonly redis: RedisService,
    private readonly userService: UserService,
  ) {}

  /**
   * 预估费用（预扣用）
   *
   * 策略：
   * - model: 模型表价格 × 预估 token 量（无预估则取默认 2000 input + 500 output）
   * - agent: agent.pricePerCall（默认 5 积分）
   * - hybrid: 模型价格 + agent.pricePerCall
   *
   * @param agent Agent 实体（含 modelId, pricingStrategy, pricePerCall 等）
   * @param estimatedTokens 预估 token 用量（可选）
   */
  async estimateCost(
    agent: AgentEntity | null,
    estimatedTokens?: { input: number; output: number },
  ): Promise<number> {
    if (!agent) return 5;

    const strategy = agent.pricingStrategy || 'model';
    const defaultTokens = { input: 2000, output: 500 };
    const tokens = estimatedTokens || defaultTokens;

    switch (strategy) {
      case 'agent': {
        return agent.pricePerCall || 5;
      }
      case 'hybrid': {
        const modelCost = await this.calculateModelCost(agent.modelId, tokens);
        const agentSurcharge = agent.pricePerCall || 0;
        return modelCost + agentSurcharge;
      }
      case 'model':
      default: {
        return await this.calculateModelCost(agent.modelId, tokens);
      }
    }
  }

  /**
   * 计算实际费用（结算用）
   *
   * @param agent Agent 实体
   * @param usage 实际 token 用量
   */
  async calculateActualCost(
    agent: AgentEntity | null,
    usage: { input: number; output: number; total: number },
  ): Promise<{ cost: number; modelId?: string }> {
    if (!agent) return { cost: 5 };

    const strategy = agent.pricingStrategy || 'model';

    switch (strategy) {
      case 'agent': {
        if (agent.pricePerCall > 0) {
          return { cost: agent.pricePerCall, modelId: agent.modelId };
        }
        if (agent.pricePerToken) {
          const inputCost = Math.ceil(
            usage.input * agent.pricePerToken.input,
          );
          const outputCost = Math.ceil(
            usage.output * agent.pricePerToken.output,
          );
          return { cost: inputCost + outputCost, modelId: agent.modelId };
        }
        return { cost: 5, modelId: agent.modelId };
      }
      case 'hybrid': {
        const modelCost = await this.calculateModelCost(agent.modelId, {
          input: usage.input,
          output: usage.output,
        });
        const agentSurcharge = agent.pricePerCall || 0;
        return { cost: modelCost + agentSurcharge, modelId: agent.modelId };
      }
      case 'model':
      default: {
        const modelCost = await this.calculateModelCost(agent.modelId, {
          input: usage.input,
          output: usage.output,
        });
        return { cost: modelCost, modelId: agent.modelId };
      }
    }
  }

  /**
   * 根据模型表价格计算积分费用
   *
   * 公式：
   *   inputCost = (inputTokens / 1000) × pricePer1kInput
   *   outputCost = (outputTokens / 1000) × pricePer1kOutput
   *   total = ceil(inputCost + outputCost)
   *
   * 如果模型不存在或价格为 null，回退到默认 5 积分
   */
  async calculateModelCost(
    modelId: string,
    tokens: { input: number; output: number },
  ): Promise<number> {
    const model = await this.getModelCached(modelId);
    // 模型未配置价格(null/undefined)时回退默认 5 积分；0 是合法价格(免费模型)
    if (!model || model.pricing?.pricePer1kInput == null || model.pricing?.pricePer1kOutput == null) {
      return 5; // 默认费用
    }

    const inputPrice = Number(model.pricing?.pricePer1kInput);
    const outputPrice = Number(model.pricing?.pricePer1kOutput);

    // v0.7.0 后模型表价格已按「积分/千token」存储，不再乘汇率（CREDITS_RATE）
    const inputCost = (tokens.input / 1000) * inputPrice;
    const outputCost = (tokens.output / 1000) * outputPrice;

    return Math.ceil(inputCost + outputCost);
  }

  /**
   * 获取用户会员等级折扣倍率
   *
   * level 0 = 1.0（无折扣）
   * level 1 = 0.95（95 折）
   * level 2 = 0.9（9 折）
   * level 3 = 0.85（85 折）
   * level 4+ = 0.8（8 折）
   */
  getUserDiscount(userLevel: number): number {
    if (userLevel <= 0) return 1.0;
    if (userLevel === 1) return 0.95;
    if (userLevel === 2) return 0.9;
    if (userLevel === 3) return 0.85;
    return 0.8;
  }

  /**
   * 应用会员折扣后的最终费用
   */
  applyDiscount(cost: number, userLevel: number): number {
    const discount = this.getUserDiscount(userLevel);
    return Math.ceil(cost * discount);
  }

  /**
   * 获取用户会员等级
   * 从 UserEntity.level 字段读取
   */
  async getUserLevel(userId: number): Promise<number> {
    try {
      const user = await this.userService.findById(userId);
      return user.level || 0;
    } catch {
      this.logger.warn(`Failed to get user level for userId=${userId}, defaulting to 0`);
      return 0;
    }
  }

  /**
   * 带缓存的模型查询
   */
  private async getModelCached(modelId: string): Promise<ModelEntity | null> {
    const cacheKey = `${PricingService.CACHE_KEY}${modelId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as ModelEntity;
      } catch {
        // 缓存损坏，继续查 DB
      }
    }
    const model = await this.modelRepo.findOne({
      where: { modelId },
      relations: { pricing: true },
    });
    if (model) {
      // 只缓存价格相关字段（避免泄露 apiKey）
      const safeModel = {
        ...model,
        credentials: undefined,
      } as ModelEntity;
      await this.redis.set(cacheKey, JSON.stringify(safeModel), PricingService.CACHE_TTL);
    }
    return model;
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'pricing', creditsRate: PricingService.CREDITS_RATE };
  }
}
