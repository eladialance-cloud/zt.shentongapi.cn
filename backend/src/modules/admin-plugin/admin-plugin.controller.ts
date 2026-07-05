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
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminPluginService } from './admin-plugin.service';
import {
  AdminPluginQueryDto,
  AdminPluginReviewQueryDto,
  CreateAdminPluginDto,
  PluginSyncQueryDto,
  UpdateAdminPluginDto,
} from './dto/plugin.dto';
import { PluginRejectDto, PluginReviewDto } from './dto/review.dto';

/**
 * 管理端插件控制器
 * 数据合同真源：Task 22 - 插件管理 / frontend admin-plugin-api.ts
 *
 * 端点：
 *   GET    /admin/plugins                列表
 *   POST   /admin/plugins                新增
 *   GET    /admin/plugins/review         审核队列
 *   GET    /admin/plugins/sync-status    MCP 同步状态
 *   POST   /admin/plugins/sync           触发批量同步
 *   GET    /admin/plugins/:id            详情
 *   PATCH  /admin/plugins/:id            编辑
 *   DELETE /admin/plugins/:id            删除
 *   POST   /admin/plugins/:id/publish    上架
 *   POST   /admin/plugins/:id/unpublish  下架
 *   POST   /admin/plugins/:id/review     综合审核（approve|reject）
 *   POST   /admin/plugins/:id/approve    通过审核
 *   POST   /admin/plugins/:id/reject     驳回审核
 *   POST   /admin/plugins/:id/sync       手动同步
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-插件')
@ApiBearerAuth()
@Controller('admin/plugins')
@Public()
@UseGuards(AdminGuard)
export class AdminPluginController {
  constructor(private readonly service: AdminPluginService) {}

  @Get()
  @ApiOperation({ summary: '插件列表' })
  async list(@Query() query: AdminPluginQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: '新增插件' })
  async create(@Body() dto: CreateAdminPluginDto) {
    return this.service.create(dto);
  }

  @Get('review')
  @ApiOperation({ summary: '审核队列' })
  async listReview(@Query() query: AdminPluginReviewQueryDto) {
    return this.service.listReview(query);
  }

  @Get('sync-status')
  @ApiOperation({ summary: 'MCP 同步状态列表' })
  async listSyncStatus(@Query() query: PluginSyncQueryDto) {
    return this.service.listSyncStatus(query);
  }

  @Post('sync')
  @ApiOperation({ summary: '触发批量同步' })
  async syncAll() {
    return this.service.syncAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '插件详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑插件' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminPluginDto,
  ) {
    await this.service.update(id, dto);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除插件' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return null;
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '上架插件' })
  async publish(@Param('id', ParseIntPipe) id: number) {
    await this.service.publish(id);
    return null;
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: '下架插件' })
  async unpublish(@Param('id', ParseIntPipe) id: number) {
    await this.service.unpublish(id);
    return null;
  }

  @Post(':id/review')
  @ApiOperation({ summary: '审核插件（approve|reject）' })
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PluginReviewDto,
  ) {
    await this.service.review(id, dto.action, dto.reason);
    return null;
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '通过审核' })
  async approve(@Param('id', ParseIntPipe) id: number) {
    await this.service.approve(id);
    return null;
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回审核' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PluginRejectDto,
  ) {
    await this.service.reject(id, dto.reason);
    return null;
  }

  @Post(':id/sync')
  @ApiOperation({ summary: '手动同步插件' })
  async sync(@Param('id', ParseIntPipe) id: number) {
    return this.service.sync(id);
  }
}
