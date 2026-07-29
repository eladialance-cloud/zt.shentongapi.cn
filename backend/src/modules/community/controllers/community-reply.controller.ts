import { Controller, Get, Post, Put, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CommunityService } from '../community.service';
import { CreateReplyDto } from '../dto/create-reply.dto';

/**
 * 社区回复控制器
 * 数据合同真源：Community 模块 - 回复接口
 */
@ApiTags('社区-回复')
@ApiBearerAuth()
@Public()
@Controller('community')
export class CommunityReplyController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts/:id/replies')
  @ApiOperation({ summary: '帖子回复列表' })
  async listReplies(@Param('id', ParseIntPipe) id: number) {
    return this.communityService.listReplies(id);
  }

  @Post('posts/:id/replies')
  @ApiOperation({ summary: '创建回复' })
  async createReply(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReplyDto,
  ) {
    return this.communityService.createReply(userId, id, dto);
  }

  @Put('replies/:id/accept')
  @ApiOperation({ summary: '采纳最佳回复' })
  async acceptReply(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.communityService.acceptReply(userId, id);
  }
}
