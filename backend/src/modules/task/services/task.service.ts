import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In } from 'typeorm';
import { AgentTaskEntity } from '../entities/agent-task.entity';
import { TaskOutputItemEntity } from '../entities/task-output-item.entity';
import { TeamEntity } from '../../team/entities/team.entity';
import { TeamMemberEntity } from '../../team/entities/team-member.entity';
import { TeamTaskEntity } from '../../team/entities/team-task.entity';
import { HermesCallLogEntity } from '../../hermes/entities/hermes-call-log.entity';
import {
  UnifiedTaskItem,
  UnifiedTaskSource,
  UnifiedTaskStatus,
  mapTeamStatus,
  mapTaskStatus,
  mapHermesStatus,
  sortByCreatedAtDesc,
} from '../utils/unified-mapper';
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  CreateOutputItemDto,
  TaskQueryDto,
} from '../dto/task.dto';
import { PaginatedResult } from '../../../common/types/pagination.type';

/**
 * 任务服务
 * 负责任务的创建、查询、状态更新、取消及输出项管理
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(TaskOutputItemEntity)
    private readonly outputItemRepo: Repository<TaskOutputItemEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly memberRepo: Repository<TeamMemberEntity>,
    @InjectRepository(TeamTaskEntity)
    private readonly teamTaskRepo: Repository<TeamTaskEntity>,
    @InjectRepository(HermesCallLogEntity)
    private readonly hermesRepo: Repository<HermesCallLogEntity>,
  ) {}

  /**
   * 创建任务
   * @param userId 用户 ID
   * @param dto 创建任务参数
   * @returns 新建任务实体
   */
  async createTask(userId: number, dto: CreateTaskDto): Promise<AgentTaskEntity> {
    const task = this.taskRepo.create({
      userId,
      taskType: dto.taskType,
      agentId: dto.agentId ?? null,
      title: dto.title ?? null,
      inputText: dto.inputText ?? null,
      inputParams: dto.inputParams ?? null,
      status: 'queued',
    } as unknown as AgentTaskEntity);
    return this.taskRepo.save(task);
  }

  /**
   * 获取任务详情（含输出项）
   * @param userId 用户 ID（用于权限校验）
   * @param id 任务 ID
   * @returns 任务实体及输出项列表
   */
  async getTask(userId: number, id: number): Promise<{
    task: AgentTaskEntity;
    outputItems: TaskOutputItemEntity[];
  }> {
    const task = await this.taskRepo.findOne({
      where: { id, userId },
    });
    if (!task) {
      throw new NotFoundException(`任务 ${id} 不存在`);
    }
    const outputItems = await this.outputItemRepo.find({
      where: { taskId: id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return { task, outputItems };
  }

  /**
   * 分页查询任务列表
   * @param userId 用户 ID
   * @param query 查询参数（分页 + 筛选）
   * @returns 分页结果
   */
  async listTasks(
    userId: number,
    query: TaskQueryDto,
  ): Promise<PaginatedResult<AgentTaskEntity>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));

    const where: FindOptionsWhere<AgentTaskEntity> = { userId };
    if (query.taskType) {
      where.taskType = query.taskType;
    }
    if (query.status) {
      where.status = query.status;
    }

    // keyword 模糊匹配标题
    const findOptions: any = {
      where: query.keyword
        ? [
            { ...where, title: Like(`%${query.keyword}%`) },
          ]
        : where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    };

    const [list, total] = await this.taskRepo.findAndCount(findOptions);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 统一任务列表：team / task / hermes 三源合并（归属/过滤/排序/分页）
   * @param userId 用户 ID
   * @param query 查询参数（status/source 过滤 + page/pageSize 分页）
   * @returns 分页结果
   */
  async getUnifiedTasks(
    userId: number,
    query: {
      status?: string;
      source?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<PaginatedResult<UnifiedTaskItem>> {
    const rawPage = query.page ?? 1;
    const rawPageSize = query.pageSize ?? 10;
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.min(100, Math.max(1, Math.trunc(rawPageSize)))
      : 10;

    const items: UnifiedTaskItem[] = [];

    // 1) team 源：用户创建的团队（teams.creator_id = userId）下的任务
    const teams = await this.teamRepo.find({
      where: { creatorId: userId },
    });
    const teamIds = teams.map((t) => t.id);
    if (teamIds.length > 0) {
      // assignee：team_members.id = assignee_member_id 取 roleTitle
      const members = await this.memberRepo.find({
        where: { teamId: In(teamIds) },
      });
      const roleByMemberId = new Map<number, string>();
      for (const m of members) {
        roleByMemberId.set(m.id, m.roleTitle);
      }
      const teamTasks = await this.teamTaskRepo.find({
        where: { teamId: In(teamIds) },
        order: { createdAt: 'DESC' },
        take: 500,
      });
      for (const t of teamTasks) {
        items.push({
          source: 'team',
          sourceId: t.id,
          title: t.title,
          status: mapTeamStatus(t.status),
          rawStatus: t.status,
          assignee:
            t.assigneeMemberId != null
              ? roleByMemberId.get(t.assigneeMemberId)
              : undefined,
          createdAt: t.createdAt.toISOString(),
          finishedAt: t.completedAt ? t.completedAt.toISOString() : null,
          briefId: t.briefId ?? null,
          executionRef: t.executionRef ?? null,
        });
      }
    }

    // 2) task 源：agent_task.userId 归属
    const myTasks = await this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    for (const t of myTasks) {
      items.push({
        source: 'task',
        sourceId: t.id,
        title: t.title || t.taskType,
        status: mapTaskStatus(t.status),
        rawStatus: t.status,
        createdAt: t.createdAt.toISOString(),
        finishedAt: t.finishedAt ? t.finishedAt.toISOString() : null,
        briefId: null,
      });
    }

    // 3) hermes 源：hermes_call_logs.userId 归属
    const hermesLogs = await this.hermesRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    for (const log of hermesLogs) {
      items.push({
        source: 'hermes',
        sourceId: log.id,
        title: log.target || log.callType,
        status: mapHermesStatus(log.status),
        rawStatus: log.status,
        createdAt: log.createdAt.toISOString(),
        finishedAt: null,
        briefId: null,
      });
    }

    // 过滤：统一 status / source 映射后过滤
    let list = items;
    if (query.source) {
      const source = query.source as UnifiedTaskSource;
      if (['team', 'task', 'hermes'].includes(source)) {
        list = list.filter((i) => i.source === source);
      }
    }
    if (query.status) {
      const status = query.status as UnifiedTaskStatus;
      if (['todo', 'running', 'done', 'failed', 'cancelled'].includes(status)) {
        list = list.filter((i) => i.status === status);
      }
    }

    // 排序：createdAt 倒序（最新在前）
    list = sortByCreatedAtDesc(list);

    // 分页
    const total = list.length;
    const start = (page - 1) * pageSize;
    return {
      list: list.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
  /**
   * 更新任务状态
   * @param id 任务 ID
   * @param dto 状态更新参数
   * @returns 更新后的任务实体
   */
  async updateTaskStatus(
    id: number,
    dto: UpdateTaskStatusDto,
  ): Promise<AgentTaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`任务 ${id} 不存在`);
    }

    task.status = dto.status;

    // 状态流转时自动更新时间戳
    if (dto.status === 'running' && !task.startedAt) {
      task.startedAt = new Date();
    }
    if (['success', 'failed', 'cancelled'].includes(dto.status)) {
      task.finishedAt = new Date();
    }

    if (dto.errorMessage !== undefined) {
      task.errorMessage = dto.errorMessage;
    }
    if (dto.durationMs !== undefined) {
      task.durationMs = dto.durationMs;
    }

    return this.taskRepo.save(task);
  }

  /**
   * 添加任务输出项
   * @param taskId 任务 ID
   * @param dto 输出项参数
   * @returns 新建的输出项实体
   */
  async addOutputItem(
    taskId: number,
    dto: CreateOutputItemDto,
  ): Promise<TaskOutputItemEntity> {
    // 获取当前最大 sortOrder
    const existing = await this.outputItemRepo.find({
      where: { taskId },
      order: { sortOrder: 'DESC' },
      take: 1,
    });
    const nextSortOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

    const item = this.outputItemRepo.create({
      taskId,
      outputType: dto.outputType,
      content: dto.content ?? null,
      contentJson: dto.contentJson ?? null,
      fileUrl: dto.fileUrl ?? null,
      fileSize: dto.fileSize ?? null,
      mimeType: dto.mimeType ?? null,
      metadata: dto.metadata ?? null,
      sortOrder: nextSortOrder,
    } as unknown as TaskOutputItemEntity);
    return this.outputItemRepo.save(item);
  }

  /**
   * 获取任务的所有输出项
   * @param taskId 任务 ID
   * @returns 输出项列表
   */
  async getOutputItems(taskId: number): Promise<TaskOutputItemEntity[]> {
    return this.outputItemRepo.find({
      where: { taskId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 取消任务
   * @param userId 用户 ID（用于权限校验）
   * @param id 任务 ID
   * @returns 更新后的任务实体
   */
  async cancelTask(userId: number, id: number): Promise<AgentTaskEntity> {
    const task = await this.taskRepo.findOne({
      where: { id, userId },
    });
    if (!task) {
      throw new NotFoundException(`任务 ${id} 不存在`);
    }

    // 仅 queued 和 running 状态的任务可取消
    if (!['queued', 'running'].includes(task.status)) {
      throw new Error(`任务当前状态为 ${task.status}，无法取消`);
    }

    task.status = 'cancelled';
    task.finishedAt = new Date();
    return this.taskRepo.save(task);
  }

  /**
   * 管理端：分页查询全部任务列表
   * @param query 查询参数
   * @returns 分页结果
   */
  async listAllTasks(query: TaskQueryDto): Promise<PaginatedResult<AgentTaskEntity>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));

    const where: FindOptionsWhere<AgentTaskEntity> = {};
    if (query.taskType) {
      where.taskType = query.taskType;
    }
    if (query.status) {
      where.status = query.status;
    }

    const findOptions: any = {
      where: query.keyword
        ? [{ ...where, title: Like(`%${query.keyword}%`) }]
        : where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    };

    const [list, total] = await this.taskRepo.findAndCount(findOptions);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 管理端：获取任务详情（不限用户）
   * @param id 任务 ID
   * @returns 任务实体及输出项列表
   */
  async getTaskById(id: number): Promise<{
    task: AgentTaskEntity;
    outputItems: TaskOutputItemEntity[];
  }> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`任务 ${id} 不存在`);
    }
    const outputItems = await this.outputItemRepo.find({
      where: { taskId: id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return { task, outputItems };
  }

  /**
   * 管理端：删除任务（同时删除关联输出项）
   * @param id 任务 ID
   */
  async deleteTask(id: number): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`任务 ${id} 不存在`);
    }
    // 先删除关联的输出项
    await this.outputItemRepo.delete({ taskId: id });
    await this.taskRepo.delete(id);
  }
}
