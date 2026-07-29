import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class LogCollectionService implements OnModuleInit {
    private dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    onModuleInit(): void;
    aggregateDailyStats(date: Date | string): Promise<void>;
    aggregateYesterday(): Promise<void>;
    health(): {
        status: string;
        module: string;
    };
    private formatDate;
    private scheduleDaily;
}
