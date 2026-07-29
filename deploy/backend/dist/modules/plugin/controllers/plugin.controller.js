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
exports.PluginController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const plugin_service_1 = require("../services/plugin.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let PluginController = class PluginController {
    pluginService;
    constructor(pluginService) {
        this.pluginService = pluginService;
    }
    health() {
        return this.pluginService.health();
    }
    list(page, pageSize, type) {
        return this.pluginService.list(Number(page) || 1, Number(pageSize) || 20, type);
    }
    async install(id, user) {
        const plugin = await this.pluginService.detail(Number(id));
        return { success: true, message: `插件「${plugin.name}」安装成功` };
    }
    async uninstall(id, user) {
        return { success: true, message: '插件已卸载' };
    }
    async enable(id, user) {
        return { success: true, message: '插件已启用' };
    }
    async disable(id, user) {
        return { success: true, message: '插件已禁用' };
    }
    async logs(user, page, pageSize) {
        return { list: [], total: 0, page: Number(page) || 1, pageSize: Number(pageSize) || 20, totalPages: 0 };
    }
    detail(id) {
        return this.pluginService.detail(Number(id));
    }
};
exports.PluginController = PluginController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "health", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '插件市场列表' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/install'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '安装插件' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PluginController.prototype, "install", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '卸载插件' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PluginController.prototype, "uninstall", null);
__decorate([
    (0, common_1.Post)(':id/enable'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '启用插件' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PluginController.prototype, "enable", null);
__decorate([
    (0, common_1.Post)(':id/disable'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '禁用插件' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PluginController.prototype, "disable", null);
__decorate([
    (0, common_1.Get)('me/logs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '插件调用记录' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PluginController.prototype, "logs", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '插件详情' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "detail", null);
exports.PluginController = PluginController = __decorate([
    (0, swagger_1.ApiTags)('插件'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('plugins'),
    __metadata("design:paramtypes", [plugin_service_1.PluginService])
], PluginController);
//# sourceMappingURL=plugin.controller.js.map