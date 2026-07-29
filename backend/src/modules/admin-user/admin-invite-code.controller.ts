import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { InviteCodeService } from '../user/invite-code.service';
import { GenerateInviteCodesDto } from './dto/generate-invite-codes.dto';
import { InviteCodeQueryDto } from './dto/invite-code-query.dto';

/**
 * 管理端邀请码控制器
 *
 * 端点：
 *   POST   /admin/invite-codes/generate   批量生成邀请码
 *   GET    /admin/invite-codes            邀请码列表
 *   POST   /admin/invite-codes/:id/revoke 作废邀请码
 */
@ApiTags('管理端-邀请码')
@ApiBearerAuth()
@Public()
@Controller('admin/invite-codes')
@UseGuards(AdminGuard)
export class AdminInviteCodeController {
  constructor(private readonly inviteCodeService: InviteCodeService) {}

  @Post('generate')
  @ApiOperation({ summary: '批量生成邀请码' })
  async generate(
    @Body() dto: GenerateInviteCodesDto,
    @Req() req: any,
  ) {
    const adminId = req.adminUser?.id ?? 0;
    const codes: { id: number; code: string; expiresAt: Date }[] = [];
    for (let i = 0; i < dto.count; i++) {
      const entity = await this.inviteCodeService.generateCode(
        adminId,
        dto.expireDays,
      );
      codes.push({
        id: entity.id,
        code: entity.code,
        expiresAt: entity.expiresAt,
      });
    }
    return { codes, count: codes.length };
  }

  @Get()
  @ApiOperation({ summary: '邀请码列表' })
  async list(@Query() query: InviteCodeQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const result = await this.inviteCodeService.listAdminCodes({
      status: query.status,
      page,
      pageSize,
    });
    return result;
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: '作废邀请码' })
  async revoke(@Param('id', ParseIntPipe) id: number) {
    await this.inviteCodeService.revokeCode(id);
    return { success: true };
  }
}
