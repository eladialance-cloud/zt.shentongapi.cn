import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MediaAssetService } from '../services/media-asset.service';
import {
  CreateMediaAssetDto,
  UpdateMediaAssetDto,
  ImportMediaAssetDto,
  MediaAssetQueryDto,
  MaterialSearchQueryDto,
} from '../dto/media-asset.dto';
import { MaterialSearchService } from '../services/material-search.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

/**
 * 素材资产控制器
 * 提供素材库的手动登记、列表查询、导入、更新与详情
 */
@ApiTags('素材资产')
@ApiBearerAuth()
@Controller('media-assets')
export class MediaAssetController {
  private readonly logger = new Logger(MediaAssetController.name);

  constructor(
    private readonly mediaAssetService: MediaAssetService,
    private readonly materialSearch: MaterialSearchService,
  ) {}

  @Post()
  @ApiOperation({ summary: '手动登记素材（manual）' })
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateMediaAssetDto) {
    return this.mediaAssetService.create(userId, dto).then((asset) => {
      // 自动向量化（失败仅标记 vector_status=failed，不影响登记成功）
      if (dto.description || dto.tags?.length) {
        void this.materialSearch.vectorizeAsset(userId, asset.id).catch((err) => {
          this.logger.warn('[media-assets] 自动向量化失败: ' + (err as Error).message);
        });
      }
      return asset;
    });
  }

  @Get('search')
  @ApiOperation({ summary: '素材语义检索（Qdrant 优先，LIKE 降级）' })
  search(@CurrentUser('userId') userId: number, @Query() query: MaterialSearchQueryDto) {
    return this.materialSearch.search(userId, query);
  }

  @Post(':id/vectorize')
  @ApiOperation({ summary: '向量化素材（写入 Qdrant 语义检索索引）' })
  vectorize(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.materialSearch.vectorizeAsset(userId, id);
  }

  @Get()
  @ApiOperation({ summary: '素材列表（分页 + type/archived 过滤，倒序）' })
  list(@CurrentUser('userId') userId: number, @Query() query: MediaAssetQueryDto) {
    return this.mediaAssetService.list(userId, query);
  }

  @Post('import')
  @ApiOperation({ summary: '从任务输出 / 媒体生成任务批量导入素材（幂等）' })
  import(@CurrentUser('userId') userId: number, @Body() dto: ImportMediaAssetDto) {
    return this.mediaAssetService.import(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新素材（title/tags/archived）' })
  update(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMediaAssetDto,
  ) {
    return this.mediaAssetService.update(userId, id, dto).then((asset) => {
      if (dto.title !== undefined || dto.tags !== undefined || dto.description !== undefined) {
        void this.materialSearch.vectorizeAsset(userId, asset.id).catch((err) => {
          this.logger.warn('[media-assets] 更新后向量化失败: ' + (err as Error).message);
        });
      }
      return asset;
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '素材详情（权限校验）' })
  getOne(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mediaAssetService.getOne(userId, id);
  }
}