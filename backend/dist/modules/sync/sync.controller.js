"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sync_service_1 = require("./services/sync.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
class BatchUploadDto {
    items;
}
let SyncController = class SyncController {
    syncService;
    constructor(syncService) {
        this.syncService = syncService;
    }
    health() {
        return this.syncService.health();
    }
    async batch(dto, user) {
        return this.syncService.batchUpload(user.userId, dto.items || []);
    }
    async pull(user, since, types) {
        const sinceDate = since ? new Date(since) : new Date(0);
        const typeList = types ? types.split(',').filter(Boolean) : undefined;
        return this.syncService.pull(user.userId, sinceDate, typeList);
    }
    async status(user) {
        return this.syncService.getSyncStatus(user.userId);
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SyncController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('batch'),
    (0, swagger_1.ApiOperation)({ summary: '批量上行同步数据' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [BatchUploadDto, Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "batch", null);
__decorate([
    (0, common_1.Get)('pull'),
    (0, swagger_1.ApiOperation)({ summary: '增量下行同步数据' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('since')),
    __param(2, (0, common_1.Query)('types')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "pull", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: '查询同步状态' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "status", null);
exports.SyncController = SyncController = __decorate([
    (0, swagger_1.ApiTags)('同步'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('sync'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [sync_service_1.SyncService])
], SyncController);
//# sourceMappingURL=sync.controller.js.map