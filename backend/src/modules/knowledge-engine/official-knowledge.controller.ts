import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KnowledgeEngineService } from './knowledge-engine.service';

/**
 * 用户端官方知识库（已发布）列表
 * 路径前缀：/api/knowledge/official
 * 契约：分页 + 行业筛选；桌面端 Phase 2 展示用
 */
@ApiTags('知识库')
@ApiBearerAuth()
@Controller('knowledge/official')
export class OfficialKnowledgeController {
  constructor(
    private readonly engineService: KnowledgeEngineService,
  ) {}

  @Get('industries')
  @ApiOperation({ summary: '行业分类列表（官方库筛选用）' })
  industries() {
    return this.engineService.listIndustries();
  }

  @Get()
  @ApiOperation({ summary: '已发布官方知识库列表（按行业筛选）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'industryId', required: false, type: Number })
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('industryId') industryId?: number,
  ) {
    return this.engineService.listOfficialBases({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      industryId: industryId ? Number(industryId) : undefined,
    });
  }
}
