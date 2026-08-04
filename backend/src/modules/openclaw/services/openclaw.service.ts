import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OpenClawInstanceEntity } from '../entities/openclaw-instance.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { RegisterInstanceDto, UpdateConfigDto } from '../dto/openclaw.dto';
import { ConfigService } from '@nestjs/config';
import { CreditsService } from '../../credits/services/credits.service';
import { PricingService } from '../../credits/services/pricing.service';
import { SyncGateway } from '../../sync/sync.gateway';

/** 预冻结积分估算值（较高估算避免余额不足） */
const ESTIMATED_COST = 20;
/** 心跳检查间隔（毫秒） */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** 心跳请求超时（毫秒） */
const HEARTBEAT_TIMEOUT_MS = 5_000;

@Injectable()
export class OpenClawService implements OnModuleInit {
  private readonly logger = new Logger(OpenClawService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(OpenClawInstanceEntity)
    private instanceRepo: Repository<OpenClawInstanceEntity>,
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
    private configService: ConfigService,
    private creditsService: CreditsService,
    private pricingService: PricingService,
    private syncGateway: SyncGateway,
  ) {}

  onModuleInit() {
    // 启动定时心跳检查（每 30 秒）
    this.heartbeatTimer = setInterval(() => {
      this.heartbeatCheck().catch((err) => {
        this.logger.error(`心跳检查异常: ${(err as Error).message}`);
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.logger.log('OpenClaw 心跳检查已启动');
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============ 实例管理 ============

  async listInstances(userId: number): Promise<OpenClawInstanceEntity[]> {
    return this.instanceRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async registerInstance(
    userId: number,
    dto: RegisterInstanceDto,
  ): Promise<OpenClawInstanceEntity> {
    // 检查是否已注册
    const existing = await this.instanceRepo.findOne({
      where: { openclawAgentId: dto.openclawAgentId },
    });
    if (existing) {
      throw new BadRequestException('该 OpenClaw Agent 已注册');
    }

    const instance = this.instanceRepo.create({
      userId,
      agentId: dto.agentId,
      openclawAgentId: dto.openclawAgentId,
      endpoint: dto.endpoint || 'http://localhost:8080',
      status: 'offline',
      config: dto.config,
    });
    const saved = await this.instanceRepo.save(instance);

    // 同步 Agent 表的 openclawAgentId 字段
    if (dto.agentId) {
      await this.agentRepo.update(dto.agentId, {
        openclawAgentId: dto.openclawAgentId,
        syncStatus: 'pending',
      });
    }

    return saved;
  }

  async deleteInstance(userId: number, id: number): Promise<void> {
    const instance = await this.getInstance(userId, id);
    await this.instanceRepo.delete(id);

    // 清除 Agent 表的 openclawAgentId
    if (instance.agentId) {
      await this.agentRepo.update(instance.agentId, {
        openclawAgentId: undefined,
        syncStatus: 'pending',
      });
    }
  }

  async getInstance(userId: number, id: number): Promise<OpenClawInstanceEntity> {
    const instance = await this.instanceRepo.findOne({
      where: { id, userId },
    });
    if (!instance) {
      throw new NotFoundException('OpenClaw 实例不存在');
    }
    return instance;
  }

  // ============ 同步 ============

  async syncAgent(userId: number, id: number): Promise<{ success: boolean; message: string }> {
    const instance = await this.getInstance(userId, id);
    if (!instance.agentId) {
      throw new BadRequestException('该实例未关联 Agent');
    }

    const agent = await this.agentRepo.findOne({
      where: { id: instance.agentId },
    });
    if (!agent) {
      throw new NotFoundException('关联的 Agent 不存在');
    }

    try {
      // 调用 OpenClaw API 更新 Agent 配置
      const response = await this.fetchWithTimeout(
        `${instance.endpoint}/api/agents/${instance.openclawAgentId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agent.name, systemPrompt: agent.systemPrompt, model: agent.modelId,
            modelConfig: agent.modelConfig ?? undefined, outputRule: agent.outputRule ?? undefined,
            useCodex: agent.useCodex, description: agent.description ?? undefined,
            tools: agent.allowedPluginIds ?? undefined,
          }),
        },
        10000,
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`OpenClaw API error ${response.status}: ${errorText}`);
      }

      await this.agentRepo.update(agent.id, { syncStatus: 'synced', syncError: undefined });
      await this.instanceRepo.update(id, { status: 'online', lastHeartbeatAt: new Date() });
      this.pushStatus(userId, id, { agentId: agent.id, status: 'online', syncStatus: 'synced' });

      return { success: true, message: '同步成功' };
    } catch (err) {
      const errorMsg = (err as Error).message?.slice(0, 512) || '同步失败';
      await this.agentRepo.update(agent.id, { syncStatus: 'failed', syncError: errorMsg });
      await this.instanceRepo.update(id, { status: 'error' });
      this.logger.error(`同步 Agent 到 OpenClaw 失败: ${errorMsg}`);
      this.pushStatus(userId, id, { agentId: agent.id, status: 'error', syncStatus: 'failed', error: errorMsg });
      return { success: false, message: errorMsg };
    }
  }

  /** 带超时的 fetch 封装 */
  private async fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 5000): Promise<Response> {
    return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  }

  /** 推送状态变更到 WebSocket */
  private pushStatus(userId: number, instanceId: number, extra: Record<string, unknown>) {
    this.syncGateway.pushToUser(userId, 'openclaw:status-changed', { instanceId, timestamp: new Date().toISOString(), ...extra });
  }

  // ============ 状态查询 ============

  async getStatus(userId: number, id: number): Promise<{ status: string; endpoint: string; lastHeartbeatAt: Date | undefined }> {
    const instance = await this.getInstance(userId, id);
    try {
      const response = await this.fetchWithTimeout(`${instance.endpoint}/api/health`);
      if (response.ok) {
        await this.instanceRepo.update(id, { status: 'online', lastHeartbeatAt: new Date() });
        return { status: 'online', endpoint: instance.endpoint, lastHeartbeatAt: new Date() };
      }
    } catch { /* ping 失败，保持原状态 */ }
    return { status: instance.status, endpoint: instance.endpoint, lastHeartbeatAt: instance.lastHeartbeatAt };
  }

  // ============ 健康检查 ============

  async healthCheck(): Promise<{ status: string; endpoint: string }> {
    const defaultEndpoint = this.configService.get<string>('OPENCLAW_ENDPOINT', 'http://localhost:8080');
    try {
      const response = await this.fetchWithTimeout(`${defaultEndpoint}/api/health`);
      return { status: response.ok ? 'online' : 'offline', endpoint: defaultEndpoint };
    } catch {
      return { status: 'offline', endpoint: defaultEndpoint };
    }
  }

  // ============ 配置更新 ============

  async updateConfig(
    userId: number,
    id: number,
    dto: UpdateConfigDto,
  ): Promise<OpenClawInstanceEntity> {
    const instance = await this.getInstance(userId, id);
    if (dto.endpoint !== undefined) instance.endpoint = dto.endpoint;
    if (dto.config !== undefined) instance.config = dto.config;
    return this.instanceRepo.save(instance);
  }

  // ============ Agent 对话调用（流式） ============

  /** 按后端 Agent ID 调用 OpenClaw（团队调用时使用） */
  async invokeAgentByAgentId(
    userId: number,
    agentId: number,
    message: string,
  ): Promise<unknown> {
    const instance = await this.instanceRepo.findOne({
      where: { userId, agentId },
    });
    if (!instance) {
      throw new NotFoundException(
        'Agent ' + agentId + ' 未注册 OpenClaw 实例',
      );
    }
    return this.invokeAgent(userId, instance.openclawAgentId, message);
  }

  async invokeAgent(
    userId: number,
    openclawAgentId: string,
    message: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<unknown> {
    // 查找实例
    const instance = await this.instanceRepo.findOne({
      where: { openclawAgentId },
    });
    if (!instance) {
      throw new NotFoundException(`OpenClaw Agent ${openclawAgentId} 未注册`);
    }

    // 查找关联的 Agent 实体（用于定价计算）
    const agent = instance.agentId
      ? await this.agentRepo.findOne({ where: { id: instance.agentId } })
      : null;

    // 积分预扣（使用较高估算值避免余额不足）
    let estimatedCost = ESTIMATED_COST;
    try {
      estimatedCost = await this.pricingService.estimateCost(agent);
      // 使用估算值与固定值中较大者，确保预冻结足够
      estimatedCost = Math.max(estimatedCost, ESTIMATED_COST);
    } catch {
      // 定价查询失败，使用默认估算值
      this.logger.warn(`定价查询失败，使用默认估算值 ${ESTIMATED_COST}`);
    }

    let frozenTxnId: number | null = null;
    try {
      const freezeTxn = await this.creditsService.freezeCredits(
        userId,
        estimatedCost,
        'model_call',
        `openclaw_${openclawAgentId}`,
      );
      frozenTxnId = freezeTxn.id;
    } catch {
      throw new BadRequestException('积分余额不足，请充值');
    }

    try {
      // 调用 OpenClaw API
      const response = await fetch(
        `${instance.endpoint}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: openclawAgentId,
            message,
            history: history || [],
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`OpenClaw chat API error ${response.status}: ${errorText}`);
      }

      // 解析响应，尝试提取 token usage
      const responseText = await response.text();
      let responseData: unknown;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // 非 JSON 响应，直接返回文本
        responseData = { text: responseText };
      }

      // 计算实际费用
      let actualCost = estimatedCost;
      const usage = (responseData as any)?.usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokens = usage.total_tokens ?? (promptTokens + completionTokens);

        if (totalTokens > 0) {
          try {
            const costResult = await this.pricingService.calculateActualCost(
              agent,
              { input: promptTokens, output: completionTokens, total: totalTokens },
            );
            actualCost = costResult.cost;
          } catch {
            this.logger.warn('按 token 用量计算费用失败，使用估算值结算');
          }
        }
      }

      // 结算积分（多退少补）
      if (frozenTxnId) {
        try {
          await this.creditsService.settleCredits(userId, frozenTxnId, actualCost);
        } catch (err) {
          this.logger.error(`OpenClaw 积分结算失败: ${(err as Error).message}`);
        }
      }

      return responseData;
    } catch (err) {
      // 调用失败，退回冻结积分
      if (frozenTxnId) {
        try {
          await this.creditsService.refundCredits(userId, frozenTxnId);
        } catch (refundErr) {
          this.logger.error(`OpenClaw 积分退款失败: ${(refundErr as Error).message}`);
        }
      }
      throw err;
    }
  }

  // ============ 拉取 Agent 状态 ============

  /**
   * 从 OpenClaw 实例拉取 Agent 最新状态
   * 更新 openclaw_instances 表的 lastHeartbeatAt 和 status
   */
  async pullAgentStatus(userId: number, instanceId: number): Promise<{ status: string; lastHeartbeatAt: Date; agentOnline: boolean }> {
    const instance = await this.getInstance(userId, instanceId);

    try {
      const response = await this.fetchWithTimeout(
        `${instance.endpoint}/api/agents/${instance.openclawAgentId}/status`,
        { headers: { Authorization: `Bearer ${instance.config?.['apiKey'] ?? ''}` } },
        HEARTBEAT_TIMEOUT_MS,
      );

      if (response.ok) {
        const status = await response.json() as { online?: boolean; lastActiveAt?: string };
        instance.lastHeartbeatAt = new Date();
        instance.status = status.online ? 'online' : 'offline';
        await this.instanceRepo.save(instance);
        this.pushStatus(userId, instanceId, { agentId: instance.agentId, status: instance.status, agentOnline: status.online, lastActiveAt: status.lastActiveAt });
        return { status: instance.status, lastHeartbeatAt: instance.lastHeartbeatAt, agentOnline: status.online ?? false };
      }

      instance.status = 'error';
      await this.instanceRepo.save(instance);
      this.logger.warn(`拉取 Agent 状态失败: HTTP ${response.status} (instance=${instanceId})`);
      return { status: 'error', lastHeartbeatAt: instance.lastHeartbeatAt ?? new Date(), agentOnline: false };
    } catch (err) {
      instance.status = 'offline';
      await this.instanceRepo.save(instance);
      this.logger.warn(`拉取 Agent 状态失败: ${(err as Error).message}`);
      return { status: 'offline', lastHeartbeatAt: instance.lastHeartbeatAt ?? new Date(), agentOnline: false };
    }
  }

  // ============ 定时心跳检查 ============

  /**
   * 定时心跳检查：每 30 秒检查所有在线实例的连通性
   * 使用 setInterval 在 onModuleInit 中启动
   */
  async heartbeatCheck(): Promise<void> {
    const instances = await this.instanceRepo.find({ where: { status: In(['online', 'error']) } });

    for (const instance of instances) {
      const previousStatus = instance.status;
      try {
        const response = await this.fetchWithTimeout(`${instance.endpoint}/api/health`, undefined, HEARTBEAT_TIMEOUT_MS);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        instance.lastHeartbeatAt = new Date();
        instance.status = 'online';
      } catch {
        instance.status = 'offline';
      }

      if (instance.status !== previousStatus) {
        await this.instanceRepo.save(instance);
        this.pushStatus(instance.userId, instance.id, { openclawAgentId: instance.openclawAgentId, previousStatus, status: instance.status });
        this.logger.log(`实例 #${instance.id} 状态变更: ${previousStatus} → ${instance.status}`);
      } else if (instance.status === 'online') {
        await this.instanceRepo.update(instance.id, { lastHeartbeatAt: instance.lastHeartbeatAt });
      }
    }
  }

  health() {
    return { status: 'ok', module: 'openclaw' };
  }
}
