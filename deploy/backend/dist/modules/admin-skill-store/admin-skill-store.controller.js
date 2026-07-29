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
exports.AdminSkillStoreController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const bigint_parse_pipe_1 = require("../../common/pipes/bigint-parse.pipe");
const admin_skill_store_service_1 = require("./admin-skill-store.service");
const skill_source_dto_1 = require("./dto/skill-source.dto");
const skill_package_dto_1 = require("./dto/skill-package.dto");
let AdminSkillStoreController = class AdminSkillStoreController {
    service;
    constructor(service) {
        this.service = service;
    }
    async createSource(dto) {
        return this.service.createSource(dto);
    }
    async listSources(query) {
        return this.service.listSources(query);
    }
    async analyze(id) {
        return this.service.triggerAnalyze(id);
    }
    async removeSource(id) {
        await this.service.removeSource(id);
        return null;
    }
    async listPackages(query) {
        return this.service.listPackages(query);
    }
    async packageDetail(id) {
        return this.service.packageDetail(id);
    }
    async updatePackage(id, dto) {
        await this.service.updatePackage(id, dto);
        return null;
    }
    async submitReview(id) {
        await this.service.submitReview(id);
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
    async publish(id) {
        await this.service.publish(id);
        return null;
    }
    async unpublish(id) {
        await this.service.unpublish(id);
        return null;
    }
    async removePackage(id) {
        await this.service.removePackage(id);
        return null;
    }
    async healthCheck(id) {
        return this.service.healthCheck(id);
    }
};
exports.AdminSkillStoreController = AdminSkillStoreController;
__decorate([
    (0, common_1.Post)('sources'),
    (0, swagger_1.ApiOperation)({ summary: '提交技能源' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [skill_source_dto_1.CreateSkillSourceDto]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "createSource", null);
__decorate([
    (0, common_1.Get)('sources'),
    (0, swagger_1.ApiOperation)({ summary: '技能源列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [skill_source_dto_1.SkillSourceQueryDto]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "listSources", null);
__decorate([
    (0, common_1.Post)('sources/:id/analyze'),
    (0, swagger_1.ApiOperation)({ summary: '触发解析' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "analyze", null);
__decorate([
    (0, common_1.Delete)('sources/:id'),
    (0, swagger_1.ApiOperation)({ summary: '删除技能源' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "removeSource", null);
__decorate([
    (0, common_1.Get)('packages'),
    (0, swagger_1.ApiOperation)({ summary: '技能包列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [skill_package_dto_1.SkillPackageQueryDto]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "listPackages", null);
__decorate([
    (0, common_1.Get)('packages/:id'),
    (0, swagger_1.ApiOperation)({ summary: '技能包详情' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "packageDetail", null);
__decorate([
    (0, common_1.Patch)('packages/:id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑技能包' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, skill_package_dto_1.UpdateSkillPackageDto]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "updatePackage", null);
__decorate([
    (0, common_1.Post)('packages/:id/submit-review'),
    (0, swagger_1.ApiOperation)({ summary: '提交审核' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "submitReview", null);
__decorate([
    (0, common_1.Post)('packages/:id/approve'),
    (0, swagger_1.ApiOperation)({ summary: '审核通过' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)('packages/:id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '审核驳回' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, skill_package_dto_1.RejectSkillPackageDto]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)('packages/:id/publish'),
    (0, swagger_1.ApiOperation)({ summary: '上架' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)('packages/:id/unpublish'),
    (0, swagger_1.ApiOperation)({ summary: '下架' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "unpublish", null);
__decorate([
    (0, common_1.Delete)('packages/:id'),
    (0, swagger_1.ApiOperation)({ summary: '删除技能包' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "removePackage", null);
__decorate([
    (0, common_1.Post)('packages/:id/health-check'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSkillStoreController.prototype, "healthCheck", null);
exports.AdminSkillStoreController = AdminSkillStoreController = __decorate([
    (0, swagger_1.ApiTags)('管理端-技能商店'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/skill-store'),
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_skill_store_service_1.AdminSkillStoreService])
], AdminSkillStoreController);
//# sourceMappingURL=admin-skill-store.controller.js.map