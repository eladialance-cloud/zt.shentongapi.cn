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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const fs = __importStar(require("fs"));
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const storage_service_1 = require("../services/storage.service");
let StorageController = class StorageController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    getPresignedUploadUrl(user, body) {
        return this.service.getPresignedUploadUrl(user.userId, body);
    }
    getPresignedDownloadUrl(user, body) {
        return this.service.getPresignedDownloadUrl(user.userId, body);
    }
    async uploadFile(file, body, token, user) {
        if (!file) {
            throw new common_1.HttpException('文件未上传', common_1.HttpStatus.BAD_REQUEST);
        }
        if (token) {
            return this.service.uploadFileByToken(token, file);
        }
        if (!user) {
            throw new common_1.HttpException('请提供预签名 token 或登录后上传', common_1.HttpStatus.UNAUTHORIZED);
        }
        return this.service.uploadFile(user.userId, {
            filename: body.filename || file.originalname,
            mimeType: body.mimeType || file.mimetype,
            size: body.size || file.size,
            fileBuffer: file.buffer,
            bucketId: body.bucketId ? Number(body.bucketId) : undefined,
        });
    }
    async downloadFile(token, fileKey, res, user) {
        let result;
        if (token) {
            result = await this.service.downloadFileByToken(token);
        }
        else if (fileKey && user) {
            result = await this.service.downloadFile(user.userId, fileKey);
        }
        else {
            throw new common_1.HttpException('请提供预签名 token 或登录后使用 fileKey 下载', common_1.HttpStatus.UNAUTHORIZED);
        }
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
        res.setHeader('Content-Length', result.size);
        const stream = fs.createReadStream(result.absolutePath);
        stream.pipe(res);
    }
    deleteFile(user, fileKey) {
        return this.service.deleteFile(user.userId, fileKey);
    }
    getStorageInfo(user) {
        return this.service.getStorageInfo(user.userId);
    }
    createBucket(user, body) {
        return this.service.createBucket(user.userId, body);
    }
    listBuckets(user) {
        return this.service.listBuckets(user.userId);
    }
    listObjects(user, bucketId, page, pageSize) {
        return this.service.listObjects(user.userId, bucketId ? Number(bucketId) : undefined, page ? Number(page) : 1, pageSize ? Number(pageSize) : 20);
    }
};
exports.StorageController = StorageController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('upload-url'),
    (0, swagger_1.ApiOperation)({ summary: '获取上传预签名 URL' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "getPresignedUploadUrl", null);
__decorate([
    (0, common_1.Post)('download-url'),
    (0, swagger_1.ApiOperation)({ summary: '获取下载预签名 URL' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "getPresignedDownloadUrl", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, swagger_1.ApiOperation)({ summary: '上传文件（支持预签名 token 或登录用户直接上传）' }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Query)('token')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StorageController.prototype, "uploadFile", null);
__decorate([
    (0, common_1.Get)('download'),
    (0, swagger_1.ApiOperation)({ summary: '下载文件（支持预签名 token 或 fileKey）' }),
    __param(0, (0, common_1.Query)('token')),
    __param(1, (0, common_1.Query)('fileKey')),
    __param(2, (0, common_1.Res)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], StorageController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Delete)('files/:fileKey'),
    (0, swagger_1.ApiOperation)({ summary: '删除文件' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('fileKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "deleteFile", null);
__decorate([
    (0, common_1.Get)('info'),
    (0, swagger_1.ApiOperation)({ summary: '获取存储使用信息' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "getStorageInfo", null);
__decorate([
    (0, common_1.Post)('buckets'),
    (0, swagger_1.ApiOperation)({ summary: '创建存储桶' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "createBucket", null);
__decorate([
    (0, common_1.Get)('buckets'),
    (0, swagger_1.ApiOperation)({ summary: '获取存储桶列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "listBuckets", null);
__decorate([
    (0, common_1.Get)('objects'),
    (0, swagger_1.ApiOperation)({ summary: '获取文件列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('bucketId')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number, Number]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "listObjects", null);
exports.StorageController = StorageController = __decorate([
    (0, swagger_1.ApiTags)('存储'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('storage'),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], StorageController);
//# sourceMappingURL=storage.controller.js.map