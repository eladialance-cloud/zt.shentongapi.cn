import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CommunityService } from '../community.service';

/**
 * 社区频道控制器（公开）
 * 数据合同真源：Community 模块 - 频道列表
 */
@ApiTags('社区-频道')
@Public()
@Controller('community')
export class CommunityChannelController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('channels')
  @ApiOperation({ summary: '获取所有启用的频道' })
  async listChannels() {
    return this.communityService.listChannels();
  }
}
