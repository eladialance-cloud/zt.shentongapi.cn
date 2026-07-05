import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { StatisticsService } from '../services/statistics.service';
import { DashboardStatsService } from '../services/dashboard-stats.service';

/**
 * 统计控制器
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@ApiTags('统计')
@ApiBearerAuth()
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }
}

/**
 * 统计管理端控制器
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@ApiTags('统计-管理端')
@ApiBearerAuth()
@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AdminStatisticsController {
  constructor(private readonly dashboard: DashboardStatsService) {}

  @Get('overview')
  @ApiOperation({ summary: '仪表盘概览' })
  async overview(@Query('date') date?: string) {
    return this.dashboard.getOverview(date || new Date());
  }

  @Get('trends')
  @ApiOperation({ summary: '趋势分析' })
  async trends(
    @Query('metric') metric?: string,
    @Query('granularity') granularity?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const today = new Date();
    const end = endDate || this.fmt(today);
    const startD = new Date();
    startD.setDate(startD.getDate() - 30);
    return this.dashboard.getTrends(
      metric || 'dau',
      granularity || 'day',
      startDate || this.fmt(startD),
      end,
    );
  }

  @Get('rankings')
  @ApiOperation({ summary: '排行榜' })
  async rankings(
    @Query('type') type?: string,
    @Query('period') period?: string,
  ) {
    return this.dashboard.getRankings(type || 'agent', period || '7d');
  }

  @Get('retention')
  @ApiOperation({ summary: '用户留存' })
  async retention(@Query('period') period?: string) {
    return this.dashboard.getRetention(period || '30d');
  }

  @Get('realtime')
  @ApiOperation({ summary: '实时数据' })
  async realtime() {
    return this.dashboard.getRealtime();
  }

  @Get('today')
  @ApiOperation({ summary: '今日概览' })
  async today() {
    return this.dashboard.getToday();
  }

  private fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
