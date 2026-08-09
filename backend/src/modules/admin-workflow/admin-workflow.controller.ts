import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminWorkflowService } from './admin-workflow.service';
import {
  AdminWorkflowQueryDto,
  CreateAdminWorkflowDto,
  ImportGithubWorkflowDto,
  UpdateAdminWorkflowDto,
} from './dto/workflow.dto';
import { WorkflowRejectDto, WorkflowReviewDto } from './dto/review.dto';
import { BatchDeleteDto } from '../../common/dto/batch-delete.dto';
import { BatchReviewDto } from '../../common/dto/batch-review.dto';

/**
 * 管理端工作流模板控制器（合并版）
 *
 * 端点：
 *   GET    /admin/workflows              列表（支持 keyword / engineType / publishStatus 筛选）
 *   POST   /admin/workflows              新增
 *   GET    /admin/workflows/review       审核队列（publishStatus=pending_review）
 *   GET    /admin/workflows/stats        统计
 *   GET    /admin/workflows/:id          详情
 *   PATCH  /admin/workflows/:id          编辑
 *   DELETE /admin/workflows/:id          删除
 *   POST   /admin/workflows/:id/review   审核（approve|reject）
 *   POST   /admin/workflows/:id/approve  通过审核
 *   POST   /admin/workflows/:id/reject   驳回审核
 *   POST   /admin/workflows/import-github  GitHub 导入
 *   GET    /admin/workflows/:id/exec-logs 执行日志
 *   GET    /admin/workflows/:id/mcp-binds  MCP 绑定列表
 *   POST   /admin/workflows/:id/mcp-binds  创建 MCP 绑定
 *   DELETE /admin/workflows/mcp-binds/:bindId 删除 MCP 绑定
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


  @Post('import-local')
  @ApiOperation({ summary: '本地上传导入工作流（.json 或 .zip，支持多文件）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async importLocal(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请上传工作流文件');
    }
    return this.service.importLocalFiles(files);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除工作流' })
  async batchDelete(@Body() dto: BatchDeleteDto) {
    return this.service.batchDelete(dto.ids);
  }

  @Post('batch-approve')
  @ApiOperation({ summary: '批量通过审核' })
  async batchApprove(@Body() dto: BatchReviewDto) {
    return this.service.batchApprove(dto.ids);
  }

  @Post('batch-reject')
  @ApiOperation({ summary: '批量驳回审核' })
  async batchReject(@Body() dto: BatchReviewDto) {
    return this.service.batchReject(dto.ids, dto.reason || '');
  }


  @ApiOperation({ summary: 'GitHub 导入工作流（支持单文件或批量）' })
  async importFromGithub(@Body() dto: ImportGithubWorkflowDto) {
    return this.service.importFromGithub(dto);
  }

  @Get('review')
  @ApiOperation({ summary: '审核队列' })
  async listReview(@Query() query: AdminWorkflowQueryDto) {
    return this.service.list({ ...query, publishStatus: 'pending_review' });
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

  // ── 执行日志 ──────────────────────────────────────────────

  @Get(':id/exec-logs')
  @ApiOperation({ summary: '执行日志' })
  async listExecLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: any,
  ) {
    return this.service.listExecLogs({ ...query, workflowLibId: id });
  }

  // ── MCP 绑定 ──────────────────────────────────────────────

  @Get(':id/mcp-binds')
  @ApiOperation({ summary: 'MCP 绑定列表' })
  async listBinds(@Param('id', ParseIntPipe) id: number) {
    return this.service.listBinds(id);
  }

  @Post(':id/mcp-binds')
  @ApiOperation({ summary: '创建 MCP 绑定' })
  async createBind(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { mcpResourceId: number; bindType: 'input' | 'output' | 'trigger'; config?: Record<string, unknown> },
  ) {
    return this.service.createBind(id, body.mcpResourceId, body.bindType, body.config);
  }

  @Delete('mcp-binds/:bindId')
  @ApiOperation({ summary: '删除 MCP 绑定' })
  async deleteBind(@Param('bindId', ParseIntPipe) bindId: number) {
    await this.service.deleteBind(bindId);
    return null;
  }
}
