"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const redis_service_1 = require("../../../common/services/redis.service");
const encryption_service_1 = require("../../../common/services/encryption.service");
const storage_bucket_entity_1 = require("../entities/storage-bucket.entity");
const storage_object_entity_1 = require("../entities/storage-object.entity");
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const PRESIGNED_TOKEN_TTL = 300;
let StorageService = StorageService_1 = class StorageService {
    bucketRepo;
    objectRepo;
    redisService;
    encryptionService;
    configService;
    jwtService;
    logger = new common_1.Logger(StorageService_1.name);
    uploadDir;
    constructor(bucketRepo, objectRepo, redisService, encryptionService, configService, jwtService) {
        this.bucketRepo = bucketRepo;
        this.objectRepo = objectRepo;
        this.redisService = redisService;
        this.encryptionService = encryptionService;
        this.configService = configService;
        this.jwtService = jwtService;
        this.uploadDir = path.resolve(process.cwd(), 'uploads');
    }
    health() {
        return { status: 'ok', module: 'storage' };
    }
    async getPresignedUploadUrl(userId, data) {
        if (data.size > MAX_FILE_SIZE) {
            throw new common_1.HttpException(`文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`, common_1.HttpStatus.BAD_REQUEST);
        }
        const bucket = await this.getOrCreateDefaultBucket(userId, data.bucketId);
        if (bucket.type !== 'local') {
            throw new common_1.HttpException(`存储类型 ${bucket.type} 的预签名 URL 暂未实现，目前仅支持 local 类型`, common_1.HttpStatus.NOT_IMPLEMENTED);
        }
        if (bucket.usedBytes + data.size > bucket.quotaBytes) {
            throw new common_1.HttpException('存储空间不足，超出配额限制', common_1.HttpStatus.BAD_REQUEST);
        }
        const fileKey = this.generateFileKey(data.filename);
        const storageObject = this.objectRepo.create({
            bucketId: bucket.id,
            userId,
            fileKey,
            filename: data.filename,
            mimeType: data.mimeType,
            size: data.size,
            storagePath: '',
            url: undefined,
            metadata: { status: 'pending' },
        });
        await this.objectRepo.save(storageObject);
        const payload = {
            userId,
            fileKey,
            filename: data.filename,
            mimeType: data.mimeType,
            size: data.size,
            bucketId: bucket.id,
            action: 'upload',
        };
        const token = this.jwtService.sign(payload, {
            expiresIn: `${PRESIGNED_TOKEN_TTL}s`,
        });
        const redisKey = `storage:presigned:upload:${fileKey}`;
        await this.redisService.set(redisKey, token, PRESIGNED_TOKEN_TTL);
        const baseUrl = this.configService.get('APP_BASE_URL', 'http://localhost:3001');
        return {
            uploadUrl: `${baseUrl}/api/storage/upload?token=${token}`,
            fileKey,
            expiresIn: PRESIGNED_TOKEN_TTL,
            method: 'POST',
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        };
    }
    async getPresignedDownloadUrl(userId, data) {
        const obj = await this.findUserObject(userId, data.fileKey);
        const payload = {
            userId,
            fileKey: obj.fileKey,
            filename: obj.filename,
            mimeType: obj.mimeType || 'application/octet-stream',
            size: obj.size,
            bucketId: obj.bucketId,
            action: 'download',
        };
        const token = this.jwtService.sign(payload, {
            expiresIn: `${PRESIGNED_TOKEN_TTL}s`,
        });
        const redisKey = `storage:presigned:download:${obj.fileKey}`;
        await this.redisService.set(redisKey, token, PRESIGNED_TOKEN_TTL);
        const baseUrl = this.configService.get('APP_BASE_URL', 'http://localhost:3001');
        return {
            downloadUrl: `${baseUrl}/api/storage/download?token=${token}`,
            fileKey: obj.fileKey,
            filename: obj.filename,
            expiresIn: PRESIGNED_TOKEN_TTL,
            method: 'GET',
        };
    }
    async verifyPresignedToken(token, action) {
        try {
            const payload = this.jwtService.verify(token);
            if (payload.action !== action) {
                throw new common_1.HttpException('Token 操作类型不匹配', common_1.HttpStatus.BAD_REQUEST);
            }
            const redisKey = `storage:presigned:${action}:${payload.fileKey}`;
            const storedToken = await this.redisService.get(redisKey);
            if (!storedToken || storedToken !== token) {
                throw new common_1.HttpException('预签名 token 已失效或已被使用', common_1.HttpStatus.UNAUTHORIZED);
            }
            await this.redisService.del(redisKey);
            return payload;
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            throw new common_1.HttpException('无效的预签名 token', common_1.HttpStatus.UNAUTHORIZED);
        }
    }
    async uploadFile(userId, data) {
        if (data.size > MAX_FILE_SIZE) {
            throw new common_1.HttpException(`文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`, common_1.HttpStatus.BAD_REQUEST);
        }
        const bucket = await this.getOrCreateDefaultBucket(userId, data.bucketId);
        if (bucket.usedBytes + data.size > bucket.quotaBytes) {
            throw new common_1.HttpException('存储空间不足，超出配额限制', common_1.HttpStatus.BAD_REQUEST);
        }
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const ext = this.getFileExtension(data.filename);
        const fileName = `${(0, uuid_1.v4)()}${ext ? '.' + ext : ''}`;
        const relativePath = path.join(String(userId), yearMonth, fileName);
        const absolutePath = path.join(this.uploadDir, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, data.fileBuffer);
        const fileKey = this.generateFileKey(data.filename);
        const storageObject = this.objectRepo.create({
            bucketId: bucket.id,
            userId,
            fileKey,
            filename: data.filename,
            mimeType: data.mimeType,
            size: data.size,
            storagePath: relativePath,
            url: `/uploads/${relativePath.replace(/\\/g, '/')}`,
            metadata: {
                originalName: data.filename,
                uploadTime: now.toISOString(),
            },
        });
        await this.objectRepo.save(storageObject);
        bucket.usedBytes += data.size;
        await this.bucketRepo.save(bucket);
        this.logger.log(`文件上传成功: userId=${userId}, fileKey=${fileKey}, size=${data.size}`);
        return {
            fileKey,
            filename: data.filename,
            size: data.size,
            mimeType: data.mimeType,
            url: storageObject.url,
        };
    }
    async uploadFileByToken(token, file) {
        const payload = await this.verifyPresignedToken(token, 'upload');
        if (file.size !== payload.size) {
            throw new common_1.HttpException(`文件大小不匹配，预期 ${payload.size} 字节，实际 ${file.size} 字节`, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.uploadFile(payload.userId, {
            filename: payload.filename,
            mimeType: payload.mimeType,
            size: payload.size,
            fileBuffer: file.buffer,
            bucketId: payload.bucketId,
        });
    }
    async downloadFile(userId, fileKey) {
        const obj = await this.findUserObject(userId, fileKey);
        const absolutePath = path.join(this.uploadDir, obj.storagePath);
        try {
            await fs.access(absolutePath);
        }
        catch {
            throw new common_1.HttpException('物理文件不存在，可能已被清理', common_1.HttpStatus.NOT_FOUND);
        }
        return {
            absolutePath,
            filename: obj.filename,
            mimeType: obj.mimeType || 'application/octet-stream',
            size: obj.size,
        };
    }
    async downloadFileByToken(token) {
        const payload = await this.verifyPresignedToken(token, 'download');
        return this.downloadFile(payload.userId, payload.fileKey);
    }
    async deleteFile(userId, fileKey) {
        const obj = await this.findUserObject(userId, fileKey);
        const absolutePath = path.join(this.uploadDir, obj.storagePath);
        try {
            await fs.unlink(absolutePath);
            this.logger.log(`物理文件已删除: ${absolutePath}`);
        }
        catch (error) {
            this.logger.warn(`物理文件删除失败（可能已不存在）: ${absolutePath} - ${error.message}`);
        }
        obj.deletedAt = new Date();
        await this.objectRepo.save(obj);
        const bucket = await this.bucketRepo.findOne({
            where: { id: obj.bucketId },
        });
        if (bucket) {
            bucket.usedBytes = Math.max(0, bucket.usedBytes - obj.size);
            await this.bucketRepo.save(bucket);
        }
        this.logger.log(`文件删除成功: userId=${userId}, fileKey=${fileKey}`);
        return { fileKey, deleted: true };
    }
    async getStorageInfo(userId) {
        const buckets = await this.bucketRepo.find({
            where: { userId },
            order: { createdAt: 'ASC' },
        });
        const result = await Promise.all(buckets.map(async (bucket) => {
            const objectCount = await this.objectRepo.count({
                where: {
                    bucketId: bucket.id,
                    userId,
                    deletedAt: (0, typeorm_2.IsNull)(),
                },
            });
            return {
                bucketId: bucket.id,
                name: bucket.name,
                type: bucket.type,
                quotaBytes: bucket.quotaBytes,
                usedBytes: bucket.usedBytes,
                availableBytes: Math.max(0, bucket.quotaBytes - bucket.usedBytes),
                objectCount,
                status: bucket.status,
                usageRate: bucket.quotaBytes > 0
                    ? Number(((bucket.usedBytes / bucket.quotaBytes) * 100).toFixed(2))
                    : 0,
            };
        }));
        const totalQuota = result.reduce((sum, b) => sum + b.quotaBytes, 0);
        const totalUsed = result.reduce((sum, b) => sum + b.usedBytes, 0);
        const totalObjects = result.reduce((sum, b) => sum + b.objectCount, 0);
        return {
            buckets: result,
            summary: {
                totalQuotaBytes: totalQuota,
                totalUsedBytes: totalUsed,
                totalAvailableBytes: Math.max(0, totalQuota - totalUsed),
                totalObjects,
                usageRate: totalQuota > 0
                    ? Number(((totalUsed / totalQuota) * 100).toFixed(2))
                    : 0,
            },
        };
    }
    async createBucket(userId, data) {
        const existing = await this.bucketRepo.findOne({
            where: { userId, name: data.name },
        });
        if (existing) {
            throw new common_1.HttpException(`存储桶 "${data.name}" 已存在`, common_1.HttpStatus.CONFLICT);
        }
        let encryptedConfig = null;
        if (data.config) {
            encryptedConfig = this.encryptBucketConfig(data.config);
        }
        const bucket = this.bucketRepo.create({
            userId,
            name: data.name,
            type: data.type,
            config: encryptedConfig,
            quotaBytes: data.quotaBytes || 5368709120,
            usedBytes: 0,
            status: 'active',
        });
        await this.bucketRepo.save(bucket);
        this.logger.log(`存储桶创建成功: userId=${userId}, name=${data.name}, type=${data.type}`);
        return {
            bucketId: bucket.id,
            name: bucket.name,
            type: bucket.type,
            quotaBytes: bucket.quotaBytes,
            status: bucket.status,
        };
    }
    async listBuckets(userId) {
        const buckets = await this.bucketRepo.find({
            where: { userId },
            order: { createdAt: 'ASC' },
        });
        return {
            list: buckets.map((b) => ({
                bucketId: b.id,
                name: b.name,
                type: b.type,
                quotaBytes: b.quotaBytes,
                usedBytes: b.usedBytes,
                status: b.status,
                createdAt: b.createdAt,
            })),
            total: buckets.length,
        };
    }
    async listObjects(userId, bucketId, page = 1, pageSize = 20) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const where = { userId, deletedAt: (0, typeorm_2.IsNull)() };
        if (bucketId) {
            where.bucketId = bucketId;
        }
        const [list, total] = await this.objectRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return {
            list: list.map((o) => ({
                id: o.id,
                fileKey: o.fileKey,
                filename: o.filename,
                mimeType: o.mimeType,
                size: o.size,
                url: o.url,
                bucketId: o.bucketId,
                createdAt: o.createdAt,
            })),
            total,
            page: p,
            pageSize: ps,
            totalPages: Math.ceil(total / ps) || 0,
        };
    }
    generateFileKey(filename) {
        const ext = this.getFileExtension(filename);
        const timestamp = Date.now();
        const random = (0, uuid_1.v4)().replace(/-/g, '').slice(0, 12);
        return ext
            ? `${timestamp}-${random}.${ext}`
            : `${timestamp}-${random}`;
    }
    getFileExtension(filename) {
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex === filename.length - 1) {
            return '';
        }
        return filename.slice(dotIndex + 1).toLowerCase();
    }
    async findUserObject(userId, fileKey) {
        const obj = await this.objectRepo.findOne({
            where: { userId, fileKey, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!obj) {
            throw new common_1.HttpException(`文件 ${fileKey} 不存在或无权访问`, common_1.HttpStatus.NOT_FOUND);
        }
        return obj;
    }
    async getOrCreateDefaultBucket(userId, bucketId) {
        if (bucketId) {
            const bucket = await this.bucketRepo.findOne({
                where: { id: bucketId, userId },
            });
            if (!bucket) {
                throw new common_1.HttpException(`存储桶 ${bucketId} 不存在`, common_1.HttpStatus.NOT_FOUND);
            }
            if (bucket.status !== 'active') {
                throw new common_1.HttpException(`存储桶 ${bucket.name} 当前状态不可用`, common_1.HttpStatus.BAD_REQUEST);
            }
            return bucket;
        }
        let bucket = await this.bucketRepo.findOne({
            where: { userId, type: 'local', status: 'active' },
        });
        if (!bucket) {
            bucket = this.bucketRepo.create({
                userId,
                name: 'default',
                type: 'local',
                config: null,
                quotaBytes: 5368709120,
                usedBytes: 0,
                status: 'active',
            });
            bucket = await this.bucketRepo.save(bucket);
            this.logger.log(`自动创建默认存储桶: userId=${userId}`);
        }
        return bucket;
    }
    encryptBucketConfig(config) {
        const sensitiveKeys = ['accessKey', 'secretKey', 'password', 'token'];
        const encrypted = {};
        for (const [key, value] of Object.entries(config)) {
            if (sensitiveKeys.includes(key) && typeof value === 'string') {
                encrypted[key] = this.encryptionService.encryptAes(value);
                encrypted[`_${key}_encrypted`] = true;
            }
            else {
                encrypted[key] = value;
            }
        }
        return encrypted;
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(storage_bucket_entity_1.StorageBucketEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(storage_object_entity_1.StorageObjectEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        encryption_service_1.EncryptionService,
        config_1.ConfigService,
        jwt_1.JwtService])
], StorageService);
//# sourceMappingURL=storage.service.js.map