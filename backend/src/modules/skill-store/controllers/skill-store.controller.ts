import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { BigIntParsePipe } from '../../../common/pipes/bigint-parse.pipe';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import {
  SkillStoreService,
  SkillPackageListQuery,
} from '../services/skill-store.service';
import { SkillRunnerService } from '../services/skill-runner.service';
import { ExecuteSkillDto } from '../dto/execute.dto';

@ApiTags('技能商店')
@ApiBearerAuth()
@Controller('skill-store')
export class SkillStoreController {
  constructor(
    private readonly storeService: SkillStoreService,
    private readonly runnerService: SkillRunnerService,
  ) {}

  @Get('packages')
  @ApiOperation({ summary: '技能商店列表（仅 published）' })
  async list(@Query() query: SkillPackageListQuery) {
    return this.storeService.list(query);
  }

  @Get('categories')
  @ApiOperation({ summary: '技能分类列表' })
  async categories() {
    return this.storeService.categories();
  }

  @Get('packages/:id')
  @ApiOperation({ summary: '技能详情' })
  async detail(@Param('id', BigIntParsePipe) id: number) {
    return this.storeService.detail(id);
  }

  @Get('packages/:id/stats')
  @ApiOperation({ summary: '调用统计' })
  async stats(@Param('id', BigIntParsePipe) id: number) {
    return this.storeService.stats(id);
  }

  @Post('packages/:id/execute')
  @ApiOperation({ summary: '执行技能' })
  async execute(
    @Param('id', BigIntParsePipe) id: number,
    @Body() dto: ExecuteSkillDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.runnerService.execute(id, dto.input || {}, user.userId);
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return { status: 'ok', module: 'skill-store' };
  }
}
