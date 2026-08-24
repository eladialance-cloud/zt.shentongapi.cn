/**
 * 会员用户端点（M7-2/M7-4）
 * GET  /membership/status   会员状态（等级 + features + 到期/宽限）
 * POST /membership/redeem   兑换码兑换（开通/续期会员）
 */
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { MembershipService } from '../services/membership.service';

@ApiTags('会员')
@ApiBearerAuth()
@Controller('membership')
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('status')
  @ApiOperation({ summary: '会员状态（等级/features/到期宽限）' })
  status(@CurrentUser() user: ICurrentUser) {
    return this.membershipService.getStatus(user.userId);
  }

  @Post('redeem')
  @ApiOperation({ summary: '兑换码开通/续期会员' })
  redeem(@CurrentUser() user: ICurrentUser, @Body() body: { code: string }) {
    return this.membershipService.redeem(user.userId, body.code);
  }
}
