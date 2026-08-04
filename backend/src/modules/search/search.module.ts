import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';

/**
 * 搜索模块
 * 数据合同真源：desktop/src/api/search-api.ts（DEFAULT_CATEGORIES）
 * 端点：GET /search/categories（全局前缀 /api，需登录）
 */
@Module({
  imports: [],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
