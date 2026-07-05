import { BaseEntity } from '../../../common/entities/base.entity';
export declare class DailyStatsEntity extends BaseEntity {
    date: string;
    dau: number;
    newUsers: number;
    totalUsers: number;
    totalCalls: number;
    totalRevenue: number;
    totalConsumed: number;
    avgOrderValue: number;
    onlineUsers: number;
}
