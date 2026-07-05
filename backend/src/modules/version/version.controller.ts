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
import { VersionService } from './services/version.service';
import { ClientVersionEntity } from './entities/client-version.entity';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

class CreateVersionDto {
  version: string;
  platform: 'win' | 'mac';
  downloadUrl: string;
  changelog?: string;
  forceUpdate?: boolean;
  grayscalePercent?: number;
  publishedAt?: Date;
  isActive?: boolean;
}

class UpdateVersionDto {
  version?: string;
  platform?: 'win' | 'mac';
  downloadUrl?: string;
  changelog?: string;
  forceUpdate?: boolean;
  grayscalePercent?: number;
  publishedAt?: Date;
  isActive?: boolean;
}

/**
 * 客户端版本控制器
 * 数据合同真源：Task 27 - 客户端版本管理
 */
@ApiTags('客户端版本')
@Controller()
export class VersionController {
  constructor(private readonly service: VersionService) {}

  @Get('version/health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  @Get('version/check')
  @Public()
  @ApiOperation({ summary: '客户端检查更新' })
  async check(
    @Query('platform') platform: 'win' | 'mac',
    @Query('currentVersion') currentVersion: string,
  ) {
    return this.service.checkUpdate(platform, currentVersion);
  }

  @Get('admin/versions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '版本列表' })
  async list(@Query('platform') platform?: string) {
    return this.service.list(platform);
  }

  @Get('admin/versions/latest')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '最新版本' })
  async latest(@Query('platform') platform: 'win' | 'mac') {
    return this.service.getLatest(platform);
  }

  @Post('admin/versions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '新增版本' })
  async create(@Body() dto: CreateVersionDto) {
    return this.service.create(dto as Partial<ClientVersionEntity>);
  }

  @Patch('admin/versions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '编辑版本' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.service.update(id, dto as Partial<ClientVersionEntity>);
  }

  @Delete('admin/versions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '删除版本' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id);
    return null;
  }

  @Get('admin/versions/:id/stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '版本统计' })
  async stats(@Param('id', ParseIntPipe) id: number) {
    return this.service.getStats(id);
  }
}
