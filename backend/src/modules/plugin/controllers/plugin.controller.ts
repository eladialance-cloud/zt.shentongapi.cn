import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PluginService } from '../services/plugin.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { Pagination } from '../../../common/decorators/pagination.decorator';
import { PaginationQuery } from '../../../common/types/pagination.type';

/**
 * 用户端插件控制器
 * 数据合同真源：desktop types/plugin
 *
 * 端点：
 *   GET    /plugins/market       插件市场列表（分页）
 *   GET    /plugins/installed    已安装插件列表（分页）
 *   GET    /plugins/logs         调用日志（分页）
 *   POST   /plugins/:id/install  安装插件
 *   DELETE /plugins/:id          卸载插件
 *   POST   /plugins/:id/enable   启用插件
 *   POST   /plugins/:id/disable  禁用插件
 *   PATCH  /plugins/:id/config   更新插件配置
 */
@ApiTags('插件')
@ApiBearerAuth()
@Controller('plugins')
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  // ─── 健康检查（公开） ─────────────────────────────────────

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.pluginService.health();
  }

  // ─── 插件市场 ────────────────────────────────────────────

  @Get('market')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '插件市场列表' })
  async listMarket(@Pagination() query: Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & { keyword?: string }) {
    return this.pluginService.listMarket(query);
  }

  // ─── 已安装插件 ──────────────────────────────────────────

  @Get('installed')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '已安装插件列表' })
  async listInstalled(
    @CurrentUser() user: ICurrentUser,
    @Pagination() query: Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & { keyword?: string },
  ) {
    return this.pluginService.listInstalled(user.userId, query);
  }

  // ─── 调用日志 ────────────────────────────────────────────

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '插件调用日志' })
  async listLogs(
    @CurrentUser() user: ICurrentUser,
    @Pagination() query: Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & { keyword?: string },
  ) {
    return this.pluginService.listLogs(user.userId, query);
  }

  // ─── 安装 / 卸载 ─────────────────────────────────────────

  @Post(':id/install')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '安装插件' })
  async install(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.pluginService.install(id, user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '卸载插件' })
  async uninstall(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.pluginService.uninstall(id, user.userId);
    return null;
  }

  // ─── 启用 / 禁用 ─────────────────────────────────────────

  @Post(':id/enable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '启用插件' })
  async enable(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.pluginService.enable(id, user.userId);
    return null;
  }

  @Post(':id/disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '禁用插件' })
  async disable(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ) {
    await this.pluginService.disable(id, user.userId);
    return null;
  }

  // ─── 更新配置 ────────────────────────────────────────────

  @Patch(':id/config')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新插件配置' })
  async updateConfig(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
    @Body() body: { config: Record<string, unknown> },
  ) {
    await this.pluginService.updateConfig(id, user.userId, body.config);
    return null;
  }
}
