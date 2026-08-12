import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkillSourcesService, SkillSourceListQuery } from '../services/skill-sources.service';

@ApiTags('技能源')
@ApiBearerAuth()
@Controller('skill-sources')
export class SkillSourcesController {
  constructor(private readonly service: SkillSourcesService) {}

  @Get()
  @ApiOperation({ summary: '技能源列表（GitHub 技能目录清单，含下载候选）' })
  list(@Query() query: SkillSourceListQuery) {
    return this.service.list(query);
  }

  @Get('categories')
  @ApiOperation({ summary: '技能源分类（中文）' })
  categories() {
    return this.service.categories();
  }
}
