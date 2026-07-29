import { Controller, Post, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CommunityService } from '../community.service';
import { VoteTargetType } from '../entities/vote.entity';

/**
 * 社区互动控制器
 * 数据合同真源：Community 模块 - 投票/收藏接口
 */
@ApiTags('社区-互动')
@ApiBearerAuth()
@Public()
@Controller('community')
export class CommunityInteractionController {
  constructor(private readonly communityService: CommunityService) {}

  @Post('posts/:id/vote')
  @ApiOperation({ summary: '帖子投票' })
  async votePost(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('value') value: number,
  ) {
    return this.communityService.vote(userId, VoteTargetType.POST, id, value);
  }

  @Post('posts/:id/bookmark')
  @ApiOperation({ summary: '收藏帖子' })
  async bookmark(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.communityService.bookmark(userId, id);
    return null;
  }

  @Delete('posts/:id/bookmark')
  @ApiOperation({ summary: '取消收藏帖子' })
  async unbookmark(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.communityService.unbookmark(userId, id);
    return null;
  }
}
