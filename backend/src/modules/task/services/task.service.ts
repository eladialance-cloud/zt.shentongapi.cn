import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { AgentTaskEntity } from '../entities/agent-task.entity';
import { TaskOutputItemEntity } from '../entities/task-output-item.entity';
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
