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
exports.AdminModelController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_model_service_1 = require("./admin-model.service");
const create_model_dto_1 = require("./dto/create-model.dto");
const update_model_dto_1 = require("./dto/update-model.dto");
const test_model_dto_1 = require("./dto/test-model.dto");
let AdminModelController = class AdminModelController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.list(query);
    }
    providers() {
        return this.service.providers();
    }
    async detail(id) {
        return this.service.detail(id);
    }
    async create(dto) {
        return this.service.create(dto);
    }
    async update(id, dto) {
        await this.service.update(id, dto);
    }
    async remove(id) {
        await this.service.remove(id);
    }
    async enable(id) {
        await this.service.enable(id);
    }
    async disable(id) {
        await this.service.disable(id);
    }
    async test(id, dto) {
        return this.service.test(id, dto);
    }
    async sync(id) {
        await this.service.sync(id);
    }
};
exports.AdminModelController = AdminModelController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '模型列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('providers'),
    (0, swagger_1.ApiOperation)({ summary: '供应商列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminModelController.prototype, "providers", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '模型详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增模型' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_model_dto_1.CreateModelDto]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑模型' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_model_dto_1.UpdateModelDto]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除模型' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/enable'),
    (0, swagger_1.ApiOperation)({ summary: '启用模型' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "enable", null);
__decorate([
    (0, common_1.Post)(':id/disable'),
    (0, swagger_1.ApiOperation)({ summary: '禁用模型' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "disable", null);
__decorate([
    (0, common_1.Post)(':id/test'),
    (0, swagger_1.ApiOperation)({ summary: '测试模型' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, test_model_dto_1.TestModelDto]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "test", null);
__decorate([
    (0, common_1.Post)(':id/sync'),
    (0, swagger_1.ApiOperation)({ summary: '手动同步 OpenClaw' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminModelController.prototype, "sync", null);
exports.AdminModelController = AdminModelController = __decorate([
    (0, swagger_1.ApiTags)('管理端-大模型配置'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/models'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_model_service_1.AdminModelService])
], AdminModelController);
//# sourceMappingURL=admin-model.controller.js.map