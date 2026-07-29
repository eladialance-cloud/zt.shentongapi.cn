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
exports.AdminWorkflowController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_workflow_service_1 = require("./admin-workflow.service");
const workflow_dto_1 = require("./dto/workflow.dto");
const review_dto_1 = require("./dto/review.dto");
let AdminWorkflowController = class AdminWorkflowController {
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
    async stats() {
        return this.service.stats();
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
};
exports.AdminWorkflowController = AdminWorkflowController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '工作流列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [workflow_dto_1.AdminWorkflowQueryDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增工作流' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [workflow_dto_1.CreateAdminWorkflowDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('review'),
    (0, swagger_1.ApiOperation)({ summary: '审核队列' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [workflow_dto_1.AdminWorkflowReviewQueryDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "listReview", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: '工作流统计' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '工作流详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "detail", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑工作流' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, workflow_dto_1.UpdateAdminWorkflowDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除工作流' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, swagger_1.ApiOperation)({ summary: '审核工作流（approve|reject）' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, review_dto_1.WorkflowReviewDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "review", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, swagger_1.ApiOperation)({ summary: '通过审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '驳回审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, review_dto_1.WorkflowRejectDto]),
    __metadata("design:returntype", Promise)
], AdminWorkflowController.prototype, "reject", null);
exports.AdminWorkflowController = AdminWorkflowController = __decorate([
    (0, swagger_1.ApiTags)('管理端-工作流'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/workflows'),
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_workflow_service_1.AdminWorkflowService])
], AdminWorkflowController);
//# sourceMappingURL=admin-workflow.controller.js.map