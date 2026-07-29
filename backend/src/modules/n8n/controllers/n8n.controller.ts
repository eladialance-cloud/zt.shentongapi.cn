import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { N8nService } from '../services/n8n.service';
import {
  CreateN8nInstanceDto,
  UpdateN8nInstanceDto,
} from '../dto/n8n-instance.dto';
import { TriggerWorkflowDto } from '../dto/n8n-workflow.dto';
import { N8nInstanceEntity } from '../entities/n8n-instance.entity';

/** 鑴辨晱锛氭帓闄?apiKey */
function sanitize<T extends N8nInstanceEntity>(instance: T): Omit<T, 'apiKey'> {
  const { apiKey: _omit, ...rest } = instance;
  return rest;
}

@ApiTags('N8N')
@ApiBearerAuth()
@Controller('n8n')
export class N8nController {
  constructor(private readonly service: N8nService) {}

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  鍋ュ悍妫€鏌?  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  @Public()
  @Get('health')
  @ApiOperation({ summary: '鍋ュ悍妫€鏌? })
  health() {
    return this.service.health();
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  瀹炰緥绠＄悊
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  @Get('instances')
  @ApiOperation({ summary: '鑾峰彇 N8N 瀹炰緥鍒楄〃' })
  async listInstances(@CurrentUser() user: ICurrentUser) {
    const instances = await this.service.listInstances(user.userId);
    return instances.map((i) => sanitize(i));
  }

  @Post('instances')
  @ApiOperation({ summary: '鍒涘缓 N8N 瀹炰緥' })
  async createInstance(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateN8nInstanceDto,
  ) {
    const instance = await this.service.createInstance(user.userId, dto);
    return sanitize(instance);
  }

  @Get('instances/:instanceId')
  @ApiOperation({ summary: '鑾峰彇 N8N 瀹炰緥璇︽儏' })
  async getInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    const instance = await this.service.getInstance(user.userId, instanceId);
    return sanitize(instance);
  }

  @Put('instances/:instanceId')
  @ApiOperation({ summary: '鏇存柊 N8N 瀹炰緥' })
  async updateInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: UpdateN8nInstanceDto,
  ) {
    const instance = await this.service.updateInstance(user.userId, instanceId, dto);
    return sanitize(instance);
  }

  @Delete('instances/:instanceId')
  @ApiOperation({ summary: '鍒犻櫎 N8N 瀹炰緥' })
  async deleteInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    await this.service.deleteInstance(user.userId, instanceId);
    return null;
  }

  @Post('instances/:instanceId/test')
  @ApiOperation({ summary: '娴嬭瘯 N8N 杩炴帴' })
  testConnection(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    return this.service.testConnection(user.userId, instanceId);
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  宸ヤ綔娴佺鐞?  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  @Get('instances/:instanceId/workflows')
  @ApiOperation({ summary: '鑾峰彇宸ヤ綔娴佸垪琛? })
  listWorkflows(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
  ) {
    return this.service.listWorkflows(user.userId, instanceId);
  }

  @Get('instances/:instanceId/workflows/:workflowId')
  @ApiOperation({ summary: '鑾峰彇宸ヤ綔娴佽鎯? })
  getWorkflowDetail(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('workflowId') workflowId: string,
  ) {
    return this.service.getWorkflowDetail(user.userId, instanceId, workflowId);
  }

  @Post('instances/:instanceId/workflows/:workflowId/trigger')
  @ApiOperation({ summary: '瑙﹀彂宸ヤ綔娴? })
  triggerWorkflow(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('workflowId') workflowId: string,
    @Body() dto: TriggerWorkflowDto,
  ) {
    return this.service.triggerWorkflow(
      user.userId,
      instanceId,
      workflowId,
      dto?.inputData,
    );
  }

  @Post('instances/:instanceId/workflows/:workflowId/activate')
  @ApiOperation({ summary: '婵€娲诲伐浣滄祦' })
  activateWorkflow(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('workflowId') workflowId: string,
  ) {
    return this.service.activateWorkflow(user.userId, instanceId, workflowId);
  }

  @Post('instances/:instanceId/workflows/:workflowId/deactivate')
  @ApiOperation({ summary: '鍋滅敤宸ヤ綔娴? })
  deactivateWorkflow(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('workflowId') workflowId: string,
  ) {
    return this.service.deactivateWorkflow(user.userId, instanceId, workflowId);
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  鎵ц鐘舵€?  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  @Get('instances/:instanceId/executions/:executionId')
  @ApiOperation({ summary: '鏌ヨ鎵ц鐘舵€? })
  getExecutionStatus(
    @CurrentUser() user: ICurrentUser,
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('executionId') executionId: string,
  ) {
    return this.service.getExecutionStatus(
      user.userId,
      instanceId,
      executionId,
    );
  }

  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  //  Webhook 鍥炶皟
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  @Public()
  @Post('webhook/:instanceId/:workflowId')
  @ApiOperation({ summary: 'N8N 宸ヤ綔娴佹墽琛屽洖璋? })
  async webhookCallback(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('workflowId') workflowId: string,
    @Body() body: unknown,
    @Headers('x-n8n-signature') signature?: string,
  ) {
    return this.service.handleWebhook(instanceId, workflowId, body, signature);
  }
}
