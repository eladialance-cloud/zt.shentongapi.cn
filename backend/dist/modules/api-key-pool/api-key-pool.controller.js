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
exports.ApiKeyPoolController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_key_pool_service_1 = require("./services/api-key-pool.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
class CreateKeyDto {
    provider;
    apiKey;
    alias;
    priority;
    modelConfigId;
    totalQuota;
    dailyQuota;
    monthlyQuota;
}
class UpdateKeyDto {
    provider;
    apiKey;
    alias;
    priority;
    status;
    modelConfigId;
    totalQuota;
}
class SetLimitsDto {
    dailyQuota;
    monthlyQuota;
}
let ApiKeyPoolController = class ApiKeyPoolController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    async list(provider) {
        return this.service.list(provider);
    }
    async stats() {
        return this.service.getStats();
    }
    async create(dto) {
        return this.service.create(dto);
    }
    async update(id, dto) {
        return this.service.update(id, dto);
    }
    async remove(id) {
        await this.service.delete(id);
        return null;
    }
    async resetErrors(id) {
        await this.service.resetErrors(id);
        return null;
    }
    async setLimits(id, dto) {
        return this.service.setLimits(id, dto.dailyQuota, dto.monthlyQuota);
    }
};
exports.ApiKeyPoolController = ApiKeyPoolController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ApiKeyPoolController.prototype, "health", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Key 列表' }),
    __param(0, (0, common_1.Query)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: '统计' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "stats", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增 Key' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateKeyDto]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑 Key' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, UpdateKeyDto]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除 Key' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/reset-errors'),
    (0, swagger_1.ApiOperation)({ summary: '重置错误计数' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "resetErrors", null);
__decorate([
    (0, common_1.Patch)(':id/limits'),
    (0, swagger_1.ApiOperation)({ summary: '设置限额' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, SetLimitsDto]),
    __metadata("design:returntype", Promise)
], ApiKeyPoolController.prototype, "setLimits", null);
exports.ApiKeyPoolController = ApiKeyPoolController = __decorate([
    (0, swagger_1.ApiTags)('API Key 池-管理端'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/api-key-pool'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    __metadata("design:paramtypes", [api_key_pool_service_1.ApiKeyPoolService])
], ApiKeyPoolController);
//# sourceMappingURL=api-key-pool.controller.js.map