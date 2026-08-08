import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditsService } from '../../credits/services/credits.service';
import { CreditTransactionEntity } from '../../credits/entities/credit-transaction.entity';
import { WorkflowEntity } from '../../admin-workflow/entities/workflow.entity';
import { ModelEntity } from '../../model/entities/model.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { LlmProxyService } from './llm-proxy.service';

/**
 * OpenClaw 本地直达对话记账服务（v2：扣费收敛到 llm-proxy）
 *
 * 对话本体由 llm-proxy 按「后台定价 × 实际 token」冻结+结算（供应商 Key 在服务器，用户零配置），
 * 本服务只负责：
 * - tool     : OpenClaw 调用了管理后台有定价的工作流时，按 pricePerExecution 额外扣费
 * - proxy-key: 返回/生成用户 llm-proxy 静态 Key（桌面端注入 OpenClaw 用）
 * - preferred-model: 保存用户默认对话模型（llm-proxy 收到 OpenClaw 内部模型名时按此解析）
 */
@Injectable()
export class ChatAccountingService {
  private readonly logger = new Logger(ChatAccountingService.name);

  constructor(
    private readonly credits: CreditsService,
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(ModelEntity)
    private readonly modelRepo: Repository<ModelEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly llmProxy: LlmProxyService,
  ) {}

  /** 工具扣费：工作流定价 pricePerExecution，0 免费；定价>0 冻结后立即结算 */
  async chargeTool(
    userId: number,
    workflowId: number,
  ): Promise<{ charged: number; price: number }> {
    const wf = await this.workflowRepo.findOne({ where: { id: workflowId } });
    if (!wf) throw new NotFoundException('工作流不存在');
    const price = wf.pricePerExecution || 0;
    if (price <= 0) return { charged: 0, price };
    const txn = await this.credits.freezeCredits(
      userId,
      price,
      'llm_proxy',
      `openclaw_tool_${Date.now()}`,
    );
    await this.credits.settleCredits(userId, txn.id, price);
    return { charged: price, price };
  }

  /** 返回/生成用户 llm-proxy 静态 Key（桌面端登录后注入 OpenClaw 的 openai provider） */
  async getOrCreateProxyKey(userId: number): Promise<{ llmProxyKey: string }> {
    const llmProxyKey = await this.llmProxy.ensureLlmProxyKey(userId);
    return { llmProxyKey };
  }

  /** 保存用户默认对话模型（必须是后台已上线的对话模型） */
  async setPreferredModel(
    userId: number,
    modelId: string,
  ): Promise<{ modelId: string }> {
    if (!modelId || typeof modelId !== 'string') {
      throw new BadRequestException('模型 ID 不能为空');
    }
    const model = await this.modelRepo.findOne({ where: { modelId, isActive: true } });
    if (!model) throw new BadRequestException('模型不存在或未启用');
    await this.userRepo.update(userId, { defaultChatModel: modelId });
    this.logger.log(`用户 ${userId} 默认对话模型 -> ${modelId}`);
    return { modelId };
  }
}