import { Response } from 'express';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { StorageService } from '../services/storage.service';
export declare class StorageController {
    private readonly service;
    constructor(service: StorageService);
    health(): {
        status: string;
        module: string;
    };
    getPresignedUploadUrl(user: ICurrentUser, body: {
        filename: string;
        mimeType: string;
        size: number;
        bucketId?: number;
    }): Promise<{
        uploadUrl: string;
        fileKey: string;
        expiresIn: number;
        method: string;
        headers: {
            'Content-Type': string;
        };
    }>;
    getPresignedDownloadUrl(user: ICurrentUser, body: {
        fileKey: string;
    }): Promise<{
        downloadUrl: string;
        fileKey: string;
        filename: string;
        expiresIn: number;
        method: string;
    }>;
    uploadFile(file: Express.Multer.File, body: {
        filename?: string;
        mimeType?: string;
        size?: number;
        bucketId?: number;
    }, token?: string, user?: ICurrentUser): Promise<any>;
    downloadFile(token: string, fileKey: string, res: Response, user?: ICurrentUser): Promise<void>;
    deleteFile(user: ICurrentUser, fileKey: string): Promise<{
        fileKey: string;
        deleted: boolean;
    }>;
    getStorageInfo(user: ICurrentUser): Promise<{
        buckets: {
            bucketId: number;
            name: string;
            type: import("../entities/storage-bucket.entity").StorageBucketType;
            quotaBytes: number;
            usedBytes: number;
            availableBytes: number;
            objectCount: number;
            status: import("../entities/storage-bucket.entity").StorageBucketStatus;
            usageRate: number;
        }[];
        summary: {
            totalQuotaBytes: number;
            totalUsedBytes: number;
            totalAvailableBytes: number;
            totalObjects: number;
            usageRate: number;
        };
    }>;
    createBucket(user: ICurrentUser, body: {
        name: string;
        type: 'local' | 's3' | 'oss' | 'minio';
        config?: Record<string, any>;
        quotaBytes?: number;
    }): Promise<{
        bucketId: number;
        name: string;
        type: import("../entities/storage-bucket.entity").StorageBucketType;
        quotaBytes: number;
        status: import("../entities/storage-bucket.entity").StorageBucketStatus;
    }>;
    listBuckets(user: ICurrentUser): Promise<{
        list: {
            bucketId: number;
            name: string;
            type: import("../entities/storage-bucket.entity").StorageBucketType;
            quotaBytes: number;
            usedBytes: number;
            status: import("../entities/storage-bucket.entity").StorageBucketStatus;
            createdAt: Date;
        }[];
        total: number;
    }>;
    listObjects(user: ICurrentUser, bucketId?: number, page?: number, pageSize?: number): Promise<{
        list: {
            id: number;
            fileKey: string;
            filename: string;
            mimeType: string | undefined;
            size: number;
            url: string | undefined;
            bucketId: number;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
}
