import { SyncService, SyncUploadItem } from './services/sync.service';
import { ICurrentUser } from '../../common/decorators/current-user.decorator';
declare class BatchUploadDto {
    items: SyncUploadItem[];
}
export declare class SyncController {
    private readonly syncService;
    constructor(syncService: SyncService);
    health(): {
        status: string;
        module: string;
    };
    batch(dto: BatchUploadDto, user: ICurrentUser): Promise<{
        accepted: number;
        skipped: number;
    }>;
    pull(user: ICurrentUser, since?: string, types?: string): Promise<import("./services/sync.service").SyncPullResult>;
    status(user: ICurrentUser): Promise<{
        pendingCount: number;
        lastSyncAt: Date | null;
    }>;
}
export {};
