import { BaseEntity } from '../../../common/entities/base.entity';
export declare class StorageObjectEntity extends BaseEntity {
    bucketId: number;
    userId: number;
    fileKey: string;
    filename: string;
    mimeType?: string;
    size: number;
    storagePath: string;
    url?: string;
    metadata: Record<string, any> | null;
    deletedAt: Date | null;
}
