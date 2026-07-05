import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../../common/services/redis.service';
import { LogCollectionService } from './log-collection.service';

/**
 * 仪表盘统计服务
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@Injectable()
export class DashboardStatsService {
  private readonly logger = new Logger(DashboardStatsService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private redis: RedisService,
    private logCollection: LogCollectionService,
  ) {}

  /** 仪表盘概览（优先查 daily_stats，缺失回退实时聚合） */
  async getOverview(date: Date | string): Promise<Record<string, unknown>> {
    const dateStr = typeof date === 'string' ? date : this.formatDate(date);
    const rows: any[] = await this.dataSource.query(
      `SELECT * FROM daily_stats WHERE date = ? LIMIT 1`,
      [dateStr],
    );
    if (rows.length > 0) {
      return rows[0];
    }
    // 缺失：实时聚合后再次读取
    try {
      await this.logCollection.aggregateDailyStats(dateStr);
    } catch (e) {
      this.logger.warn?.(`回退聚合失败: ${(e as Error).message}`);
    }
    const rows2: any[] = await this.dataSource.query(
      `SELECT * FROM daily_stats WHERE date = ? LIMIT 1`,
      [dateStr],
    );
    return rows2[0] || { date: dateStr, dau: 0, newUsers: 0, totalUsers: 0, totalCalls: 0 };
  }

  /** 趋势分析（基于 daily_stats 预聚合） */
  async getTrends(
    metric: string,
    granularity: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; value: number }[]> {
    const allowed = [
      'dau', 'new_users', 'total_users', 'total_calls',
      'total_revenue', 'total_consumed', 'avg_order_value', 'online_users',
    ];
    const column = allowed.includes(metric) ? metric : 'dau';
    const rows: any[] = await this.dataSource.query(
      `SELECT date, ${column} AS value FROM daily_stats
       WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
      [startDate, endDate],
    );
    // granularity：day 直接返回；week/month 由调用端聚合（此处按 day 提供基础数据）
    void granularity;
    return rows.map((r) => ({ date: String(r.date), value: Number(r.value) }));
  }

  /** 排行榜（agent/workflow/plugin/model） */
  async getRankings(
    type: string,
    period: string,
  ): Promise<{ id: number; name: string; count: number }[]> {
    const { start, end } = this.periodRange(period);
    try {
      switch (type) {
        case 'agent':
          return await this.dataSource.query(
            `SELECT a.id, a.name, COUNT(l.id) AS count
             FROM agents a LEFT JOIN agent_call_logs l ON l.agent_id = a.id
             WHERE l.created_at IS NULL OR l.created_at BETWEEN ? AND ?
             GROUP BY a.id, a.name ORDER BY count DESC LIMIT 20`,
            [start, end],
          );
        case 'model':
          return await this.dataSource.query(
            `SELECT id, name, 0 AS count FROM models ORDER BY id ASC LIMIT 20`,
          );
        case 'plugin':
          return await this.dataSource.query(
            `SELECT id, name, 0 AS count FROM plugins ORDER BY id ASC LIMIT 20`,
          );
        case 'workflow':
          return await this.dataSource.query(
            `SELECT id, name, 0 AS count FROM workflows ORDER BY id ASC LIMIT 20`,
          );
        default:
          return [];
      }
    } catch (e) {
      this.logger.warn?.(`排行榜查询跳过: ${(e as Error).message}`);
      return [];
    }
  }

  /** 用户留存 cohort（简化：按注册周聚合活跃） */
  async getRetention(period: string): Promise<Record<string, unknown>[]> {
    const { start, end } = this.periodRange(period);
    try {
      const rows: any[] = await this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%u') AS cohort, COUNT(*) AS users
         FROM users WHERE created_at BETWEEN ? AND ?
         GROUP BY cohort ORDER BY cohort ASC`,
        [start, end],
      );
      return rows.map((r) => ({
        cohort: String(r.cohort),
        users: Number(r.users),
      }));
    } catch (e) {
      this.logger.warn?.(`留存查询跳过: ${(e as Error).message}`);
      return [];
    }
  }

  /** 实时数据（在线用户/实时调用，从 Redis 读取） */
  async getRealtime(): Promise<{ onlineUsers: number; callsLastMinute: number }> {
    let onlineUsers = 0;
    try {
      const v = await this.redis.get('stats:online_users');
      onlineUsers = v ? Number(v) : 0;
    } catch {
      onlineUsers = 0;
    }
    let callsLastMinute = 0;
    try {
      const c = await this.redis.get('stats:calls_last_minute');
      callsLastMinute = c ? Number(c) : 0;
    } catch {
      callsLastMinute = 0;
    }
    return { onlineUsers, callsLastMinute };
  }

  /** 今日概览（管理端首页用） */
  async getToday(): Promise<Record<string, unknown>> {
    const today = this.formatDate(new Date());
    return this.getOverview(today);
  }

  // ============ 内部工具 ============

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private periodRange(period: string): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    switch (period) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    return {
      start: this.formatDate(start) + ' 00:00:00',
      end: this.formatDate(end) + ' 23:59:59',
    };
  }
}
