import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PaginationQuery } from '../../../common/types/pagination.type';
import { N8nService } from '../services/n8n.service';
import { CreateN8nInstanceDto, UpdateN8nInstanceDto } from '../dto/n8n-instance.dto';
import { TriggerWorkflowDto } from '../dto/n8n-workflow.dto';

/**
 * N8N 用户端控制器
 *
 * 提供用户级别的 N8N 实例管理、工作流查询与执行能力。
 */
@ApiTags('N8N')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('n8n')
export class N8nController {
  constructor(private readonly service: N8nService) {}

  // ============ 基础信息 ============

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  // ============ Instance CRUD ============

  @Get('instances')
  @ApiOperation({ summary: '获取 N8N 实例列表' })
  async listInstances(
    @CurrentUser() user: ICurrentUser,
    @Query() query: PaginationQuery,
  ) {
    return this.service.listInstances(user.userId, query);
  }

  @Get('instances/:id')
  @ApiOperation({ summary: '获取 N8N 实例详情' })
  async getInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getInstance(user.userId, id);
  }

  @Post('instances')
  @ApiOperation({ summary: '创建 N8N 实例' })
  async createInstance(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateN8nInstanceDto,
  ) {
    return this.service.createInstance(user.userId, dto);
  }

  @Put('instances/:id')
  @ApiOperation({ summary: '更新 N8N 实例' })
  async updateInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateN8nInstanceDto,
  ) {
    return this.service.updateInstance(user.userId, id, dto);
  }

  @Delete('instances/:id')
  @ApiOperation({ summary: '删除 N8N 实例' })
  async deleteInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.deleteInstance(user.userId, id);
  }

  // ============ Instance Lifecycle ============

  @Post('instances/:id/start')
  @ApiOperation({ summary: '启动 N8N 实例' })
  async startInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.startInstance(user.userId, id);
  }

  @Post('instances/:id/stop')
  @ApiOperation({ summary: '停止 N8N 实例' })
  async stopInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.stopInstance(user.userId, id);
  }

  @Post('instances/:id/restart')
  @ApiOperation({ summary: '重启 N8N 实例' })
  async restartInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.restartInstance(user.userId, id);
  }

  @Get('instances/:id/status')
  @ApiOperation({ summary: '获取 N8N 实例状态' })
  async getInstanceStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getInstanceStatus(user.userId, id);
  }

  // ============ Workflow ============

  @Get('instances/:instanceId/workflows')
  @ApiOperation({ summary: '获取工作流列表' })
  async listWorkflows(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    return this.service.listWorkflows(user.userId, instanceId);
  }

  @Get('instances/:instanceId/workflows/:wfId')
  @ApiOperation({ summary: '获取工作流详情' })
  async getWorkflow(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('wfId') wfId: string,
  ) {
    return this.service.getWorkflow(user.userId, instanceId, wfId);
  }

  @Post('instances/:instanceId/workflows/:wfId/execute')
  @ApiOperation({ summary: '执行 N8N 工作流' })
  async executeWorkflow(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('wfId') wfId: string,
    @Body() dto: TriggerWorkflowDto,
  ) {
    return this.service.triggerWorkflow(
      user.userId,
      instanceId,
      wfId,
      dto.inputData ?? {},
    );
  }
}
