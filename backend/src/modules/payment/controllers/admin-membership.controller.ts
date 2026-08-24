/**
 * 会员管理后台端点（M7-4）
 * POST   /admin/membership/redeem-codes/generate  批量生成兑换码
 * GET    /admin/membership/redeem-codes           兑换码列表（按批次/状态）
 * POST   /admin/membership/redeem-codes/:code/revoke  作废兑换码
 * POST   /admin/membership/users/:userId/grant    直接开通/延期会员
 */
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../admin-auth/admin.guard';
import { MembershipService } from '../services/membership.service';
import { MembershipLevel } from '../entities/user-membership.entity';

@ApiTags('会员管理（后台）')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/membership')
export class AdminMembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('redeem-codes/generate')
  @ApiOperation({ summary: '批量生成兑换码' })
  generateCodes(
    @Body() body: { level: MembershipLevel; durationDays: number; count: number; batchId?: string },
  ) {
    return this.membershipService.generateCodes(body.level, body.durationDays, body.count, body.batchId);
  }

  @Get('redeem-codes')
  @ApiOperation({ summary: '兑换码列表（批次/状态筛选）' })
  listCodes(@Query('batchId') batchId?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.membershipService.listCodes({
      batchId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('redeem-codes/:code/revoke')
  @ApiOperation({ summary: '作废兑换码' })
  revokeCode(@Param('code') code: string) {
    return this.membershipService.revokeCode(code);
  }

  @Post('users/:userId/grant')
  @ApiOperation({ summary: '直接开通/延期会员' })
  grant(
    @Param('userId') userId: string,
    @Body() body: { level: MembershipLevel; durationDays: number },
  ) {
    return this.membershipService.grantMembership(Number(userId), body.level, body.durationDays);
  }
}
