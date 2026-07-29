import { Controller, Get, Post, Param, Query, Body, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CommunityService } from '../community.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { QueryPostsDto } from '../dto/query-posts.dto';

/**
 * 社区帖子控制器
 * 数据合同真源：Community 模块 - 帖子接口
 */
@ApiTags('社区-帖子')
@ApiBearerAuth()
@Public()
@Controller('community')
export class CommunityPostController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts')
  @ApiOperation({ summary: '帖子列表' })
  async listPosts(@Query() query: QueryPostsDto) {
    return this.communityService.listPosts(query);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '帖子详情' })
  async getPost(@Param('id', ParseIntPipe) id: number) {
    return this.communityService.getPost(id);
  }

  @Post('posts')
  @ApiOperation({ summary: '创建帖子' })
  async createPost(
    @CurrentUser('userId') userId: number,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(userId, dto);
  }

  @Get('hot-topics')
  @ApiOperation({ summary: '热门帖子' })
  async listHotTopics(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, Number(limit) || 10));
    return this.communityService.listHotTopics(n);
  }

  @Get('active-users')
  @ApiOperation({ summary: '活跃用户' })
  async listActiveUsers(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, Number(limit) || 10));
    return this.communityService.listActiveUsers(n);
  }
}
