import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowService } from '../services/workflow.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { Pagination } from '../../../common/decorators/pagination.decorator';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';
import { WorkflowEntity } from '../../admin-workflow/entities/workflow.entity';
import { N8nWorkflowExecLogEntity } from '../../admin-workflow/entities/n8n-workflow-exec-log.entity';

@ApiTags('工作流')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ------------------------------------------------------------------
  // 健康检查（公开）
  // ------------------------------------------------------------------
  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.workflowService.health();
  }

  // ------------------------------------------------------------------
  // 1. 工作流模板列表（分页）
  // ------------------------------------------------------------------
  @Get('templates')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '工作流模板列表' })
  async listTemplates(
    @Pagination() query: Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & {
      keyword?: string;
    },
  ): Promise<PaginatedResult<WorkflowEntity>> {
    return this.workflowService.listTemplates(query);
  }

  // ------------------------------------------------------------------
  // 2. 模板详情
  // ------------------------------------------------------------------
  @Get('templates/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '工作流模板详情' })
  async getTemplateDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<WorkflowEntity> {
    return this.workflowService.getTemplateDetail(id);
  }

  // ------------------------------------------------------------------
  // 3. 执行工作流
  // ------------------------------------------------------------------
  @Post(':id/execute')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '执行工作流' })
  async executeWorkflow(
    @Param('id', ParseIntPipe) id: number,
    @Body('input') input: Record<string, unknown>,
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ executionId: number; status: string }> {
    return this.workflowService.executeWorkflow(
      id,
      user.userId,
      input ?? {},
    );
  }

  // ------------------------------------------------------------------
  // 4. 执行历史（分页）
  // ------------------------------------------------------------------
  @Get('executions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '工作流执行历史' })
  async listExecutions(
    @Pagination() query: Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & {
      keyword?: string;
    },
    @CurrentUser() user: ICurrentUser,
  ): Promise<PaginatedResult<N8nWorkflowExecLogEntity>> {
    return this.workflowService.listExecutions(user.userId, query);
  }
}
