import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 日志聚合服务
 * 数据合同真源：Task 33 - 统计报表数据源
 * - aggregateDailyStats(date)：聚合指定日期数据写入 daily_stats
 * - aggregateYesterday()：每日凌晨 01:00 跑昨日聚合（替代 @Cron）
 */
@Injectable()
export class LogCollectionService implements OnModuleInit {
  private readonly logger = new Logger(LogCollectionService.name);

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  onModuleInit() {
    // 调度每日 01:00 聚合昨日数据（替代 @Cron('0 0 1 * * *')）
    this.scheduleDaily(1, 0, () => {
      this.aggregateYesterday().catch((err) =>
        this.logger.error(`昨日聚合失败: ${err?.message || err}`),
      );
    });
  }

  /** 聚合指定日期数据并 upsert 到 daily_stats */
  async aggregateDailyStats(date: Date | string): Promise<void> {
    const dateStr = typeof date === 'string' ? date : this.formatDate(date);
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;

    // 新增用户
    const newUsersRow: any = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE created_at BETWEEN ? AND ?`,
      [start, end],
    );
    const newUsers = Number(newUsersRow[0]?.cnt || 0);

    // 累计用户（截至当日结束）
    const totalUsersRow: any = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE created_at <= ?`,
      [end],
    );
    const totalUsers = Number(totalUsersRow[0]?.cnt || 0);

    // DAU：当日有积分流水变动的去重用户
    let dau = 0;
    try {
      const dauRow: any = await this.dataSource.query(
        `SELECT COUNT(DISTINCT user_id) AS cnt FROM credit_transactions WHERE created_at BETWEEN ? AND ?`,
        [start, end],
      );
      dau = Number(dauRow[0]?.cnt || 0);
    } catch (e) {
      this.logger.warn?.(`DAU 聚合跳过: ${(e as Error).message}`);
    }

    // 总调用数：agent_call_logs 当日
    let totalCalls = 0;
    try {
      const callsRow: any = await this.dataSource.query(
        `SELECT COUNT(*) AS cnt FROM agent_call_logs WHERE created_at BETWEEN ? AND ?`,
        [start, end],
      );
      totalCalls = Number(callsRow[0]?.cnt || 0);
    } catch (e) {
      this.logger.warn?.(`调用数聚合跳过: ${(e as Error).message}`);
    }

    // 总收入：payment_records status=paid 当日
    let totalRevenue = 0;
    let paidOrders = 0;
    try {
      const revRow: any = await this.dataSource.query(
        `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM payment_records WHERE status = 'paid' AND paid_at BETWEEN ? AND ?`,
        [start, end],
      );
      totalRevenue = Number(revRow[0]?.total || 0);
      paidOrders = Number(revRow[0]?.cnt || 0);
    } catch (e) {
      this.logger.warn?.(`收入聚合跳过: ${(e as Error).message}`);
    }

    // 总消耗：credit_transactions type=settle 当日
    let totalConsumed = 0;
    try {
      const consumedRow: any = await this.dataSource.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM credit_transactions WHERE type = 'settle' AND created_at BETWEEN ? AND ?`,
        [start, end],
      );
      totalConsumed = Number(consumedRow[0]?.total || 0);
    } catch (e) {
      this.logger.warn?.(`消耗聚合跳过: ${(e as Error).message}`);
    }

    const avgOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;

    // upsert（MySQL INSERT ... ON DUPLICATE KEY UPDATE）
    await this.dataSource.query(
      `INSERT INTO daily_stats
        (date, dau, new_users, total_users, total_calls, total_revenue, total_consumed, avg_order_value, online_users, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        dau = VALUES(dau), new_users = VALUES(new_users), total_users = VALUES(total_users),
        total_calls = VALUES(total_calls), total_revenue = VALUES(total_revenue),
        total_consumed = VALUES(total_consumed), avg_order_value = VALUES(avg_order_value),
        updated_at = NOW()`,
      [dateStr, dau, newUsers, totalUsers, totalCalls, totalRevenue, totalConsumed, avgOrderValue],
    );
  }

  /** 聚合昨日 */
  async aggregateYesterday(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await this.aggregateDailyStats(yesterday);
    this.logger.log('昨日日报聚合完成');
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'log-collection' };
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private scheduleDaily(hour: number, minute: number, fn: () => void): void {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      fn();
      setInterval(fn, 24 * 60 * 60 * 1000);
    }, delay);
  }
}
