import {
  Controller,
  Get,
  Query,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { N8nWorkflowEntity } from '../entities/n8n-workflow.entity';
import { Public } from '../../../common/decorators/public.decorator';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

@ApiTags('工作流模板')
@Controller('workflow')
export class WorkflowTemplateController {
  constructor(
    @InjectRepository(N8nWorkflowEntity)
    private readonly workflowRepo: Repository<N8nWorkflowEntity>,
  ) {}

  @Get('templates')
  @Public()
  @ApiOperation({ summary: '获取工作流模板列表' })
  async listTemplates(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') _category?: string,
    @Query('keyword') keyword?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const qb = this.workflowRepo.createQueryBuilder('w');
    // 只返回已激活的工作流作为模板
    qb.where('w.active = :active', { active: true });

    // N8nWorkflowEntity 当前无 category/description 字段,
    // category 参数保留以兼容客户端但不参与过滤, keyword 仅匹配 name
    if (keyword) {
      qb.andWhere('w.name LIKE :kw', { kw: `%${keyword}%` });
    }

    qb.orderBy('w.updatedAt', 'DESC');
    qb.skip((p - 1) * ps).take(ps);

    const [workflows, total] = await qb.getManyAndCount();

    return {
      list: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: '',
        nodes: w.nodes ?? null,
        connections: w.connections ?? null,
        category: 'other',
        usageCount: 0,
        pricePerExecution: 0,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    };
  }

  @Get('templates/:id')
  @Public()
  @ApiOperation({ summary: '获取工作流模板详情' })
  async getTemplateDetail(@Param('id', ParseIntPipe) id: number) {
    const workflow = await this.workflowRepo.findOne({ where: { id } });
    if (!workflow) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `工作流模板 ${id} 不存在`);
    }
    return {
      id: workflow.id,
      name: workflow.name,
      description: '',
      nodes: workflow.nodes ?? null,
      connections: workflow.connections ?? null,
      category: 'other',
      usageCount: 0,
      pricePerExecution: 0,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
