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
exports.OpenClawController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const openclaw_service_1 = require("../services/openclaw.service");
const openclaw_dto_1 = require("../dto/openclaw.dto");
let OpenClawController = class OpenClawController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.healthCheck();
    }
    listInstances(user) {
        return this.service.listInstances(user.userId);
    }
    registerInstance(user, dto) {
        return this.service.registerInstance(user.userId, dto);
    }
    async deleteInstance(user, id) {
        await this.service.deleteInstance(user.userId, id);
        return null;
    }
    syncAgent(user, id) {
        return this.service.syncAgent(user.userId, id);
    }
    getStatus(user, id) {
        return this.service.getStatus(user.userId, id);
    }
    updateConfig(user, id, dto) {
        return this.service.updateConfig(user.userId, id, dto);
    }
};
exports.OpenClawController = OpenClawController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: 'OpenClaw 运行时健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '获取 OpenClaw 实例列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Post)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '注册 OpenClaw 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, openclaw_dto_1.RegisterInstanceDto]),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "registerInstance", null);
__decorate([
    (0, common_1.Delete)('instances/:id'),
    (0, swagger_1.ApiOperation)({ summary: '注销 OpenClaw 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], OpenClawController.prototype, "deleteInstance", null);
__decorate([
    (0, common_1.Post)('instances/:id/sync'),
    (0, swagger_1.ApiOperation)({ summary: '同步 Agent 配置到 OpenClaw' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "syncAgent", null);
__decorate([
    (0, common_1.Get)('instances/:id/status'),
    (0, swagger_1.ApiOperation)({ summary: '查询 OpenClaw 运行时状态' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Put)('instances/:id/config'),
    (0, swagger_1.ApiOperation)({ summary: '更新 OpenClaw 配置' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, openclaw_dto_1.UpdateConfigDto]),
    __metadata("design:returntype", void 0)
], OpenClawController.prototype, "updateConfig", null);
exports.OpenClawController = OpenClawController = __decorate([
    (0, swagger_1.ApiTags)('OpenClaw'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('openclaw'),
    __metadata("design:paramtypes", [openclaw_service_1.OpenClawService])
], OpenClawController);
//# sourceMappingURL=openclaw.controller.js.map