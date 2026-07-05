import { Repository, DataSource } from 'typeorm';
import { SyncRecordEntity, SyncRecordType } from '../entities/sync-record.entity';
export interface SyncUploadItem {
    clientTxnId: string;
    type: SyncRecordType;
    payload: Record<string, unknown>;
}
export interface SyncPullResult {
    agents: any[];
    workflows: any[];
    plugins: any[];
    models: any[];
    credits: any;
    announcements: any[];
    userLevel: any;
    serverTime: string;
}
export declare class SyncService {
    private syncRepo;
    private dataSource;
    private readonly logger;
    constructor(syncRepo: Repository<SyncRecordEntity>, dataSource: DataSource);
    batchUpload(userId: number, items: SyncUploadItem[]): Promise<{
        accepted: number;
        skipped: number;
    }>;
    pull(userId: number, since: Date, types?: string[]): Promise<SyncPullResult>;
    getSyncStatus(userId: number): Promise<{
        pendingCount: number;
        lastSyncAt: Date | null;
    }>;
    health(): {
        status: string;
        module: string;
    };
}
