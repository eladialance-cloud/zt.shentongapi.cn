import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity } from '../agent/entities/agent.entity';
import { AgentReviewEntity } from '../agent/entities/agent-review.entity';
import { UserEntity } from '../user/entities/user.entity';
import { AgentCategoryEntity } from './entities/agent-category.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AgentQueryDto } from './dto/agent-query.dto';
import { AgentReviewQueryDto } from './dto/agent-review-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { RejectAgentDto } from './dto/reject-agent.dto';
import { ImportGithubDto } from './dto/import-github.dto';
import { UpdateCategoryDisplayDto } from './dto/update-category-display.dto';

/** 固定的 5 个分类 */
const FIXED_CATEGORIES = [
  'office',
  'programming',
  'copywriting',
  'data_analysis',
  'other',
] as const;

/** 分类默认显示名 */
const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他',
};

/** GitHub 导入任务内存存储（进程级） */
interface ImportTask {
  taskId: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  progress: number;
  agentId?: number;
  errorMessage?: string;
  repoUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 管理端 Agent 市场服务
 * 数据合同真源：Task 20 - Agent 市场管理
 */
@Injectable()
export class AdminAgentService {
  /** GitHub 导入任务内存存储（进程级，重启后丢失） */
  private readonly importTasks = new Map<string, ImportTask>();

  constructor(
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentReviewEntity)
    private reviewRepo: Repository<AgentReviewEntity>,
    @InjectRepository(AgentCategoryEntity)
    private categoryRepo: Repository<AgentCategoryEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
  ) {}

  // ============ Agent CRUD ============

  /** Agent 列表 */
  async listAgents(query: AgentQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.agentRepo.createQueryBuilder('a');
    if (query.status) {
      const entityStatus = this.toEntityStatus(query.status);
      if (entityStatus) {
        qb.andWhere('a.status = :status', { status: entityStatus });
      }
    }
    if (query.category) {
      qb.andWhere('a.category = :category', { category: query.category });
    }
    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const list = await this.toAdminAgentItems(agents);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Agent 详情 */
  async getAgentDetail(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    const items = await this.toAdminAgentItems([agent]);
    return items[0];
  }

  /** 新增 Agent */
  async createAgent(dto: CreateAgentDto) {
    const agent = this.agentRepo.create({
      name: dto.name,
      description: dto.description,
      systemPrompt: dto.systemPrompt || '',
      usageExample: dto.usageExamples?.join('\n') || undefined,
      modelId: dto.modelId || '',
      pricePerCall: dto.pricePerCall,
      pricePerToken:
        dto.pricingMode === 'perToken'
          ? { input: dto.pricePerTokenInput, output: dto.pricePerTokenOutput }
          : undefined,
      creatorId: 0,
      creatorType: 'official',
      status: 'draft',
      category: dto.category,
      sourceType: 'official',
      runtimeType: 'openclaw',
      userId: 0,
    });
    const saved = await this.agentRepo.save(agent);
    return (await this.toAdminAgentItems([saved as AgentEntity]))[0];
  }

  /** 编辑 Agent */
  async updateAgent(id: number, dto: UpdateAgentDto) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.description !== undefined) agent.description = dto.description;
    if (dto.systemPrompt !== undefined) agent.systemPrompt = dto.systemPrompt;
    if (dto.usageExamples !== undefined) {
      agent.usageExample = dto.usageExamples.join('\n') || undefined;
    }
    if (dto.modelId !== undefined) agent.modelId = dto.modelId;
    if (dto.category !== undefined) agent.category = dto.category;
    if (dto.pricePerCall !== undefined) agent.pricePerCall = dto.pricePerCall;
    if (dto.pricingMode !== undefined) {
      if (dto.pricingMode === 'perToken') {
        agent.pricePerToken = {
          input: dto.pricePerTokenInput ?? 0,
          output: dto.pricePerTokenOutput ?? 0,
        };
      } else {
        agent.pricePerToken = undefined;
      }
    }
    await this.agentRepo.save(agent);
  }

  /** 删除 Agent */
  async deleteAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    await this.agentRepo.delete(id);
  }

  // ============ 上下架 ============

  /** 上架 Agent */
  async publishAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    agent.status = 'published';
    agent.publishedAt = new Date();
    await this.agentRepo.save(agent);
  }

  /** 下架 Agent */
  async unpublishAgent(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    agent.status = 'offline';
    await this.agentRepo.save(agent);
  }

  // ============ 审核 ============

  /** 审核队列列表 */
  async listReview(query: AgentReviewQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.agentRepo.createQueryBuilder('a');
    if (query.status) {
      const entityStatus = this.toEntityStatus(query.status);
      if (entityStatus) {
        qb.andWhere('a.status = :status', { status: entityStatus });
      }
    } else {
      // 默认只看待审核
      qb.andWhere('a.status = :status', { status: 'pending_review' });
    }
    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const list = await this.toAdminAgentItems(agents);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 通过审核 */
  async approveAgent(id: number, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    agent.status = 'published';
    agent.publishedAt = new Date();
    agent.rejectionReason = undefined;
    await this.agentRepo.save(agent);

    // 写入审核记录
    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'approve',
    });
  }

  /** 驳回审核 */
  async rejectAgent(id: number, dto: RejectAgentDto, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    agent.status = 'rejected';
    agent.rejectionReason = dto.reason;
    await this.agentRepo.save(agent);

    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'reject',
      reason: dto.reason,
    });
  }

  /** 强制下架 */
  async forceUnpublishAgent(id: number, dto: RejectAgentDto, adminId: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'Agent 不存在');
    }
    agent.status = 'offline';
    agent.rejectionReason = dto.reason;
    await this.agentRepo.save(agent);

    await this.reviewRepo.save({
      agentId: id,
      reviewerId: adminId,
      action: 'reject',
      reason: dto.reason,
    });
  }

  // ============ GitHub 导入 ============

  /** GitHub 仓库异步导入（创建任务，立即返回 taskId） */
  async importGithub(dto: ImportGithubDto): Promise<{ taskId: string }> {
    const taskId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date();
    const task: ImportTask = {
      taskId,
      status: 'pending',
      progress: 0,
      repoUrl: dto.repoUrl,
      createdAt: now,
      updatedAt: now,
    };
    this.importTasks.set(taskId, task);

    // 异步模拟处理（不阻塞响应）：标记为 processing 后直接标记 success
    // 真实场景应由队列消费者完成克隆、解析、入库
    setImmediate(() => {
      const t = this.importTasks.get(taskId);
      if (!t) return;
      t.status = 'processing';
      t.progress = 50;
      t.updatedAt = new Date();
      this.importTasks.set(taskId, t);

      setTimeout(() => {
        const latest = this.importTasks.get(taskId);
        if (!latest) return;
        latest.status = 'success';
        latest.progress = 100;
        latest.updatedAt = new Date();
        this.importTasks.set(taskId, latest);
      }, 1000);
    });

    return { taskId };
  }

  /** 查询导入任务状态 */
  async getImportTask(taskId: string) {
    const task = this.importTasks.get(taskId);
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '导入任务不存在');
    }
    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      agentId: task.agentId,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  // ============ 分类管理 ============

  /** 分类列表（含每分类 Agent 数量） */
  async listCategories() {
    // 查询所有分类配置
    const categories = await this.categoryRepo.find({ order: { sort: 'ASC' } });
    const categoryMap = new Map<string, AgentCategoryEntity>(
      categories.map((c) => [c.category, c]),
    );

    // 聚合每分类 Agent 数量
    const countRows = await this.agentRepo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('a.category')
      .getRawMany<{ category: string; cnt: string }>();
    const countMap = new Map<string, number>(
      countRows.map((r) => [r.category, Number(r.cnt)]),
    );

    return FIXED_CATEGORIES.map((cat, idx) => {
      const meta = categoryMap.get(cat);
      return {
        category: cat,
        displayName: meta?.displayName || DEFAULT_DISPLAY_NAMES[cat] || cat,
        agentCount: countMap.get(cat) || 0,
        sort: meta?.sort ?? idx,
      };
    });
  }

  /** 更新分类显示名 */
  async updateCategoryDisplay(
    category: string,
    dto: UpdateCategoryDisplayDto,
  ) {
    if (!FIXED_CATEGORIES.includes(category as any)) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的分类');
    }
    let entity = await this.categoryRepo.findOne({ where: { category } });
    if (entity) {
      entity.displayName = dto.displayName;
      await this.categoryRepo.save(entity);
    } else {
      entity = this.categoryRepo.create({
        category,
        displayName: dto.displayName,
        sort: FIXED_CATEGORIES.indexOf(category as any),
      });
      await this.categoryRepo.save(entity);
    }
  }

  // ============ 内部工具 ============

  /** 前端 status -> 实体 status 映射 */
  private toEntityStatus(
    status: string,
  ): 'draft' | 'pending_review' | 'published' | 'rejected' | 'offline' | null {
    switch (status) {
      case 'published':
        return 'published';
      case 'unpublished':
        return 'offline';
      case 'pending_review':
        return 'pending_review';
      case 'rejected':
        return 'rejected';
      case 'draft':
        return 'draft';
      default:
        return null;
    }
  }

  /** 实体 status -> 前端 status 映射 */
  private toFrontendStatus(
    status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'offline',
  ): 'published' | 'unpublished' | 'pending_review' | 'rejected' {
    switch (status) {
      case 'published':
        return 'published';
      case 'offline':
        return 'unpublished';
      case 'pending_review':
        return 'pending_review';
      case 'rejected':
        return 'rejected';
      default:
        return 'unpublished';
    }
  }

  /** 批量转换实体为前端视图（含 creatorName） */
  private async toAdminAgentItems(agents: AgentEntity[]) {
    if (agents.length === 0) return [];

    // 批量查询创作者名
    const creatorIds = [...new Set(agents.map((a) => a.creatorId).filter((id) => id > 0))];
    const creators =
      creatorIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...ids)', { ids: creatorIds })
            .getMany()
        : [];
    const nameMap = new Map<number, string>(creators.map((u) => [u.id, u.username]));

    return agents.map((a) => {
      const pricingMode = a.pricePerToken ? 'perToken' : 'perCall';
      return {
        id: a.id,
        name: a.name,
        description: a.description || '',
        systemPrompt: a.systemPrompt,
        category: a.category,
        usageExamples: a.usageExample ? a.usageExample.split('\n').filter(Boolean) : undefined,
        modelId: a.modelId,
        creatorType: a.creatorType,
        creatorName: nameMap.get(a.creatorId) || '',
        status: this.toFrontendStatus(a.status),
        pricingMode,
        pricePerCall: a.pricePerCall,
        pricePerTokenInput: a.pricePerToken?.input ?? 0,
        pricePerTokenOutput: a.pricePerToken?.output ?? 0,
        callCount: a.callCount,
        rating: Number(a.rating) || 0,
        rejectReason: a.rejectionReason || undefined,
        forceUnpublishReason: a.status === 'offline' ? a.rejectionReason || undefined : undefined,
        submittedAt: a.publishedAt?.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      };
    });
  }
}
