import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SyncService, SyncUploadItem } from './services/sync.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class BatchUploadDto {
  items: SyncUploadItem[];
}

/**
 * 同步控制器
 * 数据合同真源：Task 31 - 数据同步设计
 */
@ApiTags('同步')
@ApiBearerAuth()
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.syncService.health();
  }

  @Post('batch')
  @ApiOperation({ summary: '批量上行同步数据' })
  async batch(
    @Body() dto: BatchUploadDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.syncService.batchUpload(user.userId, dto.items || []);
  }

  @Get('pull')
  @ApiOperation({ summary: '增量下行同步数据' })
  async pull(
    @CurrentUser() user: ICurrentUser,
    @Query('since') since?: string,
    @Query('types') types?: string,
  ) {
    const sinceDate = since ? new Date(since) : new Date(0);
    const typeList = types ? types.split(',').filter(Boolean) : undefined;
    return this.syncService.pull(user.userId, sinceDate, typeList);
  }

  @Get('status')
  @ApiOperation({ summary: '查询同步状态' })
  async status(@CurrentUser() user: ICurrentUser) {
    return this.syncService.getSyncStatus(user.userId);
  }
}
