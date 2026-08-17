import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOssService } from './admin-oss.service';
import { AdminGuard } from '../admin-auth/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateOssConfigDto, UpdateOssConfigDto, OssProvider } from './dto/admin-oss.dto';

/**
 * 管理端OSS配置控制器
 *
 * 端点：
 *   GET    /admin/oss/configs          配置列表
 *   GET    /admin/oss/configs/:id      配置详情
 *   POST   /admin/oss/configs          创建配置
 *   PATCH  /admin/oss/configs/:id      更新配置
 *   DELETE /admin/oss/configs/:id      删除配置
 *   POST   /admin/oss/configs/:id/test 测试连通性
 *   GET    /admin/oss/configs/:id/stats 存储统计
 *
 * 所有端点均标注 @Public() 跳过全局用户端 JwtAuthGuard，
 * 由 AdminGuard 使用 ADMIN_JWT_SECRET 统一校验。
 */
@ApiTags('管理端-OSS配置')
@ApiBearerAuth()
@Controller('admin/oss')
@Public()
@UseGuards(AdminGuard)
export class AdminOssController {
  constructor(private readonly service: AdminOssService) {}

  @Get('configs')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '获取OSS配置列表' })
  async listConfigs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('provider') provider?: OssProvider,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.listConfigs({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      provider,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('configs/:id')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '获取OSS配置详情' })
  async getConfig(@Param('id', ParseIntPipe) id: number) {
    return this.service.getConfig(id);
  }

  @Post('configs')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '创建OSS配置' })
  async createConfig(@Body() dto: CreateOssConfigDto) {
    return this.service.createConfig(dto);
  }

  @Patch('configs/:id')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '更新OSS配置' })
  async updateConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOssConfigDto,
  ) {
    return this.service.updateConfig(id, dto);
  }

  @Delete('configs/:id')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '删除OSS配置' })
  async deleteConfig(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteConfig(id);
    return null;
  }

  @Post('configs/:id/test')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '测试OSS连通性' })
  async testConnection(@Param('id', ParseIntPipe) id: number) {
    return this.service.testConnection(id);
  }

  @Get('configs/:id/stats')
  @Public()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '获取OSS存储统计' })
  async getStorageStats(@Param('id', ParseIntPipe) id: number) {
    return this.service.getStorageStats(id);
  }
}
