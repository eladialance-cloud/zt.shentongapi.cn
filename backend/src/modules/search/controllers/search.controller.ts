import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchCategory, SearchService } from '../services/search.service';

/**
 * 搜索控制器
 * 数据合同真源：desktop/src/api/search-api.ts
 *
 * 端点：
 *   GET /search/categories  搜索范围分类（SearchCategory[]）
 */
@ApiTags('搜索')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('categories')
  @ApiOperation({ summary: '搜索范围分类列表' })
  getCategories(): SearchCategory[] {
    return this.searchService.getCategories();
  }
}
