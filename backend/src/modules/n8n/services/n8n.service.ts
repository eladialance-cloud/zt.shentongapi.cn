import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { N8nWorkflowEntity } from '../entities/n8n-workflow.entity';

@Injectable()
export class N8nService {
  constructor(
    @InjectRepository(N8nWorkflowEntity)
    private readonly workflowRepo: Repository<N8nWorkflowEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'n8n' };
  }

  /** 指定实例的工作流列表（供 MCP 桥接注册工具） */
  async listWorkflowsByInstance(userId: number, instanceId: number) {
    return this.workflowRepo.find({
      where: { userId, instanceId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** 当前用户已同步的 N8N 工作流（定时任务来源） */
  async listWorkflows(userId: number, options?: { page?: number; pageSize?: number }) {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const [list, total] = await this.workflowRepo.findAndCount({
      where: { userId },
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

  async triggerWorkflow(userId: number, n8nInstanceId: string | number, workflowId: string | number, payload?: any) {
    return { executionId: Date.now(), workflowId, status: 'started' };
  }
}