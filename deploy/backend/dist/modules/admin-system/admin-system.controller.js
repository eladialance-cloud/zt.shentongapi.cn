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
exports.AdminSystemController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_system_service_1 = require("./admin-system.service");
const update_system_config_dto_1 = require("./dto/update-system-config.dto");
const clear_cache_dto_1 = require("./dto/clear-cache.dto");
let AdminSystemController = class AdminSystemController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getConfig(section) {
        return this.service.getSystemConfig(section);
    }
    async updateConfig(dto) {
        await this.service.updateSystemConfig(dto);
        return null;
    }
    async clearCache(dto) {
        await this.service.clearCache(dto);
        return null;
    }
};
exports.AdminSystemController = AdminSystemController;
__decorate([
    (0, common_1.Get)('config'),
    (0, swagger_1.ApiOperation)({ summary: '获取系统配置（按 section）' }),
    __param(0, (0, common_1.Query)('section')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminSystemController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, swagger_1.ApiOperation)({ summary: '更新系统配置' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_system_config_dto_1.UpdateSystemConfigDto]),
    __metadata("design:returntype", Promise)
], AdminSystemController.prototype, "updateConfig", null);
__decorate([
    (0, common_1.Post)('cache/clear'),
    (0, swagger_1.ApiOperation)({ summary: '清空缓存' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [clear_cache_dto_1.ClearCacheDto]),
    __metadata("design:returntype", Promise)
], AdminSystemController.prototype, "clearCache", null);
exports.AdminSystemController = AdminSystemController = __decorate([
    (0, swagger_1.ApiTags)('管理端-系统配置'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/system'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_system_service_1.AdminSystemService])
], AdminSystemController);
//# sourceMappingURL=admin-system.controller.js.map