import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentService } from '../services/agent.service';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { CreateReviewDto } from '../dto/create-review.dto';
import { CreateAgentDto } from '../dto/create-agent.dto';
import { UpdateAgentDto } from '../dto/update-agent.dto';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';

/**
 * Agent 智能体控制器（用户端）
 * 数据合同真源：desktop types/agent + types/agent-creator
 *
 * 注意：market/creator/favorites/installed/usage-logs 等静态段路由
 * 必须注册在 @Get(':id') 之前，避免被 :id 吞掉。
 */
@ApiTags('Agent智能体')
@ApiBearerAuth()
@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.agentService.health();
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: '获取 Agent 分类列表' })
  categories() {
    return this.agentService.listCategories();
  }

  // ─── Agent 市场 ───────────────────────────────────────────

  @Get('market')
  @Public()
  @ApiOperation({ summary: 'Agent 市场列表' })
  async marketList(
    @Query('tab') tab?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.agentService.marketList({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      tab,
      category,
      keyword,
    });
  }

  @Get('market/:id')
  @Public()
  @ApiOperation({ summary: 'Agent 市场详情' })
  marketDetail(@Param('id', ParseIntPipe) id: number) {
    return this.agentService.marketDetail(id);
  }

  @Get('market/:id/reviews')
  @Public()
  @ApiOperation({ summary: 'Agent 评价列表' })
  reviews(@Param('id', ParseIntPipe) id: number) {
    return this.agentService.listReviews(id);
  }

  @Post('market/:id/reviews')
  @ApiOperation({ summary: '创建 Agent 评价' })
  async createReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateReviewDto,
  ) {
    await this.agentService.createReview(id, user.userId, dto);
    return null;
  }

  @Post('market/:id/favorite')
  @ApiOperation({ summary: '收藏 Agent' })
  async favorite(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.agentService.favorite(id, user.userId);
    return null;
  }

  @Delete('market/:id/favorite')
  @ApiOperation({ summary: '取消收藏 Agent' })
  async unfavorite(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.agentService.unfavorite(id, user.userId);
    return null;
  }

  @Post('market/:id/install')
  @ApiOperation({ summary: '安装/下载 Agent' })
  async install(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
    @Body() body: { version?: string },
  ) {
    return this.agentService.install(id, user.userId, body?.version);
  }

  // ─── 我的收藏 / 使用记录 / 已安装 ─────────────────────────

  @Get('favorites')
  @ApiOperation({ summary: '我的收藏列表' })
  favorites(@CurrentUser() user: ICurrentUser) {
    return this.agentService.listFavorites(user.userId);
  }

  @Get('usage-logs')
  @ApiOperation({ summary: '我的使用记录' })
  usageLogs(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.agentService.listUsageLogs(
      user.userId,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }

  @Get('installed')
  @ApiOperation({ summary: '已安装 Agent 列表' })
  installed(@CurrentUser() user: ICurrentUser) {
    return this.agentService.listInstalled(user.userId);
  }

  @Delete('installed/:id')
  @ApiOperation({ summary: '卸载 Agent' })
  async uninstall(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.agentService.uninstall(id, user.userId);
    return null;
  }

  // ─── 创作者（静态段路由必须先于 creator/:id）─────────────

  @Get('creator')
  @ApiOperation({ summary: '我的 Agent 列表' })
  creatorList(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.agentService.listCreator(
      user.userId,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
      status,
    );
  }

  @Post('creator')
  @ApiOperation({ summary: '创建 Agent（默认草稿）' })
  createCreator(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateAgentDto,
  ) {
    return this.agentService.createCreator(user.userId, dto);
  }

  @Get('creator/revenue/summary')
  @ApiOperation({ summary: '收益汇总' })
  revenueSummary(@CurrentUser() user: ICurrentUser) {
    return this.agentService.getRevenueSummary(user.userId);
  }

  @Get('creator/withdrawals')
  @ApiOperation({ summary: '提现记录' })
  withdrawals(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.agentService.listWithdrawals(
      user.userId,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }

  @Post('creator/withdrawal')
  @ApiOperation({ summary: '申请提现' })
  requestWithdrawal(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateWithdrawalDto,
  ) {
    return this.agentService.requestWithdrawal(user.userId, dto.amount);
  }

  @Get('creator/:id')
  @ApiOperation({ summary: '我的 Agent 详情（非本人 404）' })
  creatorDetail(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agentService.getCreatorDetail(user.userId, id);
  }

  @Patch('creator/:id')
  @ApiOperation({ summary: '更新我的 Agent' })
  updateCreator(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentService.updateCreator(user.userId, id, dto);
  }

  @Delete('creator/:id')
  @ApiOperation({ summary: '删除我的 Agent（仅草稿）' })
  async deleteCreator(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.agentService.deleteCreator(user.userId, id);
    return null;
  }

  @Post('creator/:id/submit')
  @ApiOperation({ summary: '提交审核' })
  submitCreator(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agentService.submitCreator(user.userId, id);
  }

  // ─── 兜底：Agent 详情（保持旧契约兼容）────────────────────

  @Get(':id')
  @Public()
  @ApiOperation({ summary: '获取 Agent 详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    const agent = await this.agentService.getDetail(id);
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    return agent;
  }
}
