import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, IsNull } from 'typeorm';
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

    const teams = await this.teamRepo.find({
      where: { creatorId: userId },
    });
    const teamIds = teams.map((t) => Number(t.id));

    // UNION SQL 分页：三源统一排序 + LIMIT/OFFSET 下推，
    // 避免固定 take 500 全量拉取导致的数据截断与内存浪费
    const { rows, total } = await this.queryUnifiedPage(userId, {
      page,
      pageSize,
      source: query.source,
      status: query.status,
      teamIds,
    });

    const list = rows.map((r) => ({
      source: r.source as UnifiedTaskSource,
      sourceId: Number(r.source_id),
      title: (r.title ?? '') as string,
      status: r.status as UnifiedTaskStatus,
      rawStatus: (r.raw_status ?? '') as string,
      assignee: r.assignee != null ? (r.assignee as string) : undefined,
      createdAt: this.toIso(r.created_at),
      finishedAt: r.finished_at ? this.toIso(r.finished_at) : null,
      briefId: r.brief_id != null ? Number(r.brief_id) : null,
      executionRef: r.execution_ref != null ? (r.execution_ref as string) : null,
    }));

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 统一任务中心 UNION 分页查询（MySQL，参数化 + 数值 clamp） */
  private async queryUnifiedPage(
    userId: number,
    opts: {
      page: number;
      pageSize: number;
      source?: string;
      status?: string;
      teamIds: number[];
    },
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const { page, pageSize, source, status, teamIds } = opts;
    const sqlNl = '\n'; // SQL 内换行（与文件换行符无关，避免 CR 进入 SQL）

    // 各来源独立条件与参数（最终按分支出现顺序合并，避免 source 过滤时参数错位）
    const teamConds: string[] = [];
    const taskConds: string[] = [];
    const hermesConds: string[] = [];
    const teamParams: unknown[] = [];
    const taskParams: unknown[] = [];
    const hermesParams: unknown[] = [];

    // team 源范围：用户创建的团队任务 + 用户自己创建的 auto/agent 无团队归属任务
    const teamScope: string[] = [];
    if (teamIds.length > 0) {
      teamScope.push(`t.team_id IN (${teamIds.map(() => '?').join(',')})`);
      teamParams.push(...teamIds);
    }
    teamScope.push('(t.creator_id = ? AND t.team_id IS NULL)');
    teamParams.push(userId);
    teamConds.push(`(${teamScope.join(' OR ')})`);

    taskConds.push('user_id = ?');
    taskParams.push(userId);

    hermesConds.push('user_id = ?');
    hermesParams.push(userId);

    // 统一状态 → 各源枚举（与 unified-mapper 保持一致）
    const teamMap: Record<string, string[]> = {
      todo: ['pending'],
      running: ['in_progress'],
      done: ['completed'],
      failed: ['failed'],
    };
    const taskMap: Record<string, string[]> = {
      todo: ['queued'],
      running: ['running'],
      done: ['success'],
      failed: ['failed'],
      cancelled: ['cancelled'],
    };
    const hermesMap: Record<string, string[]> = {
      running: ['running'],
      done: ['success'],
      failed: ['failed', 'timeout'],
    };
    const pushCond = (conds: string[], values: string[], col: string, params: unknown[]) => {
      if (values.length > 0) {
        conds.push(`${col} IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
      } else {
        conds.push('1 = 0');
      }
    };
    const validStatuses = ['todo', 'running', 'done', 'failed', 'cancelled'];
    if (status && validStatuses.includes(status)) {
      pushCond(teamConds, teamMap[status] ?? [], 't.status', teamParams);
      pushCond(taskConds, taskMap[status] ?? [], 'status', taskParams);
      pushCond(hermesConds, hermesMap[status] ?? [], 'status', hermesParams);
    }

    const includeTeam = !source || source === 'team';
    const includeTask = !source || source === 'task';
    const includeHermes = !source || source === 'hermes';

    // 分支与参数按同一顺序合并
    const branches: string[] = [];
    const params: unknown[] = [];
    if (includeTeam) {
      branches.push(
        `SELECT 'team' AS source, t.id AS source_id, t.title AS title,` + sqlNl +
        `  CASE t.status WHEN 'pending' THEN 'todo' WHEN 'in_progress' THEN 'running' WHEN 'completed' THEN 'done' ELSE 'failed' END AS status,` + sqlNl +
        `  t.status AS raw_status,` + sqlNl +
        `  t.created_at AS created_at, t.completed_at AS finished_at,` + sqlNl +
        `  m.role_title AS assignee, t.brief_id AS brief_id, t.execution_ref AS execution_ref` + sqlNl +
        `FROM task_team_tasks t` + sqlNl +
        `LEFT JOIN task_team_members m ON m.id = t.assignee_member_id` + sqlNl +
        `WHERE ${teamConds.join(' AND ')}`
      );
      params.push(...teamParams);
    }
    if (includeTask) {
      branches.push(
        `SELECT 'task' AS source, id AS source_id, COALESCE(title, task_type) AS title,` + sqlNl +
        `  CASE status WHEN 'queued' THEN 'todo' WHEN 'running' THEN 'running' WHEN 'success' THEN 'done' WHEN 'cancelled' THEN 'cancelled' ELSE 'failed' END AS status,` + sqlNl +
        `  status AS raw_status,` + sqlNl +
        `  created_at AS created_at, finished_at AS finished_at,` + sqlNl +
        `  NULL AS assignee, NULL AS brief_id, NULL AS execution_ref` + sqlNl +
        `FROM task_agent_tasks` + sqlNl +
        `WHERE ${taskConds.join(' AND ')}`
      );
      params.push(...taskParams);
    }
    if (includeHermes) {
      branches.push(
        `SELECT 'hermes' AS source, id AS source_id, COALESCE(target, call_type) AS title,` + sqlNl +
        `  CASE status WHEN 'running' THEN 'running' WHEN 'success' THEN 'done' WHEN 'timeout' THEN 'failed' WHEN 'failed' THEN 'failed' ELSE 'todo' END AS status,` + sqlNl +
        `  status AS raw_status,` + sqlNl +
        `  created_at AS created_at, NULL AS finished_at,` + sqlNl +
        `  NULL AS assignee, NULL AS brief_id, NULL AS execution_ref` + sqlNl +
        `FROM create_hermes_call_logs` + sqlNl +
        `WHERE ${hermesConds.join(' AND ')}`
      );
      params.push(...hermesParams);
    }

    const unionSql = branches.join(sqlNl + 'UNION ALL' + sqlNl);
    if (!unionSql) {
      return { rows: [], total: 0 };
    }

    // 总数（与分页查询同一组过滤条件）
    const countSql = `SELECT COUNT(*) AS total FROM (${sqlNl}${unionSql}${sqlNl}) u`;
    const countRows = (await this.taskRepo.query(countSql, [...params])) as Array<{
      total: number | string;
    }>;
    const total = Number(countRows?.[0]?.total ?? 0);

    // 分页数据：LIMIT/OFFSET 已 clamp，直接拼数值
    const offset = (page - 1) * pageSize;
    const pageSql = `SELECT * FROM (${sqlNl}${unionSql}${sqlNl}) u${sqlNl}ORDER BY u.created_at DESC${sqlNl}LIMIT ${pageSize} OFFSET ${offset}`;
    const rows = (await this.taskRepo.query(pageSql, [...params])) as Array<
      Record<string, unknown>
    >;

    return { rows, total };
  }

  /** MySQL 时间值（Date 或字符串）统一转 ISO 字符串 */
  private toIso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' && v) return new Date(v).toISOString();
    return String(v ?? '');
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
