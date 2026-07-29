import { StatisticsService } from '../services/statistics.service';
import { DashboardStatsService } from '../services/dashboard-stats.service';
export declare class StatisticsController {
    private readonly service;
    constructor(service: StatisticsService);
    health(): {
        status: string;
        module: string;
    };
}
export declare class AdminStatisticsController {
    private readonly dashboard;
    constructor(dashboard: DashboardStatsService);
    overview(date?: string): Promise<Record<string, unknown>>;
    trends(metric?: string, granularity?: string, startDate?: string, endDate?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    rankings(type?: string, period?: string): Promise<{
        id: number;
        name: string;
        count: number;
    }[]>;
    retention(period?: string): Promise<Record<string, unknown>[]>;
    realtime(): Promise<{
        onlineUsers: number;
        callsLastMinute: number;
    }>;
    today(): Promise<Record<string, unknown>>;
    private fmt;
}
