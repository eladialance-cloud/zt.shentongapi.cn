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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminAgentService } from './admin-agent.service';
import { AgentQueryDto } from './dto/agent-query.dto';
import { AgentReviewQueryDto } from './dto/agent-review-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { RejectAgentDto } from './dto/reject-agent.dto';
import { ImportGithubDto } from './dto/import-github.dto';
import { UpdateCategoryDisplayDto } from './dto/update-category-display.dto';

/**
 * 管理端 Agent 市场控制器
 * 数据合同真源：Task 20 - Agent 市场管理
 *
 * 端点（严格对齐前端 admin-agent-api.ts）：
 *   GET    /admin/agents                          Agent 列表
 *   POST   /admin/agents                          新增 Agent
 *   PATCH  /admin/agents/:id                      编辑 Agent
 *   DELETE /admin/agents/:id                      删除 Agent
 *   POST   /admin/agents/:id/publish              上架
 *   POST   /admin/agents/:id/unpublish            下架
 *   POST   /admin/agents/import-github            GitHub 仓库异步导入
 *   GET    /admin/agents/import-github/:taskId    查询导入任务状态
 *   GET    /admin/agents/review                   审核队列
 *   POST   /admin/agents/:id/approve             通过审核
 *   POST   /admin/agents/:id/reject              驳回审核
 *   POST   /admin/agents/:id/force-unpublish     强制下架
 *   GET    /admin/agents/categories              分类列表
 *   PATCH  /admin/agents/categories/:category    更新分类显示名
 *
 * 注意：具体路径（import-github/review/categories）需在 :id 路由之前声明，
 * 避免 NestJS 将其误匹配到 :id 参数。
 */
@ApiTags('管理端-Agent 市场')
@ApiBearerAuth()
@Public()
@Controller('admin/agents')
@UseGuards(AdminGuard)
export class AdminAgentController {
  constructor(private readonly service: AdminAgentService) {}

  // ============ 列表与 CRUD ============

  @Get()
  @ApiOperation({ summary: 'Agent 列表' })
  async list(@Query() query: AgentQueryDto) {
    return this.service.listAgents(query);
  }

  @Post()
  @ApiOperation({ summary: '新增 Agent' })
  async create(@Body() dto: CreateAgentDto) {
    return this.service.createAgent(dto);
  }

  // ============ 具名子路径（必须在 :id 之前声明） ============

  @Post('import-github')
  @ApiOperation({ summary: 'GitHub 仓库异步导入' })
  async importGithub(@Body() dto: ImportGithubDto) {
    return this.service.importGithub(dto);
  }

  @Get('import-github/:taskId')
  @ApiOperation({ summary: '查询 GitHub 导入任务状态' })
  async getImportTask(@Param('taskId') taskId: string) {
    return this.service.getImportTask(taskId);
  }

  @Get('review')
  @ApiOperation({ summary: '审核队列列表' })
  async listReview(@Query() query: AgentReviewQueryDto) {
    return this.service.listReview(query);
  }

  @Get('categories')
  @ApiOperation({ summary: '分类列表(含每分类 Agent 数量)' })
  async listCategories() {
    return this.service.listCategories();
  }

  @Patch('categories/:category')
  @ApiOperation({ summary: '更新分类显示名' })
  async updateCategoryDisplay(
    @Param('category') category: string,
    @Body() dto: UpdateCategoryDisplayDto,
  ) {
    await this.service.updateCategoryDisplay(category, dto);
  }

  // ============ :id 相关操作 ============

  @Get(':id')
  @ApiOperation({ summary: 'Agent 详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getAgentDetail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑 Agent' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentDto,
  ) {
    await this.service.updateAgent(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除 Agent' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteAgent(id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '上架 Agent' })
  async publish(@Param('id', ParseIntPipe) id: number) {
    await this.service.publishAgent(id);
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: '下架 Agent' })
  async unpublish(@Param('id', ParseIntPipe) id: number) {
    await this.service.unpublishAgent(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '通过审核' })
  async approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.service.approveAgent(id, req.adminUser.id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回审核' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAgentDto,
    @Req() req: any,
  ) {
    await this.service.rejectAgent(id, dto, req.adminUser.id);
  }

  @Post(':id/force-unpublish')
  @ApiOperation({ summary: '强制下架' })
  async forceUnpublish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAgentDto,
    @Req() req: any,
  ) {
    await this.service.forceUnpublishAgent(id, dto, req.adminUser.id);
  }
}
