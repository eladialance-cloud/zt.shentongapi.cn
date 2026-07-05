import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminUserService } from './admin-user.service';
import { UserLevelConfigDto } from './dto/user-level-config.dto';

/**
 * 管理端用户等级配置控制器
 * 数据合同真源：Task 18 - 用户管理
 *
 * 端点：
 *   GET  /admin/user-levels           用户等级列表
 *   PUT  /admin/user-levels/:level    更新等级配置
 */
@ApiTags('管理端-用户等级')
@ApiBearerAuth()
@Public()
@Controller('admin/user-levels')
@UseGuards(AdminGuard)
export class AdminUserLevelController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: '用户等级配置列表' })
  async list() {
    return this.service.listUserLevels();
  }

  @Put(':level')
  @ApiOperation({ summary: '更新等级配置' })
  async update(
    @Param('level', ParseIntPipe) level: number,
    @Body() dto: UserLevelConfigDto,
  ) {
    await this.service.updateUserLevelConfig(level, dto);
  }
}
