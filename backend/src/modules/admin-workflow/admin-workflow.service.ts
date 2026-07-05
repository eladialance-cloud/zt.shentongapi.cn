import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowEntity } from './entities/workflow.entity';
import {
  AdminWorkflowQueryDto,
  AdminWorkflowReviewQueryDto,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
} from './dto/workflow.dto';

/**
 * 管理端工作流模板服务
 * 数据合同真源：Task 21 - 工作流模板管理 / desktop types/admin-workflow
 */
@Injectable()
export class AdminWorkflowService {
  constructor(
    @InjectRepository(WorkflowEntity)
    private readonly repo: Repository<WorkflowEntity>,
  ) {}

  /** 工作流列表（分页） */
  async list(query: AdminWorkflowQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.repo.createQueryBuilder('w');
    if (query.engineType) {
      qb.andWhere('w.engine_type = :engineType', {
        engineType: query.engineType,
      });
    }
    if (query.category) {
      qb.andWhere('w.category = :category', { category: query.category });
    }
    if (query.status) {
      qb.andWhere('w.review_status = :status', { status: query.status });
    }
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

  /** 工作流详情 */
  async detail(id: number) {
    const workflow = await this.repo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流 ${id} 不存在`);
    }
    return workflow;
  }

  /** 新增工作流 */
  async create(dto: CreateAdminWorkflowDto) {
    const entity = this.repo.create({
      name: dto.name,
      description: dto.description,
      engineType: dto.engineType as WorkflowEntity['engineType'],
      n8nWorkflowId: dto.n8nWorkflowId,
      cozeWorkflowId: dto.cozeWorkflowId,
      category: dto.category as WorkflowEntity['category'],
      inputSchema: dto.inputSchema,
      outputSchema: dto.outputSchema,
      pricePerExecution: dto.pricePerExecution,
      isActive: dto.isActive ?? false,
      reviewStatus: 'pending_review',
      executionCount: 0,
    });
    return this.repo.save(entity);
  }

  /** 编辑工作流 */
  async update(id: number, dto: UpdateAdminWorkflowDto) {
    const workflow = await this.repo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流 ${id} 不存在`);
    }
    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.engineType !== undefined) {
      workflow.engineType = dto.engineType as WorkflowEntity['engineType'];
    }
    if (dto.n8nWorkflowId !== undefined) workflow.n8nWorkflowId = dto.n8nWorkflowId;
    if (dto.cozeWorkflowId !== undefined) workflow.cozeWorkflowId = dto.cozeWorkflowId;
    if (dto.category !== undefined) {
      workflow.category = dto.category as WorkflowEntity['category'];
    }
    if (dto.inputSchema !== undefined) workflow.inputSchema = dto.inputSchema;
    if (dto.outputSchema !== undefined) workflow.outputSchema = dto.outputSchema;
    if (dto.pricePerExecution !== undefined) {
      workflow.pricePerExecution = dto.pricePerExecution;
    }
    if (dto.isActive !== undefined) workflow.isActive = dto.isActive;
    await this.repo.save(workflow);
  }

  /** 删除工作流 */
  async remove(id: number) {
    const workflow = await this.repo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流 ${id} 不存在`);
    }
    await this.repo.delete(id);
  }

  /** 审核队列（默认按审核状态筛选） */
  async listReview(query: AdminWorkflowReviewQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.repo
      .createQueryBuilder('w')
      .where('w.review_status = :status', {
        status: query.status || 'pending_review',
      })
      .orderBy('w.created_at', 'DESC')
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

  /** 通过审核 */
  async approve(id: number) {
    const workflow = await this.repo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流 ${id} 不存在`);
    }
    workflow.reviewStatus = 'approved';
    workflow.rejectReason = undefined;
    await this.repo.save(workflow);
  }

  /** 驳回审核 */
  async reject(id: number, reason: string) {
    const workflow = await this.repo.findOne({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`工作流 ${id} 不存在`);
    }
    workflow.reviewStatus = 'rejected';
    workflow.rejectReason = reason;
    await this.repo.save(workflow);
  }

  /** 综合审核入口（action: approve | reject） */
  async review(
    id: number,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (action === 'approve') {
      await this.approve(id);
    } else {
      await this.reject(id, reason || '');
    }
  }

  /** 统计 */
  async stats() {
    const total = await this.repo.count();
    const active = await this.repo.count({ where: { isActive: true } });
    const pending = await this.repo.count({
      where: { reviewStatus: 'pending_review' },
    });
    const approved = await this.repo.count({
      where: { reviewStatus: 'approved' },
    });
    const rejected = await this.repo.count({
      where: { reviewStatus: 'rejected' },
    });

    const byEngineRaw = await this.repo
      .createQueryBuilder('w')
      .select('w.engine_type', 'engineType')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN w.is_active = true THEN 1 ELSE 0 END)',
        'active',
      )
      .addSelect('COALESCE(SUM(w.execution_count), 0)', 'executionCount')
      .groupBy('w.engine_type')
      .getRawMany<{
        engineType: string;
        total: string;
        active: string;
        executionCount: string;
      }>();
    const byEngineType = byEngineRaw.map((r) => ({
      engineType: r.engineType,
      total: Number(r.total),
      active: Number(r.active),
      executionCount: Number(r.executionCount),
    }));

    const topRaw = await this.repo.find({
      order: { executionCount: 'DESC' },
      take: 10,
    });
    const topWorkflows = topRaw.map((w) => ({
      id: w.id,
      name: w.name,
      engineType: w.engineType,
      executionCount: w.executionCount,
    }));

    return {
      total,
      active,
      pending,
      approved,
      rejected,
      published: active,
      byEngineType,
      topWorkflows,
      executionTrend: [] as Array<{ date: string; count: number }>,
    };
  }
}
