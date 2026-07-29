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
import { AdminWorkflowLibService } from './admin-workflow-lib.service';
import {
  CreateWorkflowLibDto,
  UpdateWorkflowLibDto,
  ImportGithubWorkflowDto,
} from './dto/workflow-lib.dto';

/**
 * 管理端工作流库扩展控制器
 * 全局工作流库 + GitHub 导入 + 执行日志 + MCP 绑定
 */
@ApiTags('管理端-工作流库')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/workflow-lib')
export class AdminWorkflowLibController {
  constructor(private readonly service: AdminWorkflowLibService) {}

  // ============ 工作流库 CRUD ============

  @Get()
  @ApiOperation({ summary: '工作流库列表' })
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '工作流库详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '创建工作流' })
  create(@Body() dto: CreateWorkflowLibDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新工作流' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkflowLibDto,
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除工作流' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id);
    return null;
  }

  // ============ GitHub 导入 ============

  @Post('import-github')
  @ApiOperation({ summary: '从 GitHub 导入工作流（支持单文件或批量）' })
  importFromGithub(@Body() dto: ImportGithubWorkflowDto) {
    return this.service.importFromGithub(dto);
  }

  // ============ 执行日志 ============

  @Get(':id/exec-logs')
  @ApiOperation({ summary: '工作流执行日志' })
  listExecLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: any,
  ) {
    return this.service.listExecLogs({ ...query, workflowLibId: id });
  }

  // ============ MCP 绑定 ============

  @Get(':id/mcp-binds')
  @ApiOperation({ summary: '工作流 MCP 绑定列表' })
  listBinds(@Param('id', ParseIntPipe) id: number) {
    return this.service.listBinds(id);
  }

  @Post(':id/mcp-binds')
  @ApiOperation({ summary: '创建 MCP 绑定' })
  createBind(
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
