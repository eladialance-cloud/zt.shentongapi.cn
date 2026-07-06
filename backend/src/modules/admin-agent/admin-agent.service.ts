import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import fg from 'fast-glob';
import { AgentEntity } from '../agent/entities/agent.entity';
import { AgentReviewEntity } from '../agent/entities/agent-review.entity';
import { UserEntity } from '../user/entities/user.entity';
import { AgentCategoryEntity } from './entities/agent-category.entity';
import {
  AgentImportTaskEntity,
  ImportTaskStats,
} from './entities/agent-import-task.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AgentQueryDto } from './dto/agent-query.dto';
import { AgentReviewQueryDto } from './dto/agent-review-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { RejectAgentDto } from './dto/reject-agent.dto';
import { ImportGithubDto } from './dto/import-github.dto';
import { UpdateCategoryDisplayDto } from './dto/update-category-display.dto';
import {
  ParsedAgentMarkdown,
  parseAgentMarkdown,
} from './agent-import.parser';
import {
  AgentCategory,
  BATCH_SIZE,
  CLONE_TIMEOUT_MS,
  DEFAULT_CREATOR_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_PRICE_PER_CALL,
  DEFAULT_RUNTIME_TYPE,
  EXCLUDE_PATTERNS,
  SOURCE_DIRS_TO_SCAN,
  SOURCE_DIR_TO_CATEGORY,
} from './agent-import.constants';

/** exec 的 Promise 化包装 */
const execAsync = promisify(exec);

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

/**
 * 管理端 Agent 市场服务
 * 数据合同真源：Task 20 - Agent 市场管理
 */
@Injectable()
export class AdminAgentService {
  private readonly logger = new Logger(AdminAgentService.name);

  constructor(
    @InjectRepository(AgentEntity)
    private agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentReviewEntity)
    private reviewRepo: Repository<AgentReviewEntity>,
    @InjectRepository(AgentCategoryEntity)
    private categoryRepo: Repository<AgentCategoryEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(AgentImportTaskEntity)
    private agentImportTaskRepo: Repository<AgentImportTaskEntity>,
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

    const defaults = {
      targetStatus: dto.targetStatus || 'published',
      defaultModelId: dto.defaultModelId || DEFAULT_MODEL_ID,
      defaultCreatorId: dto.defaultCreatorId || DEFAULT_CREATOR_ID,
      dryRun: dto.dryRun ?? false,
      overwriteExisting: dto.overwriteExisting ?? false,
    };

    const stats: ImportTaskStats = {
      total: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    };

    await this.agentImportTaskRepo.save({
      taskId,
      repoUrl: dto.repoUrl,
      branch: 'main',
      status: 'processing',
      progress: 0,
      stats,
    });

    void this.processImportTask(taskId, dto, defaults).catch((e: unknown) => {
      // 异步任务异常由 processImportTask 内部 try-catch 兜底，此处仅作极端兜底日志
      this.logger?.error?.(
        `importGithub async dispatch failed: ${(e as Error).message}`,
      );
    });

    return { taskId };
  }

  /** 异步处理导入任务：克隆 → 解析 → 去重 → 入库 */
  private async processImportTask(
    taskId: string,
    dto: ImportGithubDto,
    defaults: {
      targetStatus: 'published' | 'pending_review' | 'draft';
      defaultModelId: string;
      defaultCreatorId: number;
      dryRun: boolean;
      overwriteExisting: boolean;
    },
  ): Promise<void> {
    const startTime = Date.now();
    const tmpDir = path.join(os.tmpdir(), `agent-import-${taskId}`);
    const stats: ImportTaskStats = {
      total: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    };
    let commitSha: string | undefined;

    try {
      // a. git clone（浅克隆）
      await execAsync(
        `git clone --depth 1 ${this.escapeShell(dto.repoUrl)} ${this.escapeShell(tmpDir)}`,
        { timeout: CLONE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );

      // b. 获取 commitSha
      const { stdout: shaStdout } = await execAsync(
        `git -C ${this.escapeShell(tmpDir)} rev-parse HEAD`,
      );
      commitSha = shaStdout.trim();

      // c. 遍历目标源目录下的 markdown 文件
      const files: string[] = await fg(
        [
          ...SOURCE_DIRS_TO_SCAN.map((d) => `${d}/**/*.md`),
          ...EXCLUDE_PATTERNS.map((p) => '!' + p),
        ],
        { cwd: tmpDir, ignore: EXCLUDE_PATTERNS },
      );
      stats.total = files.length;

      // d-g. 读取并解析每个文件，单文件错误不中断
      const parsed: Array<{
        relPath: string;
        data: ParsedAgentMarkdown;
        category: AgentCategory;
      }> = [];
      for (const relPath of files) {
        try {
          const content = await fs.readFile(path.join(tmpDir, relPath), 'utf8');
          const result = parseAgentMarkdown(relPath, content);
          if (result.error) {
            stats.failed++;
            if (stats.errors && stats.errors.length < 50) {
              stats.errors.push({ filePath: relPath, error: result.error });
            }
            continue;
          }
          const sourceDir = relPath.split('/')[0];
          const category: AgentCategory =
            SOURCE_DIR_TO_CATEGORY[sourceDir] || 'other';
          parsed.push({ relPath, data: result, category });
        } catch (e) {
          stats.failed++;
          if (stats.errors && stats.errors.length < 50) {
            stats.errors.push({ filePath: relPath, error: (e as Error).message });
          }
        }
      }

      // h. 按 sourceRepoUrl + sourceFilePath 去重
      const existingMap = new Map<string, { id: number }>();
      if (parsed.length > 0) {
        const existing = await this.agentRepo.find({
          where: {
            sourceRepoUrl: dto.repoUrl,
            sourceFilePath: In(parsed.map((p) => p.relPath)),
          },
          select: ['id', 'sourceFilePath'],
        });
        for (const e of existing) {
          if (e.sourceFilePath) {
            existingMap.set(e.sourceFilePath, { id: e.id });
          }
        }
      }

      // 构造新增 / 更新集合
      const newEntities: AgentEntity[] = [];
      const updatePayloads: Array<{
        id: number;
        fields: Partial<AgentEntity>;
      }> = [];
      for (const item of parsed) {
        const existing = existingMap.get(item.relPath);
        const sourceDir = item.relPath.split('/')[0];
        if (existing) {
          if (!defaults.overwriteExisting) {
            stats.skipped++;
            continue;
          }
          updatePayloads.push({
            id: existing.id,
            fields: {
              name: item.data.name,
              description: item.data.description,
              avatar: item.data.avatar || undefined,
              systemPrompt: item.data.systemPrompt,
              modelId: defaults.defaultModelId,
              category: item.category,
              sourceCategory: sourceDir,
              sourceVersion: commitSha,
            },
          });
        } else {
          const entity = this.agentRepo.create({
            name: item.data.name,
            description: item.data.description,
            avatar: item.data.avatar || undefined,
            systemPrompt: item.data.systemPrompt,
            modelId: defaults.defaultModelId,
            pricePerCall: DEFAULT_PRICE_PER_CALL,
            creatorId: defaults.defaultCreatorId,
            creatorType: 'official',
            status: defaults.targetStatus,
            category: item.category,
            sourceType: 'imported',
            sourceRepoUrl: dto.repoUrl,
            sourceFilePath: item.relPath,
            sourceCategory: sourceDir,
            sourceVersion: commitSha,
            runtimeType: DEFAULT_RUNTIME_TYPE,
            userId: defaults.defaultCreatorId,
            isOfficial: true,
            publishedAt:
              defaults.targetStatus === 'published' ? new Date() : undefined,
          });
          newEntities.push(entity);
        }
      }

      // i/j. dryRun 跳过写入；否则分批入库
      if (defaults.dryRun) {
        stats.inserted = 0;
        stats.skipped = existingMap.size;
      } else {
        let processedCount = 0;
        // 分批 save 新增
        for (let i = 0; i < newEntities.length; i += BATCH_SIZE) {
          const batch = newEntities.slice(i, i + BATCH_SIZE);
          await this.agentRepo.save(batch);
          processedCount += batch.length;
          const progress =
            files.length > 0
              ? Math.floor((processedCount / files.length) * 100)
              : 100;
          await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
        }
        stats.inserted = newEntities.length;

        // 分批 update 覆盖
        for (let i = 0; i < updatePayloads.length; i += BATCH_SIZE) {
          const batch = updatePayloads.slice(i, i + BATCH_SIZE);
          for (const payload of batch) {
            await this.agentRepo.update(payload.id, payload.fields);
          }
          processedCount += batch.length;
          const progress =
            files.length > 0
              ? Math.floor((processedCount / files.length) * 100)
              : 100;
          await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
        }
      }

      // k. 完成
      stats.durationMs = Date.now() - startTime;
      stats.total = files.length;
      await this.agentImportTaskRepo.update(
        { taskId },
        {
          status: 'success',
          progress: 100,
          stats,
          commitSha,
        },
      );
    } catch (e) {
      stats.durationMs = Date.now() - startTime;
      await this.agentImportTaskRepo.update({ taskId }, {
        status: 'failed',
        error: (e as Error).message.slice(0, 512),
        stats,
      });
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // 忽略临时目录清理错误
      }
    }
  }

  /** 查询导入任务状态 */
  async getImportTask(taskId: string) {
    const task = await this.agentImportTaskRepo.findOne({ where: { taskId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '导入任务不存在');
    }
    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      repoUrl: task.repoUrl,
      branch: task.branch,
      commitSha: task.commitSha,
      stats: task.stats,
      errorMessage: task.error,
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

  /** shell 参数转义：用单引号包裹并转义内部单引号 */
  private escapeShell(arg: string): string {
    return "'" + String(arg).replace(/'/g, "'\\''") + "'";
  }
}
