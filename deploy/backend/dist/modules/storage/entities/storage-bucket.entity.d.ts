import { BaseEntity } from '../../../common/entities/base.entity';
export type StorageBucketType = 'local' | 's3' | 'oss' | 'minio';
export type StorageBucketStatus = 'active' | 'error';
export declare class StorageBucketEntity extends BaseEntity {
    userId: number;
    name: string;
    type: StorageBucketType;
    config: Record<string, any> | null;
    quotaBytes: number;
    usedBytes: number;
    status: StorageBucketStatus;
}
