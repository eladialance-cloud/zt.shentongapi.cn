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
import { PaginationDto, RateSkillDto, CreateSkillDto } from '../dto/hermes.dto';
import { HermesReportDto } from '../dto/hermes-report.dto';

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

  // ============ 本地编排结果上报（桌面端） ============

  @Post('executions/report')
  @ApiOperation({ summary: '本地 Hermes 编排结果上报（桌面端）' })
  reportExecution(
    @CurrentUser('userId') userId: number,
    @Body() dto: HermesReportDto,
  ) {
    return this.service.reportLocalExecution(userId, dto);
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