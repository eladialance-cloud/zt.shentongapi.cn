import { BaseEntity } from '../../../common/entities/base.entity';
export interface ImportTaskStats {
    total: number;
    inserted: number;
    skipped: number;
    failed: number;
    durationMs: number;
    errors?: Array<{
        filePath: string;
        error: string;
    }>;
}
export declare class AgentImportTaskEntity extends BaseEntity {
    taskId: string;
    repoUrl: string;
    branch?: string;
    commitSha?: string;
    status: 'pending' | 'processing' | 'success' | 'failed';
    progress: number;
    stats?: ImportTaskStats;
    error?: string;
}
