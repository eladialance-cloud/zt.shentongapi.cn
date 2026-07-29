import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { StorageBucketEntity, StorageBucketType } from '../entities/storage-bucket.entity';
import { StorageObjectEntity } from '../entities/storage-object.entity';
interface PresignedUploadData {
    filename: string;
    mimeType: string;
    size: number;
    bucketId?: number;
}
interface PresignedDownloadData {
    fileKey: string;
}
interface UploadFileData {
    filename: string;
    mimeType: string;
    size: number;
    fileBuffer: Buffer;
    bucketId?: number;
}
interface CreateBucketData {
    name: string;
    type: StorageBucketType;
    config?: Record<string, any>;
    quotaBytes?: number;
}
interface PresignedTokenPayload {
    userId: number;
    fileKey: string;
    filename: string;
    mimeType: string;
    size: number;
    bucketId?: number;
    action: 'upload' | 'download';
}
export declare class StorageService {
    private readonly bucketRepo;
    private readonly objectRepo;
    private readonly redisService;
    private readonly encryptionService;
    private readonly configService;
    private readonly jwtService;
    private readonly logger;
    private readonly uploadDir;
    constructor(bucketRepo: Repository<StorageBucketEntity>, objectRepo: Repository<StorageObjectEntity>, redisService: RedisService, encryptionService: EncryptionService, configService: ConfigService, jwtService: JwtService);
    health(): {
        status: string;
        module: string;
    };
    getPresignedUploadUrl(userId: number, data: PresignedUploadData): Promise<{
        uploadUrl: string;
        fileKey: string;
        expiresIn: number;
        method: string;
        headers: {
            'Content-Type': string;
        };
    }>;
    getPresignedDownloadUrl(userId: number, data: PresignedDownloadData): Promise<{
        downloadUrl: string;
        fileKey: string;
        filename: string;
        expiresIn: number;
        method: string;
    }>;
    verifyPresignedToken(token: string, action: 'upload' | 'download'): Promise<PresignedTokenPayload>;
    uploadFile(userId: number, data: UploadFileData): Promise<{
        fileKey: string;
        filename: string;
        size: number;
        mimeType: string;
        url: string | undefined;
    }>;
    uploadFileByToken(token: string, file: Express.Multer.File): Promise<any>;
    downloadFile(userId: number, fileKey: string): Promise<{
        absolutePath: string;
        filename: string;
        mimeType: string;
        size: number;
    }>;
    downloadFileByToken(token: string): Promise<{
        absolutePath: string;
        filename: string;
        mimeType: string;
        size: number;
    }>;
    deleteFile(userId: number, fileKey: string): Promise<{
        fileKey: string;
        deleted: boolean;
    }>;
    getStorageInfo(userId: number): Promise<{
        buckets: {
            bucketId: number;
            name: string;
            type: StorageBucketType;
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
    createBucket(userId: number, data: CreateBucketData): Promise<{
        bucketId: number;
        name: string;
        type: StorageBucketType;
        quotaBytes: number;
        status: import("../entities/storage-bucket.entity").StorageBucketStatus;
    }>;
    listBuckets(userId: number): Promise<{
        list: {
            bucketId: number;
            name: string;
            type: StorageBucketType;
            quotaBytes: number;
            usedBytes: number;
            status: import("../entities/storage-bucket.entity").StorageBucketStatus;
            createdAt: Date;
        }[];
        total: number;
    }>;
    listObjects(userId: number, bucketId?: number, page?: number, pageSize?: number): Promise<{
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
    private generateFileKey;
    private getFileExtension;
    private findUserObject;
    private getOrCreateDefaultBucket;
    private encryptBucketConfig;
}
export {};
