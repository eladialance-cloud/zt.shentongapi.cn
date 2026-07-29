import { DataSource } from 'typeorm';
import { RedisService } from '../../../common/services/redis.service';
import { LogCollectionService } from './log-collection.service';
export declare class DashboardStatsService {
    private dataSource;
    private redis;
    private logCollection;
    private readonly logger;
    constructor(dataSource: DataSource, redis: RedisService, logCollection: LogCollectionService);
    getOverview(date: Date | string): Promise<Record<string, unknown>>;
    getTrends(metric: string, granularity: string, startDate: string, endDate: string): Promise<{
        date: string;
        value: number;
    }[]>;
    getRankings(type: string, period: string): Promise<{
        id: number;
        name: string;
        count: number;
    }[]>;
    getRetention(period: string): Promise<Record<string, unknown>[]>;
    getRealtime(): Promise<{
        onlineUsers: number;
        callsLastMinute: number;
    }>;
    getToday(): Promise<Record<string, unknown>>;
    private formatDate;
    private periodRange;
}
