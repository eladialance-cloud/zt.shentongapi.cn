import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { N8nInstanceEntity, N8nInstanceStatus } from '../entities/n8n-instance.entity';
import { N8nWorkflowEntity } from '../entities/n8n-workflow.entity';
import { CreateN8nInstanceDto, UpdateN8nInstanceDto } from '../dto/n8n-instance.dto';
import { PaginationQuery, PaginatedResult } from '../../../common/types/pagination.type';

/**
 * N8N 服务
 *
 * 管理用户的 N8N 实例配置、工作流同步与执行。
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly defaultBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(N8nInstanceEntity)
    private readonly instanceRepo: Repository<N8nInstanceEntity>,
    @InjectRepository(N8nWorkflowEntity)
    private readonly workflowRepo: Repository<N8nWorkflowEntity>,
  ) {
    this.defaultBaseUrl = this.configService.get<string>(
      'N8N_BASE_URL',
      'http://localhost:5678',
    );
  }

  health() {
    return { status: 'ok', module: 'n8n' };
  }

  // ============ Instance CRUD ============

  /**
   * 获取实例列表（分页）
   */
  async listInstances(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<N8nInstanceEntity>> {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: Record<string, unknown> = { userId };
    if (keyword) {
      where.name = Like(`%${keyword}%`);
    }
    const [list, total] = await this.instanceRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取实例详情
   */
  async getInstance(userId: number, id: number): Promise<N8nInstanceEntity> {
    const instance = await this.instanceRepo.findOne({
      where: { id, userId },
    });
    if (!instance) {
      throw new NotFoundException(`N8N instance #${id} not found`);
    }
    return instance;
  }

  /**
   * 创建实例
   */
  async createInstance(userId: number, dto: CreateN8nInstanceDto): Promise<N8nInstanceEntity> {
    const instance = this.instanceRepo.create({
      userId,
      name: dto.name,
      description: dto.description,
      baseUrl: dto.baseUrl,
      apiKey: dto.apiKey,
      webhookUrl: dto.webhookUrl,
      config: dto.config,
      status: 'pending',
    });
    return this.instanceRepo.save(instance);
  }

  /**
   * 更新实例
   */
  async updateInstance(
    userId: number,
    id: number,
    dto: UpdateN8nInstanceDto,
  ): Promise<N8nInstanceEntity> {
    const instance = await this.getInstance(userId, id);
    Object.assign(instance, dto);
    return this.instanceRepo.save(instance);
  }

  /**
   * 删除实例
   */
  async deleteInstance(userId: number, id: number): Promise<void> {
    const instance = await this.getInstance(userId, id);
    await this.instanceRepo.remove(instance);
  }

  // ============ Instance Lifecycle ============

  /**
   * 启动实例
   */
  async startInstance(userId: number, id: number): Promise<N8nInstanceEntity> {
    const instance = await this.getInstance(userId, id);
    instance.status = 'running';
    instance.lastStartedAt = new Date();
    this.logger.log(`Starting N8N instance #${id} for user ${userId}`);
    return this.instanceRepo.save(instance);
  }

  /**
   * 停止实例
   */
  async stopInstance(userId: number, id: number): Promise<N8nInstanceEntity> {
    const instance = await this.getInstance(userId, id);
    instance.status = 'stopped';
    instance.lastStoppedAt = new Date();
    this.logger.log(`Stopping N8N instance #${id} for user ${userId}`);
    return this.instanceRepo.save(instance);
  }

  /**
   * 重启实例
   */
  async restartInstance(userId: number, id: number): Promise<N8nInstanceEntity> {
    const instance = await this.getInstance(userId, id);
    instance.status = 'running';
    instance.lastStartedAt = new Date();
    this.logger.log(`Restarting N8N instance #${id} for user ${userId}`);
    return this.instanceRepo.save(instance);
  }

  /**
   * 获取实例状态
   */
  async getInstanceStatus(
    userId: number,
    id: number,
  ): Promise<{ id: number; status: N8nInstanceStatus; lastStartedAt?: Date; lastStoppedAt?: Date }> {
    const instance = await this.getInstance(userId, id);
    return {
      id: instance.id,
      status: instance.status,
      lastStartedAt: instance.lastStartedAt,
      lastStoppedAt: instance.lastStoppedAt,
    };
  }

  // ============ Workflow ============

  /**
   * 获取工作流列表
   */
  async listWorkflows(
    userId: number,
    instanceId: number,
  ): Promise<N8nWorkflowEntity[]> {
    // 确认实例归属当前用户
    await this.getInstance(userId, instanceId);
    return this.workflowRepo.find({
      where: { instanceId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取工作流详情
   */
  async getWorkflow(
    userId: number,
    instanceId: number,
    workflowId: string,
  ): Promise<N8nWorkflowEntity> {
    await this.getInstance(userId, instanceId);
    const workflow = await this.workflowRepo.findOne({
      where: { instanceId, userId, workflowId },
    });
    if (!workflow) {
      throw new NotFoundException(
        `Workflow '${workflowId}' not found in instance #${instanceId}`,
      );
    }
    return workflow;
  }

  /**
   * 触发 N8N 工作流
   *
   * @param userId 用户 ID
   * @param instanceId N8N 实例 ID（用于多实例路由，目前仅日志记录）
   * @param workflowId N8N 工作流 Webhook ID
   * @param input 工作流输入数据
   * @returns 工作流执行结果
   */
  async triggerWorkflow(
    userId: number,
    instanceId: number,
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    // 路径注入防护：workflowId 仅允许字母数字和连字符
    if (!/^[a-zA-Z0-9_-]+$/.test(workflowId)) {
      throw new BadRequestException(
        `Invalid workflowId: '${workflowId}'. Only alphanumeric, hyphens, and underscores are allowed.`,
      );
    }

    // 获取实例以使用其 baseUrl（优先实例配置，回退全局默认值）
    const instance = await this.getInstance(userId, instanceId);
    const baseUrl = instance.baseUrl || this.defaultBaseUrl;
    const webhookUrl = `${baseUrl}/webhook/${workflowId}`;

    this.logger.log(
      `Triggering N8N workflow '${workflowId}' (instance: ${instanceId}) for user ${userId}`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...input,
          // 注入用户上下文供 N8N 工作流使用
          _meta: { userId, instanceId, timestamp: new Date().toISOString() },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new BadGatewayException(
          `N8N webhook returned ${response.status} ${response.statusText}: ${errorText}`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        return await response.json();
      }

      // 非 JSON 响应返回纯文本
      return await response.text();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `N8N workflow '${workflowId}' timed out after 60s`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
