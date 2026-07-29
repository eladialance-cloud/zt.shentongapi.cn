import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowEntity } from '../../admin-workflow/entities/workflow.entity';
import { N8nWorkflowExecLogEntity } from '../../admin-workflow/entities/n8n-workflow-exec-log.entity';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';
import { calcPagination } from '../../../common/utils/pagination.util';

/**
 * 用户端工作流服务
 *
 * 提供已发布工作流模板的浏览、详情、执行（简化）与执行历史查询。
 * 复用 admin-workflow 模块的 Entity，不自行创建新表。
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepo: Repository<WorkflowEntity>,
    @InjectRepository(N8nWorkflowExecLogEntity)
    private readonly execLogRepo: Repository<N8nWorkflowExecLogEntity>,
  ) {}

  // ------------------------------------------------------------------
  // 健康检查（保留原有功能）
  // ------------------------------------------------------------------
  health() {
    return { status: 'ok', module: 'workflow' };
  }

  // ------------------------------------------------------------------
  // 1. 工作流模板列表（分页，仅查已审核通过 + 已激活）
  // ------------------------------------------------------------------
  async listTemplates(
    query: PaginationQuery,
  ): Promise<PaginatedResult<WorkflowEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.workflowRepo.createQueryBuilder('w');

    // 仅展示已审核通过且已激活的工作流（对用户可见 = 已发布）
    qb.andWhere('w.review_status = :status', { status: 'approved' });
    qb.andWhere('w.is_active = :active', { active: true });

    if (query.keyword) {
      qb.andWhere('(w.name LIKE :kw OR w.description LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('w.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  // ------------------------------------------------------------------
  // 2. 模板详情
  // ------------------------------------------------------------------
  async getTemplateDetail(id: number): Promise<WorkflowEntity> {
    const workflow = await this.workflowRepo
      .createQueryBuilder('w')
      .where('w.id = :id', { id })
      .andWhere('w.review_status = :status', { status: 'approved' })
      .andWhere('w.is_active = :active', { active: true })
      .getOne();

    if (!workflow) {
      throw new NotFoundException(`工作流模板 ${id} 不存在或未发布`);
    }
    return workflow;
  }

  // ------------------------------------------------------------------
  // 3. 执行工作流（简化实现：创建执行记录，状态置为 queued）
  // ------------------------------------------------------------------
  async executeWorkflow(
    workflowId: number,
    userId: number,
    input: Record<string, unknown>,
  ): Promise<{ executionId: number; status: string }> {
    // 确认工作流存在且已发布
    const workflow = await this.getTemplateDetail(workflowId);

    // 创建执行日志记录
    const execLog = this.execLogRepo.create();
    execLog.userId = userId;
    execLog.workflowLibId = undefined; // 不直接关联 workflow_lib
    execLog.status = 'queued';
    execLog.inputData = input;
    execLog.startedAt = new Date();

    const saved = await this.execLogRepo.save(execLog);

    // 增加工作流执行计数
    workflow.executionCount += 1;
    await this.workflowRepo.save(workflow);

    this.logger.log(
      `用户 ${userId} 执行工作流 ${workflowId}，执行记录 ID: ${saved.id}`,
    );

    return {
      executionId: saved.id,
      status: 'queued',
    };
  }

  // ------------------------------------------------------------------
  // 4. 执行历史（分页，按当前用户筛选）
  // ------------------------------------------------------------------
  async listExecutions(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<N8nWorkflowExecLogEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.execLogRepo.createQueryBuilder('e');

    qb.andWhere('e.user_id = :userId', { userId });

    if (query.keyword) {
      // keyword 暂不参与执行历史搜索，保留接口
    }

    qb.orderBy('e.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }
}
