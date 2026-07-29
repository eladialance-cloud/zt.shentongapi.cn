import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminAgentExtService } from './admin-agent-ext.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/agent-department.dto';
import { CreateTagDto, UpdateTagDto, BindTagsDto } from './dto/agent-tag.dto';

/**
 * 管理端 Agent 扩展控制器
 * 部门分类管理 + 标签库管理 + 版本管理 + 同步更新
 */
@ApiTags('管理端-Agent 扩展')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/agent-ext')
export class AdminAgentExtController {
  constructor(private readonly service: AdminAgentExtService) {}

  // ============ 部门分类 ============

  @Get('departments')
  @ApiOperation({ summary: '部门分类列表' })
  listDepartments() {
    return this.service.listDepartments();
  }

  @Post('departments')
  @ApiOperation({ summary: '创建部门分类' })
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.service.createDepartment(dto);
  }

  @Patch('departments/:id')
  @ApiOperation({ summary: '更新部门分类' })
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.service.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @ApiOperation({ summary: '删除部门分类' })
  async deleteDepartment(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteDepartment(id);
    return null;
  }

  // ============ 标签库 ============

  @Get('tags')
  @ApiOperation({ summary: '标签列表' })
  listTags() {
    return this.service.listTags();
  }

  @Post('tags')
  @ApiOperation({ summary: '创建标签' })
  createTag(@Body() dto: CreateTagDto) {
    return this.service.createTag(dto);
  }

  @Patch('tags/:id')
  @ApiOperation({ summary: '更新标签' })
  updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.service.updateTag(id, dto);
  }

  @Delete('tags/:id')
  @ApiOperation({ summary: '删除标签' })
  async deleteTag(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteTag(id);
    return null;
  }

  // ============ Agent-标签绑定 ============

  @Post('agents/:agentId/tags')
  @ApiOperation({ summary: '为 Agent 绑定标签' })
  async bindTags(
    @Param('agentId', ParseIntPipe) agentId: number,
    @Body() dto: BindTagsDto,
  ) {
    await this.service.bindTags(agentId, dto);
    return null;
  }

  @Get('agents/:agentId/tags')
  @ApiOperation({ summary: '获取 Agent 的标签' })
  getAgentTags(@Param('agentId', ParseIntPipe) agentId: number) {
    return this.service.getAgentTags(agentId);
  }

  // ============ 版本管理 ============

  @Get('agents/:agentId/version')
  @ApiOperation({ summary: '获取 Agent 版本信息' })
  getAgentVersion(@Param('agentId', ParseIntPipe) agentId: number) {
    return this.service.getAgentVersion(agentId);
  }

  @Post('agents/:agentId/version/bump')
  @ApiOperation({ summary: '提升 Agent 版本号' })
  bumpVersion(@Param('agentId', ParseIntPipe) agentId: number) {
    return this.service.bumpVersion(agentId);
  }

  // ============ 同步更新 ============

  @Post('agents/:agentId/sync')
  @ApiOperation({ summary: '同步 Agent 到 OpenClaw' })
  syncToOpenClaw(@Param('agentId', ParseIntPipe) agentId: number) {
    return this.service.syncToOpenClaw(agentId);
  }
}
