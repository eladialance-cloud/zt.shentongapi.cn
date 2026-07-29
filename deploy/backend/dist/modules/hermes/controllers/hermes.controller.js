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
exports.HermesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const hermes_service_1 = require("../services/hermes.service");
const hermes_dto_1 = require("../dto/hermes.dto");
let HermesController = class HermesController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    listInstances(user) {
        return this.service.listInstances(user.userId);
    }
    createInstance(user, dto) {
        return this.service.createInstance(user.userId, dto);
    }
    getInstance(user, id) {
        return this.service.getInstance(user.userId, id);
    }
    startInstance(user, id) {
        return this.service.startInstance(user.userId, id);
    }
    stopInstance(user, id) {
        return this.service.stopInstance(user.userId, id);
    }
    async deleteInstance(user, id) {
        await this.service.deleteInstance(user.userId, id);
        return null;
    }
    getCallLogs(user, id, query) {
        return this.service.getCallLogs(user.userId, id, query);
    }
    unmountSkill(user, id, skillId) {
        return this.service.unmountSkill(user.userId, id, skillId);
    }
    listMarketSkills() {
        return this.service.listMarketSkills();
    }
    listInstalledSkills(user) {
        return this.service.listInstalledSkills(user.userId);
    }
    installSkill(user, skillId) {
        return this.service.installSkill(user.userId, skillId);
    }
};
exports.HermesController = HermesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '获取 Hermes 实例列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Post)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '创建 Hermes 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, hermes_dto_1.CreateInstanceDto]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "createInstance", null);
__decorate([
    (0, common_1.Get)('instances/:id'),
    (0, swagger_1.ApiOperation)({ summary: '获取 Hermes 实例详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "getInstance", null);
__decorate([
    (0, common_1.Post)('instances/:id/start'),
    (0, swagger_1.ApiOperation)({ summary: '启动 Hermes 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "startInstance", null);
__decorate([
    (0, common_1.Post)('instances/:id/stop'),
    (0, swagger_1.ApiOperation)({ summary: '停止 Hermes 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "stopInstance", null);
__decorate([
    (0, common_1.Delete)('instances/:id'),
    (0, swagger_1.ApiOperation)({ summary: '删除 Hermes 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], HermesController.prototype, "deleteInstance", null);
__decorate([
    (0, common_1.Get)('instances/:id/call-logs'),
    (0, swagger_1.ApiOperation)({ summary: '获取实例任务历史' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, hermes_dto_1.PaginationDto]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "getCallLogs", null);
__decorate([
    (0, common_1.Post)('instances/:id/skills/:skillId/unmount'),
    (0, swagger_1.ApiOperation)({ summary: '卸载技能包' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('skillId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "unmountSkill", null);
__decorate([
    (0, common_1.Get)('skills/market'),
    (0, swagger_1.ApiOperation)({ summary: '获取技能市场列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "listMarketSkills", null);
__decorate([
    (0, common_1.Get)('skills/installed'),
    (0, swagger_1.ApiOperation)({ summary: '获取已安装技能列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "listInstalledSkills", null);
__decorate([
    (0, common_1.Post)('skills/:skillId/install'),
    (0, swagger_1.ApiOperation)({ summary: '安装技能包' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('skillId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], HermesController.prototype, "installSkill", null);
exports.HermesController = HermesController = __decorate([
    (0, swagger_1.ApiTags)('Hermes'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('hermes'),
    __metadata("design:paramtypes", [hermes_service_1.HermesService])
], HermesController);
//# sourceMappingURL=hermes.controller.js.map