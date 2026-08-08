import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenClawInstanceEntity } from '../entities/openclaw-instance.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { RegisterInstanceDto, UpdateConfigDto } from '../dto/openclaw.dto';
import { ConfigService } from '@nestjs/config';
import { SyncGateway } from '../../sync/sync.gateway';


@Injectable()
export class OpenClawService {
  private readonly logger = new Logger(OpenClawService.name);

  constructor(
    @InjectRepository(OpenClawInstanceEntity)
    private instanceRepo: Repository<OpenClawInstanceEntity>,
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
    private configService: ConfigService,
    private syncGateway: SyncGateway,
  ) {}

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

  health() {
    return { status: 'ok', module: 'openclaw' };
  }
}
