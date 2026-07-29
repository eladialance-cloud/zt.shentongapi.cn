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
exports.AdminPluginController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_plugin_service_1 = require("./admin-plugin.service");
const plugin_dto_1 = require("./dto/plugin.dto");
const review_dto_1 = require("./dto/review.dto");
let AdminPluginController = class AdminPluginController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.list(query);
    }
    async create(dto) {
        return this.service.create(dto);
    }
    async listReview(query) {
        return this.service.listReview(query);
    }
    async listSyncStatus(query) {
        return this.service.listSyncStatus(query);
    }
    async syncAll() {
        return this.service.syncAll();
    }
    async detail(id) {
        return this.service.detail(id);
    }
    async update(id, dto) {
        await this.service.update(id, dto);
        return null;
    }
    async remove(id) {
        await this.service.remove(id);
        return null;
    }
    async publish(id) {
        await this.service.publish(id);
        return null;
    }
    async unpublish(id) {
        await this.service.unpublish(id);
        return null;
    }
    async review(id, dto) {
        await this.service.review(id, dto.action, dto.reason);
        return null;
    }
    async approve(id) {
        await this.service.approve(id);
        return null;
    }
    async reject(id, dto) {
        await this.service.reject(id, dto.reason);
        return null;
    }
    async sync(id) {
        return this.service.sync(id);
    }
};
exports.AdminPluginController = AdminPluginController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '插件列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plugin_dto_1.AdminPluginQueryDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增插件' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plugin_dto_1.CreateAdminPluginDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('review'),
    (0, swagger_1.ApiOperation)({ summary: '审核队列' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plugin_dto_1.AdminPluginReviewQueryDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "listReview", null);
__decorate([
    (0, common_1.Get)('sync-status'),
    (0, swagger_1.ApiOperation)({ summary: 'MCP 同步状态列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plugin_dto_1.PluginSyncQueryDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "listSyncStatus", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, swagger_1.ApiOperation)({ summary: '触发批量同步' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "syncAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '插件详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "detail", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑插件' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, plugin_dto_1.UpdateAdminPluginDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除插件' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, swagger_1.ApiOperation)({ summary: '上架插件' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/unpublish'),
    (0, swagger_1.ApiOperation)({ summary: '下架插件' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "unpublish", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, swagger_1.ApiOperation)({ summary: '审核插件（approve|reject）' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, review_dto_1.PluginReviewDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "review", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, swagger_1.ApiOperation)({ summary: '通过审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '驳回审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, review_dto_1.PluginRejectDto]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/sync'),
    (0, swagger_1.ApiOperation)({ summary: '手动同步插件' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminPluginController.prototype, "sync", null);
exports.AdminPluginController = AdminPluginController = __decorate([
    (0, swagger_1.ApiTags)('管理端-插件'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/plugins'),
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_plugin_service_1.AdminPluginService])
], AdminPluginController);
//# sourceMappingURL=admin-plugin.controller.js.map