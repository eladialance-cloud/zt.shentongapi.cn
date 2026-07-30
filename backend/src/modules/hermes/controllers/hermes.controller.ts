import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { HermesService } from '../services/hermes.service';
import { CreateInstanceDto, PaginationDto, ExecuteTaskDto, RateSkillDto, CreateSkillDto } from '../dto/hermes.dto';

@ApiTags('Hermes')
@ApiBearerAuth()
@Controller('hermes')
export class HermesController {
  constructor(private readonly service: HermesService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  // ============ 实例管理 ============

  @Get('instances')
  @ApiOperation({ summary: '获取 Hermes 实例列表' })
  listInstances(@CurrentUser() user: ICurrentUser) {
    return this.service.listInstances(user.userId);
  }

  @Post('instances')
  @ApiOperation({ summary: '创建 Hermes 实例' })
  createInstance(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateInstanceDto,
  ) {
    return this.service.createInstance(user.userId, dto);
  }

  @Get('instances/:id')
  @ApiOperation({ summary: '获取 Hermes 实例详情' })
  getInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getInstance(user.userId, id);
  }

  @Post('instances/:id/start')
  @ApiOperation({ summary: '启动 Hermes 实例' })
  startInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.startInstance(user.userId, id);
  }

  @Post('instances/:id/stop')
  @ApiOperation({ summary: '停止 Hermes 实例' })
  stopInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.stopInstance(user.userId, id);
  }

  @Delete('instances/:id')
  @ApiOperation({ summary: '删除 Hermes 实例' })
  async deleteInstance(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.deleteInstance(user.userId, id);
    return null;
  }

  @Get('instances/:id/call-logs')
  @ApiOperation({ summary: '获取实例任务历史' })
  getCallLogs(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationDto,
  ) {
    return this.service.getCallLogs(user.userId, id, query);
  }

  @Post('instances/:id/execute')
  @ApiOperation({ summary: '执行编排任务' })
  executeTask(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExecuteTaskDto,
  ) {
    return this.service.executeTask(user.userId, id, dto);
  }

  @Post('instances/:id/skills/:skillId/unmount')
  @ApiOperation({ summary: '卸载技能包' })
  unmountSkill(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.service.unmountSkill(user.userId, id, skillId);
  }

  @Post('instances/:id/skills/:skillId/mount')
  @ApiOperation({ summary: '挂载技能包' })
  mountSkill(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.service.mountSkill(user.userId, id, skillId);
  }

  // ============ 技能市场 ============

  @Get('skills/market')
  @ApiOperation({ summary: '获取技能市场列表' })
  @ApiQuery({ name: 'category', required: false, description: '分类筛选' })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词' })
  listMarketSkills(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listMarketSkills(category, search);
  }

  @Get('skills/categories')
  @ApiOperation({ summary: '获取技能分类列表' })
  listCategories() {
    return this.service.listCategories();
  }

  @Get('skills/installed')
  @ApiOperation({ summary: '获取已安装技能列表' })
  listInstalledSkills(@CurrentUser() user: ICurrentUser) {
    return this.service.listInstalledSkills(user.userId);
  }

  @Post('skills/:skillId/install')
  @ApiOperation({ summary: '安装技能包' })
  installSkill(
    @CurrentUser() user: ICurrentUser,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.service.installSkill(user.userId, skillId);
  }

  @Delete('skills/:skillId/uninstall')
  @ApiOperation({ summary: '卸载技能包（从所有实例移除）' })
  async uninstallSkill(
    @CurrentUser() user: ICurrentUser,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    await this.service.uninstallSkill(user.userId, skillId);
    return null;
  }

  @Post('skills/:skillId/rate')
  @ApiOperation({ summary: '评分技能包' })
  rateSkill(
    @CurrentUser() user: ICurrentUser,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Body() dto: RateSkillDto,
  ) {
    return this.service.rateSkill(user.userId, skillId, dto);
  }

  @Get('skills/:skillId/ratings')
  @ApiOperation({ summary: '获取技能包评分列表' })
  getSkillRatings(
    @Param('skillId', ParseIntPipe) skillId: number,
    @Query() query: PaginationDto,
  ) {
    return this.service.getSkillRatings(skillId, query);
  }

  @Get('skills/:skillId/update-check')
  @ApiOperation({ summary: '检查技能包版本更新' })
  checkSkillUpdate(
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.service.checkSkillUpdate(skillId);
  }

  @Post('skills')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建技能包（仅管理员）' })
  createSkill(@Body() dto: CreateSkillDto) {
    return this.service.createSkill(dto);
  }
}