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
import { AdminSystemService } from './admin-system.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/**
 * 管理端公告控制器
 * 数据合同真源：Task 28 - 系统配置 / frontend admin-system-api.ts
 *
 * 端点：
 *   GET    /admin/announcements              公告列表
 *   POST   /admin/announcements              新增公告
 *   PATCH  /admin/announcements/:id          编辑公告
 *   POST   /admin/announcements/:id/publish  发布公告
 *   POST   /admin/announcements/:id/unpublish  撤回公告
 *   DELETE /admin/announcements/:id          删除公告
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-公告')
@ApiBearerAuth()
@Public()
@Controller('admin/announcements')
@UseGuards(AdminGuard)
export class AdminAnnouncementController {
  constructor(private readonly service: AdminSystemService) {}

  @Get()
  @ApiOperation({ summary: '公告列表' })
  async list(@Query() query: AnnouncementQueryDto) {
    return this.service.listAnnouncements(query);
  }

  @Post()
  @ApiOperation({ summary: '新增公告' })
  async create(@Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑公告' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    await this.service.updateAnnouncement(id, dto);
    return null;
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '发布公告' })
  async publish(@Param('id', ParseIntPipe) id: number) {
    await this.service.publishAnnouncement(id);
    return null;
  }

  @Post(':id/unpublish')
  @ApiOperation({ summary: '撤回公告' })
  async unpublish(@Param('id', ParseIntPipe) id: number) {
    await this.service.unpublishAnnouncement(id);
    return null;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除公告' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.deleteAnnouncement(id);
    return null;
  }
}
