import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HermesInstanceEntity } from '../entities/hermes-instance.entity';
import { HermesCallLogEntity } from '../entities/hermes-call-log.entity';
import { HermesSkillEntity } from '../entities/hermes-skill.entity';
import { HermesSkillRatingEntity } from '../entities/hermes-skill-rating.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { McpService } from '../../mcp/services/mcp.service';
import { N8nService } from '../../n8n/services/n8n.service';
import { OpenClawService } from '../../openclaw/services/openclaw.service';
import { SkillRunnerService } from './skill-runner.service';
import { InstanceWorkerService } from './instance-worker.service';
import { SyncGateway } from '../../sync/sync.gateway';
import { parsePaging, paginate } from '../../../common/utils/query.util';
import { CreateInstanceDto, PaginationDto, ExecuteTaskDto, RateSkillDto, CreateSkillDto } from '../dto/hermes.dto';

export interface HermesTask {
  userId: number;
  instanceId: number;
  callType: 'skill_execute' | 'tool_call' | 'agent_invoke' | 'workflow_run';
  target: string;
  input: Record<string, unknown>;
  pricePerMinute: number;
  // 各类型特定参数
  skillId?: number;
  serverId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  agentId?: number;
  n8nInstanceId?: number;
  workflowId?: string;
}

/** 默认任务超时 60 秒 */
const DEFAULT_TASK_TIMEOUT_MS = 60_000;
/** 默认预冻结积分（按分钟计费时先冻结估算值） */
const DEFAULT_ESTIMATED_MINUTES = 5;

@Injectable()
export class HermesService {
  private readonly logger = new Logger(HermesService.name);

  constructor(
    @InjectRepository(HermesInstanceEntity)
    private instanceRepo: Repository<HermesInstanceEntity>,
    @InjectRepository(HermesCallLogEntity)
    private callLogRepo: Repository<HermesCallLogEntity>,
    @InjectRepository(HermesSkillEntity)
    private skillRepo: Repository<HermesSkillEntity>,
    @InjectRepository(HermesSkillRatingEntity)
    private ratingRepo: Repository<HermesSkillRatingEntity>,
    private creditsService: CreditsService,
    private mcpService: McpService,
    private n8nService: N8nService,
    private openClawService: OpenClawService,
    private skillRunner: SkillRunnerService,
    private instanceWorker: InstanceWorkerService,
    private syncGateway: SyncGateway,
  ) {}

  // ============ 实例管理 ============

  async listInstances(userId: number): Promise<HermesInstanceEntity[]> {
    return this.instanceRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async createInstance(
    userId: number,
    dto: CreateInstanceDto,
  ): Promise<HermesInstanceEntity> {
    const instance = this.instanceRepo.create({
      userId,
      name: dto.name,
      status: 'stopped',
      skillCount: dto.skillIds?.length || 0,
      skillIds: dto.skillIds || [],
    });
    return this.instanceRepo.save(instance);
  }

  async getInstance(
    userId: number,
    instanceId: number,
  ): Promise<HermesInstanceEntity> {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId, userId },
    });
    if (!instance) {
      throw new NotFoundException('Hermes 实例不存在');
    }
    return instance;
  }

  /** 推送状态变更到 WebSocket */
  private pushStatus(userId: number, instanceId: number, status: string) {
    this.syncGateway.pushToUser(userId, 'hermes:status-changed', {
      instanceId, status, timestamp: new Date().toISOString(),
    });
  }

  async startInstance(userId: number, instanceId: number): Promise<HermesInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);
    if (instance.status === 'running') throw new BadRequestException('实例已在运行中');

    instance.status = 'running';
    instance.startedAt = new Date();
    instance.errorMessage = undefined;
    instance.cpuPercent = 0;
    instance.memoryUsedMb = 0;
    instance.memoryTotalMb = 1024;
    const saved = await this.instanceRepo.save(instance);

    try { await this.instanceWorker.startWorker(saved); }
    catch (err) { this.logger.warn(`启动 worker 失败（降级为模拟模式）: ${(err as Error).message}`); }

    this.pushStatus(userId, instanceId, 'running');
    return saved;
  }

  async stopInstance(userId: number, instanceId: number): Promise<HermesInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);
    if (instance.status !== 'running') throw new BadRequestException('实例未在运行');

    try { await this.instanceWorker.stopWorker(instanceId); }
    catch (err) { this.logger.warn(`停止 worker 失败: ${(err as Error).message}`); }

    instance.status = 'stopped';
    instance.pid = undefined;
    instance.cpuPercent = 0;
    instance.memoryUsedMb = 0;
    const saved = await this.instanceRepo.save(instance);

    this.pushStatus(userId, instanceId, 'stopped');
    return saved;
  }

  async deleteInstance(userId: number, instanceId: number): Promise<void> {
    const instance = await this.getInstance(userId, instanceId);
    if (instance.status === 'running') {
      await this.stopInstance(userId, instanceId);
    }
    await this.callLogRepo.delete({ instanceId });
    await this.instanceRepo.delete(instanceId);
  }

  // ============ 资源监控 ============

  /**
   * 获取实例实时资源使用（从 worker 采样）
   */  getResourceUsage(instanceId: number) {
    return this.instanceWorker.getResourceUsage(instanceId);
  }

  /**
   * 获取所有活跃实例 ID（供心跳巡检用）
   */  getActiveInstanceIds(): number[] {
    return this.instanceWorker.getActiveInstanceIds();
  }

  // ============ 任务历史 ============

  async getCallLogs(userId: number, instanceId: number, query: PaginationDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize, 10);
    const [list, total] = await this.callLogRepo.findAndCount({
      where: { instanceId, userId }, order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize,
    });
    return paginate(list, total, page, pageSize);
  }

  // ============ 技能挂载 ============

  async mountSkill(
    userId: number,
    instanceId: number,
    skillId: number,
  ): Promise<HermesInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);
    const skillIds = instance.skillIds || [];
    if (!skillIds.includes(skillId)) {
      skillIds.push(skillId);
    }
    instance.skillIds = skillIds;
    instance.skillCount = skillIds.length;
    return this.instanceRepo.save(instance);
  }

  async unmountSkill(
    userId: number,
    instanceId: number,
    skillId: number,
  ): Promise<HermesInstanceEntity> {
    const instance = await this.getInstance(userId, instanceId);
    const skillIds = (instance.skillIds || []).filter((id) => id !== skillId);
    instance.skillIds = skillIds;
    instance.skillCount = skillIds.length;
    return this.instanceRepo.save(instance);
  }

  // ============ 技能市场 ============

  async listMarketSkills(category?: string, search?: string): Promise<HermesSkillEntity[]> {
    const qb = this.skillRepo
      .createQueryBuilder('s')
      .where('s.is_active = :active', { active: true });

    if (category) {
      qb.andWhere('s.category = :category', { category });
    }

    if (search) {
      qb.andWhere('(s.name LIKE :search OR s.description LIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('s.install_count', 'DESC')
      .addOrderBy('s.avg_rating', 'DESC');

    return qb.getMany();
  }

  /** 获取所有分类 */
  async listCategories(): Promise<string[]> {
    const result = await this.skillRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.category', 'category')
      .where('s.is_active = :active', { active: true })
      .andWhere('s.category IS NOT NULL')
      .getRawMany();
    return result.map((r) => r.category).filter(Boolean);
  }

  async listInstalledSkills(userId: number): Promise<HermesSkillEntity[]> {
    // 返回用户所有实例上已挂载的技能包（去重）
    const instances = await this.listInstances(userId);
    const allSkillIds = new Set<number>();
    for (const inst of instances) {
      (inst.skillIds || []).forEach((id) => allSkillIds.add(id));
    }
    if (allSkillIds.size === 0) return [];
    return this.skillRepo
      .createQueryBuilder('s')
      .where('s.id IN (:...ids)', { ids: [...allSkillIds] })
      .getMany();
  }

  async installSkill(userId: number, skillId: number): Promise<HermesSkillEntity> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }
    await this.skillRepo.increment({ id: skillId }, 'installCount', 1);
    return skill;
  }

  /** 卸载技能包（从用户所有实例移除，减少安装计数） */
  async uninstallSkill(userId: number, skillId: number): Promise<void> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }

    // 从用户所有实例中移除该技能
    const instances = await this.listInstances(userId);
    for (const inst of instances) {
      if (inst.skillIds?.includes(skillId)) {
        inst.skillIds = inst.skillIds.filter((id) => id !== skillId);
        inst.skillCount = inst.skillIds.length;
        await this.instanceRepo.save(inst);
      }
    }

    // 减少安装计数
    if (skill.installCount > 0) {
      await this.skillRepo.decrement({ id: skillId }, 'installCount', 1);
    }
  }

  /** 评分 */
  async rateSkill(userId: number, skillId: number, dto: RateSkillDto): Promise<HermesSkillEntity> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }

    // 查找已有评分（upsert）
    let rating = await this.ratingRepo.findOne({
      where: { userId, skillId },
    });

    if (rating) {
      // 更新评分
      const oldRating = rating.rating;
      rating.rating = dto.rating;
      rating.comment = dto.comment;
      await this.ratingRepo.save(rating);

      // 重新计算平均分
      const totalPoints = skill.avgRating * skill.ratingCount - oldRating + dto.rating;
      skill.avgRating = Math.round((totalPoints / skill.ratingCount) * 100) / 100;
    } else {
      // 新评分
      rating = this.ratingRepo.create({
        userId,
        skillId,
        rating: dto.rating,
        comment: dto.comment,
      });
      await this.ratingRepo.save(rating);

      // 更新平均分
      const totalPoints = skill.avgRating * skill.ratingCount + dto.rating;
      skill.ratingCount += 1;
      skill.avgRating = Math.round((totalPoints / skill.ratingCount) * 100) / 100;
    }

    return this.skillRepo.save(skill);
  }

  /** 获取技能包评分列表 */
  async getSkillRatings(skillId: number, query: PaginationDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize, 10);
    const [list, total] = await this.ratingRepo.findAndCount({
      where: { skillId }, order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: Math.min(50, pageSize),
    });
    return paginate(list, total, page, pageSize);
  }

  /** 管理员创建技能包 */
  async createSkill(dto: CreateSkillDto): Promise<HermesSkillEntity> {
    const skill = this.skillRepo.create({
      name: dto.name,
      description: dto.description,
      author: dto.author || '深瞳官方',
      pricePerMinute: dto.pricePerMinute ?? 0,
      category: dto.category,
      tags: dto.tags,
      execConfig: dto.execConfig as any,
      installCount: 0,
      avgRating: 0,
      ratingCount: 0,
      version: '1.0.0',
      isActive: true,
    });
    return this.skillRepo.save(skill);
  }

  /** 检查技能包版本更新（对比版本号） */
  async checkSkillUpdate(skillId: number): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string }> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }
    // TODO: 后续接入远程版本源检测
    return {
      hasUpdate: false,
      currentVersion: skill.version,
      latestVersion: skill.version,
    };
  }

  // ============ 编排引擎 ============

  /** 结算或退还冻结积分 */
  private async settleOrRefund(userId: number, frozenTxnId: number | null, amount: number, logger: Logger) {
    if (!frozenTxnId) return;
    try {
      await this.creditsService.settleCredits(userId, frozenTxnId, amount);
    } catch (err) {
      logger.error(`积分结算失败: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  /**
   * 执行编排任务
   * 完整流程：校验实例 → 预冻结积分 → 执行任务 → 结算积分 → 记录日志
   */
  async executeTask(userId: number, instanceId: number, dto: ExecuteTaskDto): Promise<unknown> {
    // 1. 校验实例存在且在运行中
    const instance = await this.getInstance(userId, instanceId);
    if (instance.status !== 'running') throw new BadRequestException('实例未运行，请先启动实例');

    const task: HermesTask = {
      userId, instanceId, callType: dto.callType, target: dto.target, input: dto.input || {},
      pricePerMinute: dto.pricePerMinute ?? 0, skillId: dto.skillId, serverId: dto.serverId,
      toolName: dto.toolName, args: dto.args, agentId: dto.agentId, n8nInstanceId: dto.n8nInstanceId, workflowId: dto.workflowId,
    };

    const startTime = Date.now();

    // 2. 创建调用日志
    const savedLog = await this.callLogRepo.save(this.callLogRepo.create({
      instanceId: task.instanceId, userId: task.userId, callType: task.callType, status: 'running', target: task.target,
    }));

    // 3. 预冻结积分
    let frozenTxnId: number | null = null;
    const estimatedCost = task.pricePerMinute * DEFAULT_ESTIMATED_MINUTES;
    if (estimatedCost > 0) {
      try {
        frozenTxnId = (await this.creditsService.freezeCredits(task.userId, estimatedCost, 'plugin_call', `hermes_instance_${task.instanceId}`)).id;
      } catch {
        await this.callLogRepo.update(savedLog.id, { status: 'failed', durationMs: 0, errorMessage: '积分余额不足' });
        throw new BadRequestException('积分余额不足，请充值');
      }
    }

    try {
      // 4. 带超时执行任务
      const result = await this.withTimeout(this.dispatchTask(task), DEFAULT_TASK_TIMEOUT_MS);

      // 5. 计算实际耗时和积分
      const durationMs = Date.now() - startTime;
      const actualCost = task.pricePerMinute * Math.max(1, Math.ceil(durationMs / 60000));

      // 6. 结算积分
      await this.settleOrRefund(task.userId, frozenTxnId, actualCost, this.logger);

      // 7. 更新日志为成功
      await this.callLogRepo.update(savedLog.id, { status: 'success', durationMs, creditsCost: actualCost });

      this.syncGateway.pushToUser(userId, 'hermes:task-completed', {
        instanceId, callLogId: savedLog.id, callType: task.callType, target: task.target,
        status: 'success', durationMs, creditsCost: actualCost, timestamp: new Date().toISOString(),
      });

      return { callLogId: savedLog.id, callType: task.callType, target: task.target, durationMs, creditsCost: actualCost, result };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      // 执行失败：退还冻结积分
      await this.settleOrRefund(task.userId, frozenTxnId, 0, this.logger);

      const isTimeout = (err as Error).message?.includes('超时');
      await this.callLogRepo.update(savedLog.id, {
        status: isTimeout ? 'timeout' : 'failed', durationMs, creditsCost: 0, errorMessage: (err as Error).message?.slice(0, 512),
      });
      throw err;
    }
  }

  /**
   * 任务分发
   */
  private async dispatchTask(task: HermesTask): Promise<unknown> {
    switch (task.callType) {
      case 'agent_invoke':
        return this.invokeAgent(task);
      case 'workflow_run':
        return this.runWorkflow(task);
      case 'tool_call':
        return this.callTool(task);
      case 'skill_execute':
        return this.executeSkill(task);
      default:
        throw new BadRequestException(`不支持的调用类型: ${task.callType}`);
    }
  }

  /**
   * 带超时的 Promise 包装
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new BadRequestException('任务执行超时')),
          timeoutMs,
        );
      }),
    ]);
  }

  private async invokeAgent(task: HermesTask): Promise<unknown> {
    if (!task.agentId) {
      throw new BadRequestException('Agent 调用需要 agentId');
    }
    this.logger.log(`invokeAgent via OpenClaw: agentId=${task.agentId}`);
    return this.openClawService.invokeAgent(
      task.userId,
      String(task.agentId),
      JSON.stringify(task.input),
    );
  }

  private async runWorkflow(task: HermesTask): Promise<unknown> {
    if (!task.n8nInstanceId || !task.workflowId) {
      throw new BadRequestException('工作流调用需要 n8nInstanceId 和 workflowId');
    }
    return this.n8nService.triggerWorkflow(
      task.userId,
      task.n8nInstanceId,
      task.workflowId,
      task.input,
    );
  }

  private async callTool(task: HermesTask): Promise<unknown> {
    if (!task.serverId || !task.toolName) {
      throw new BadRequestException('工具调用需要 serverId 和 toolName');
    }
    return this.mcpService.callTool(task.userId, {
      serverId: task.serverId,
      toolName: task.toolName,
      args: task.args || {},
    });
  }

  /**
   * 技能包执行 — 通过 SkillRunnerService 执行
   */
  private async executeSkill(task: HermesTask): Promise<unknown> {
    if (!task.skillId) {
      throw new BadRequestException('技能执行需要 skillId');
    }
    const skill = await this.skillRepo.findOne({ where: { id: task.skillId } });
    if (!skill) {
      throw new NotFoundException(`技能包不存在: ${task.skillId}`);
    }
    return this.skillRunner.run(skill, task.input, task.userId);
  }

  health() {
    return { status: 'ok', module: 'hermes' };
  }
}
