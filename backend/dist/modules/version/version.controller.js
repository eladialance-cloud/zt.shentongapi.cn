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
exports.VersionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const version_service_1 = require("./services/version.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
class CreateVersionDto {
    version;
    platform;
    downloadUrl;
    changelog;
    forceUpdate;
    grayscalePercent;
    publishedAt;
    isActive;
}
class UpdateVersionDto {
    version;
    platform;
    downloadUrl;
    changelog;
    forceUpdate;
    grayscalePercent;
    publishedAt;
    isActive;
}
let VersionController = class VersionController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    async check(platform, currentVersion) {
        return this.service.checkUpdate(platform, currentVersion);
    }
    async list(platform) {
        return this.service.list(platform);
    }
    async latest(platform) {
        return this.service.getLatest(platform);
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
    async stats(id) {
        return this.service.getStats(id);
    }
};
exports.VersionController = VersionController;
__decorate([
    (0, common_1.Get)('version/health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], VersionController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('version/check'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '客户端检查更新' }),
    __param(0, (0, common_1.Query)('platform')),
    __param(1, (0, common_1.Query)('currentVersion')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('admin/versions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '版本列表' }),
    __param(0, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('admin/versions/latest'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '最新版本' }),
    __param(0, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "latest", null);
__decorate([
    (0, common_1.Post)('admin/versions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '新增版本' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateVersionDto]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('admin/versions/:id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '编辑版本' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, UpdateVersionDto]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('admin/versions/:id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '删除版本' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('admin/versions/:id/stats'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: '版本统计' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "stats", null);
exports.VersionController = VersionController = __decorate([
    (0, swagger_1.ApiTags)('客户端版本'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [version_service_1.VersionService])
], VersionController);
//# sourceMappingURL=version.controller.js.map