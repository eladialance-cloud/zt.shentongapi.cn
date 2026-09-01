import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RedisService } from "../../../common/services/redis.service";
import { LogCollectionService } from "./log-collection.service";

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

  /** 仪表盘概览（优先查 daily_stats，缺失回退实时聚合）
   * 返回结构与前端 StatsOverview 契约一致（camelCase + 趋势数组） */
  async getOverview(date: Date | string): Promise<Record<string, unknown>> {
    const dateStr = typeof date === "string" ? date : this.formatDate(date);
    let row: any = null;
    try {
      const rows: any[] = await this.dataSource.query(
        `SELECT * FROM daily_stats WHERE date = ? LIMIT 1`,
        [dateStr],
      );
      if (rows.length > 0) {
        row = rows[0];
      } else {
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
        row = rows2[0] || null;
      }
    } catch (e: any) {
      this.logger.warn?.(`统计概览查询失败（可能表尚未创建）: ${e.message}`);
    }

    // 近 7 天调用量/收入趋势
    let trends: any[] = [];
    try {
      const start7 = new Date(dateStr);
      start7.setDate(start7.getDate() - 6);
      trends = await this.dataSource.query(
        `SELECT date, total_calls AS calls, total_revenue AS revenue
         FROM daily_stats WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
        [this.formatDate(start7), dateStr],
      );
    } catch (e: any) {
      this.logger.warn?.(`统计趋势查询失败: ${e.message}`);
    }

    const num = (v: any): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    return {
      date: dateStr,
      dau: num(row?.dau),
      newUsers: num(row?.new_users),
      totalUsers: num(row?.total_users),
      callCount: num(row?.total_calls),
      totalRevenue: num(row?.total_revenue),
      totalConsumption: num(row?.total_consumed),
      avgOrderValue: num(row?.avg_order_value),
      onlineUsers: num(row?.online_users),
      callTrend7d: trends.map((t) => ({ date: String(t.date), value: num(t.calls) })),
      revenueTrend7d: trends.map((t) => ({ date: String(t.date), value: num(t.revenue) })),
      modelConsumption: [],
      moduleCalls: [],
      // 兼容 /admin/stats/today（Dashboard 首页）
      revenue: num(row?.total_revenue),
      pendingAudit: 0,
    };
  }

  /** 趋势分析（基于 daily_stats 预聚合），返回结构与前端 StatsTrends 契约一致 */
  async getTrends(
    metric: string,
    granularity: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    metric: string;
    granularity: string;
    points: { date: string; value: number }[];
  }> {
    const metricColumnMap: Record<string, string> = {
      user_growth: "new_users",
      call_count: "total_calls",
      revenue: "total_revenue",
      consumption: "total_consumed",
      dau: "dau",
    };
    const column = metricColumnMap[metric] || "dau";
    let points: { date: string; value: number }[] = [];
    try {
      const rows: any[] = await this.dataSource.query(
        `SELECT date, ${column} AS value FROM daily_stats
         WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
        [startDate, endDate],
      );
      points = rows.map((r) => ({ date: String(r.date), value: Number(r.value) || 0 }));
    } catch (e: any) {
      this.logger.warn?.(`趋势查询失败（可能表尚未创建）: ${e.message}`);
    }
    return { metric, granularity, points };
  }

  /** 排行榜（agent/workflow/plugin/model），返回结构与前端 RankingItem 契约一致 */
  async getRankings(
    type: string,
    period: string,
  ): Promise<
    { id: number; name: string; callCount: number; revenue: number; avgRating: number; trendPercent: number }[]
  > {
    const { start, end } = this.periodRange(period);
    try {
      const rows: any[] = await this.dataSource.query(
        `SELECT a.id, a.name, a.rating, COUNT(l.id) AS call_count
         FROM eco_agents a LEFT JOIN agent_call_logs l ON l.agent_id = a.id
         WHERE l.created_at IS NULL OR l.created_at BETWEEN ? AND ?
         GROUP BY a.id, a.name, a.rating ORDER BY call_count DESC LIMIT 20`,
        [start, end],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        callCount: Number(r.call_count ?? 0),
        revenue: 0,
        avgRating: Number(r.rating ?? 0),
        trendPercent: 0,
      }));
    } catch (e: any) {
      this.logger.warn?.(`排行榜查询跳过: ${(e as Error).message}`);
      return [];
    }
  }

  /** 用户留存 cohort（简化：按注册周聚合活跃），返回结构与前端 StatsRetention 契约一致 */
  async getRetention(
    period: string,
  ): Promise<{
    period: string;
    cohorts: { cohortDate: string; users: number; day1: number; day7: number; day30: number }[];
  }> {
    const { start, end } = this.periodRange(period);
    let cohorts: { cohortDate: string; users: number; day1: number; day7: number; day30: number }[] = [];
    try {
      const rows: any[] = await this.dataSource.query(
        `SELECT DATE_FORMAT(created_at, "%Y-%u") AS cohort, COUNT(*) AS users
         FROM users WHERE created_at BETWEEN ? AND ?
         GROUP BY cohort ORDER BY cohort ASC`,
        [start, end],
      );
      cohorts = rows.map((r) => ({
        cohortDate: String(r.cohort),
        users: Number(r.users) || 0,
        day1: 0,
        day7: 0,
        day30: 0,
      }));
    } catch (e: any) {
      this.logger.warn?.(`留存查询跳过: ${(e as Error).message}`);
    }
    return { period, cohorts };
  }

  /** 实时数据（在线用户/实时调用，从 Redis 读取） */
  async getRealtime(): Promise<{ onlineUsers: number; callsLastMinute: number }> {
    let onlineUsers = 0;
    try {
      const v = await this.redis.get("stats:online_users");
      onlineUsers = v ? Number(v) : 0;
    } catch {
      onlineUsers = 0;
    }
    let callsLastMinute = 0;
    try {
      const c = await this.redis.get("stats:calls_last_minute");
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
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private periodRange(period: string): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    switch (period) {
      case "7d":
        start.setDate(start.getDate() - 7);
        break;
      case "30d":
        start.setDate(start.getDate() - 30);
        break;
      case "90d":
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 7);
    }
    return {
      start: this.formatDate(start) + " 00:00:00",
      end: this.formatDate(end) + " 23:59:59",
    };
  }
}