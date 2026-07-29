import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CommunityService } from '../community.service';

/**
 * 社区用户控制器（公开）
 * 数据合同真源：Community 模块 - 用户档案
 */
@ApiTags('社区-用户')
@Public()
@Controller('community')
export class CommunityUserController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('users/:id/profile')
  @ApiOperation({ summary: '获取用户社区档案' })
  async getUserProfile(@Param('id', ParseIntPipe) id: number) {
    return this.communityService.getUserProfile(id);
  }
}
