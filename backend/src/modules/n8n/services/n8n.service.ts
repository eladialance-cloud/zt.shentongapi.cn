import { Injectable, BadRequestException } from '@nestjs/common';
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

  /**
   * 触发本地 N8N 工作流
   * 注意：本地 N8N 运行在用户桌面（127.0.0.1:5678），后端服务器无法触达，
   * 不能在后端「假装执行成功」。此方法统一抛错，引导在桌面端执行：
   *   - 桌面端「工作流」详情页执行（真跑本地 N8N webhook + 结果回传 /workflows/executions/:id/report）；
   *   - 或六部官署 n8n-run-workflow 技能（本地脚本直连 127.0.0.1:5678）。
   */
  async triggerWorkflow(userId: number, n8nInstanceId: string | number, workflowId: string | number, payload?: any) {
    void userId; void n8nInstanceId; void workflowId; void payload;
    throw new BadRequestException('工作流执行需在桌面端完成：后端服务器无法触达本地 N8N，请打开桌面端「工作流」页执行，或由官署 n8n-run-workflow 技能调用');
  }
}