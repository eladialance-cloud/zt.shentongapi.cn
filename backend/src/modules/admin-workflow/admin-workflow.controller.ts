import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminWorkflowService } from './admin-workflow.service';
import {
  AdminWorkflowQueryDto,
  AdminWorkflowReviewQueryDto,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
} from './dto/workflow.dto';
import { WorkflowRejectDto, WorkflowReviewDto } from './dto/review.dto';

/**
 * 管理端工作流模板控制器
 * 数据合同真源：Task 21 - 工作流模板管理 / frontend admin-workflow-api.ts
 *
 * 端点：
 *   GET    /admin/workflows              列表
 *   POST   /admin/workflows              新增
 *   PATCH  /admin/workflows/:id          编辑
 *   DELETE /admin/workflows/:id          删除
 *   GET    /admin/workflows/review       审核队列
 *   GET    /admin/workflows/stats        统计
 *   GET    /admin/workflows/:id          详情
 *   POST   /admin/workflows/:id/review   综合审核（action: approve|reject）
 *   POST   /admin/workflows/:id/approve  通过审核
 *   POST   /admin/workflows/:id/reject   驳回审核
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-工作流')
@ApiBearerAuth()
@Controller('admin/workflows')
@Public()
@UseGuards(AdminGuard)
export class AdminWorkflowController {
  constructor(private readonly service: AdminWorkflowService) {}

  @Get()
  @ApiOperation({ summary: '工作流列表' })
  async list(@Query() query: AdminWorkflowQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: '新增工作流' })
  async create(@Body() dto: CreateAdminWorkflowDto) {
    return this.service.create(dto);
  }

  @Get('review')
  @ApiOperation({ summary: '审核队列' })
  async listReview(@Query() query: AdminWorkflowReviewQueryDto) {
    return this.service.listReview(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '工作流统计' })
  async stats() {
    return this.service.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: '工作流详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑工作流' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminWorkflowDto,
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除工作流' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return null;
  }

  @Post(':id/review')
  @ApiOperation({ summary: '审核工作流（approve|reject）' })
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WorkflowReviewDto,
  ) {
    await this.service.review(id, dto.action, dto.reason);
    return null;
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '通过审核' })
  async approve(@Param('id', ParseIntPipe) id: number) {
    await this.service.approve(id);
    return null;
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回审核' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WorkflowRejectDto,
  ) {
    await this.service.reject(id, dto.reason);
    return null;
  }
}
