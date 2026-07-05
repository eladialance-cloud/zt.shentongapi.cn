import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 日报预聚合实体
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@Entity('daily_stats')
export class DailyStatsEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'dau', type: 'int', default: 0 })
  dau: number;

  @Column({ name: 'new_users', type: 'int', default: 0 })
  newUsers: number;

  @Column({ name: 'total_users', type: 'int', default: 0 })
  totalUsers: number;

  @Column({ name: 'total_calls', type: 'int', default: 0 })
  totalCalls: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 12, scale: 4, default: 0 })
  totalRevenue: number;

  @Column({ name: 'total_consumed', type: 'decimal', precision: 12, scale: 4, default: 0 })
  totalConsumed: number;

  @Column({ name: 'avg_order_value', type: 'decimal', precision: 10, scale: 2, default: 0 })
  avgOrderValue: number;

  @Column({ name: 'online_users', type: 'int', default: 0 })
  onlineUsers: number;
}
