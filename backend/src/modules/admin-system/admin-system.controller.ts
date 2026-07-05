import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminSystemService } from './admin-system.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { ClearCacheDto } from './dto/clear-cache.dto';

/**
 * 管理端系统配置控制器
 * 数据合同真源：Task 28 - 系统配置 / frontend admin-system-api.ts
 *
 * 端点：
 *   GET    /admin/system/config        获取系统配置（按 section）
 *   PUT    /admin/system/config        更新系统配置
 *   POST   /admin/system/cache/clear   清空缓存
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-系统配置')
@ApiBearerAuth()
@Public()
@Controller('admin/system')
@UseGuards(AdminGuard)
export class AdminSystemController {
  constructor(private readonly service: AdminSystemService) {}

  @Get('config')
  @ApiOperation({ summary: '获取系统配置（按 section）' })
  async getConfig(
    @Query('section') section: string,
  ): Promise<Record<string, unknown>> {
    return this.service.getSystemConfig(section);
  }

  @Put('config')
  @ApiOperation({ summary: '更新系统配置' })
  async updateConfig(@Body() dto: UpdateSystemConfigDto) {
    await this.service.updateSystemConfig(dto);
    return null;
  }

  @Post('cache/clear')
  @ApiOperation({ summary: '清空缓存' })
  async clearCache(@Body() dto: ClearCacheDto) {
    await this.service.clearCache(dto);
    return null;
  }
}
