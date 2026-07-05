import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminUserService } from './admin-user.service';
import { UserQueryDto } from './dto/user-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { CreditsAdjustDto } from './dto/credits-adjust.dto';
import { UpdateUserLevelDto } from './dto/update-user-level.dto';

/**
 * 管理端用户控制器
 * 数据合同真源：Task 18 - 用户管理
 *
 * 端点：
 *   GET    /admin/users                           用户列表
 *   POST   /admin/users/:id/ban                   封禁用户
 *   POST   /admin/users/:id/unban                 解封用户
 *   PATCH  /admin/users/:id/level                 调整等级
 *   GET    /admin/users/:id/credits-account       用户积分账户
 *   POST   /admin/users/:id/credits-adjust        手动调整积分
 *   GET    /admin/users/:id/credits-transactions  积分流水
 */
@ApiTags('管理端-用户')
@ApiBearerAuth()
@Public()
@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUserController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  @ApiOperation({ summary: '用户列表' })
  async list(@Query() query: UserQueryDto) {
    return this.service.listUsers(query);
  }

  @Post(':id/ban')
  @ApiOperation({ summary: '封禁用户' })
  async ban(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BanUserDto,
  ) {
    await this.service.banUser(id, dto);
  }

  @Post(':id/unban')
  @ApiOperation({ summary: '解封用户' })
  async unban(@Param('id', ParseIntPipe) id: number) {
    await this.service.unbanUser(id);
  }

  @Patch(':id/level')
  @ApiOperation({ summary: '调整用户等级' })
  async updateLevel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserLevelDto,
  ) {
    await this.service.updateUserLevel(id, dto.level);
  }

  @Get(':id/credits-account')
  @ApiOperation({ summary: '用户积分账户' })
  async creditsAccount(@Param('id', ParseIntPipe) id: number) {
    return this.service.getCreditsAccount(id);
  }

  @Post(':id/credits-adjust')
  @ApiOperation({ summary: '手动调整积分' })
  async creditsAdjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditsAdjustDto,
    @Req() req: any,
  ) {
    await this.service.adjustCredits(id, dto, req.adminUser.id);
  }

  @Get(':id/credits-transactions')
  @ApiOperation({ summary: '用户积分流水' })
  async creditsTransactions(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.service.listCreditTransactions(id, limit ? Number(limit) : 50);
  }
}
