import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MediaAssetService } from '../services/media-asset.service';
import {
  CreateMediaAssetDto,
  UpdateMediaAssetDto,
  ImportMediaAssetDto,
  MediaAssetQueryDto,
} from '../dto/media-asset.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

/**
 * 素材资产控制器
 * 提供素材库的手动登记、列表查询、导入、更新与详情
 */
@ApiTags('素材资产')
@ApiBearerAuth()
@Controller('media-assets')
export class MediaAssetController {
  constructor(private readonly mediaAssetService: MediaAssetService) {}

  @Post()
  @ApiOperation({ summary: '手动登记素材（manual）' })
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateMediaAssetDto) {
    return this.mediaAssetService.create(userId, dto);
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
    return this.mediaAssetService.update(userId, id, dto);
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