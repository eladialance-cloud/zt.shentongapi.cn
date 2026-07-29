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
exports.AdminAgentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_agent_service_1 = require("./admin-agent.service");
const agent_query_dto_1 = require("./dto/agent-query.dto");
const agent_review_query_dto_1 = require("./dto/agent-review-query.dto");
const create_agent_dto_1 = require("./dto/create-agent.dto");
const update_agent_dto_1 = require("./dto/update-agent.dto");
const reject_agent_dto_1 = require("./dto/reject-agent.dto");
const import_github_dto_1 = require("./dto/import-github.dto");
const update_category_display_dto_1 = require("./dto/update-category-display.dto");
let AdminAgentController = class AdminAgentController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.listAgents(query);
    }
    async create(dto, req) {
        return this.service.createAgent(dto, req.adminUser.id);
    }
    async importGithub(dto) {
        return this.service.importGithub(dto);
    }
    async getImportTask(taskId) {
        return this.service.getImportTask(taskId);
    }
    async listReview(query) {
        return this.service.listReview(query);
    }
    async listCategories() {
        return this.service.listCategories();
    }
    async updateCategoryDisplay(category, dto) {
        await this.service.updateCategoryDisplay(category, dto);
    }
    async detail(id) {
        return this.service.getAgentDetail(id);
    }
    async update(id, dto) {
        await this.service.updateAgent(id, dto);
    }
    async delete(id) {
        await this.service.deleteAgent(id);
    }
    async publish(id) {
        await this.service.publishAgent(id);
    }
    async unpublish(id) {
        await this.service.unpublishAgent(id);
    }
    async approve(id, req) {
        await this.service.approveAgent(id, req.adminUser.id);
    }
    async reject(id, dto, req) {
        await this.service.rejectAgent(id, dto, req.adminUser.id);
    }
    async forceUnpublish(id, dto, req) {
        await this.service.forceUnpublishAgent(id, dto, req.adminUser.id);
    }
};
exports.AdminAgentController = AdminAgentController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Agent 列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_query_dto_1.AgentQueryDto]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增 Agent' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_agent_dto_1.CreateAgentDto, Object]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('import-github'),
    (0, swagger_1.ApiOperation)({ summary: 'GitHub 仓库异步导入' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [import_github_dto_1.ImportGithubDto]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "importGithub", null);
__decorate([
    (0, common_1.Get)('import-github/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '查询 GitHub 导入任务状态' }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "getImportTask", null);
__decorate([
    (0, common_1.Get)('review'),
    (0, swagger_1.ApiOperation)({ summary: '审核队列列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [agent_review_query_dto_1.AgentReviewQueryDto]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "listReview", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, swagger_1.ApiOperation)({ summary: '分类列表(含每分类 Agent 数量)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Patch)('categories/:category'),
    (0, swagger_1.ApiOperation)({ summary: '更新分类显示名' }),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_category_display_dto_1.UpdateCategoryDisplayDto]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "updateCategoryDisplay", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Agent 详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "detail", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑 Agent' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_agent_dto_1.UpdateAgentDto]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除 Agent' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, swagger_1.ApiOperation)({ summary: '上架 Agent' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/unpublish'),
    (0, swagger_1.ApiOperation)({ summary: '下架 Agent' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "unpublish", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, swagger_1.ApiOperation)({ summary: '通过审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '驳回审核' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, reject_agent_dto_1.RejectAgentDto, Object]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/force-unpublish'),
    (0, swagger_1.ApiOperation)({ summary: '强制下架' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, reject_agent_dto_1.RejectAgentDto, Object]),
    __metadata("design:returntype", Promise)
], AdminAgentController.prototype, "forceUnpublish", null);
exports.AdminAgentController = AdminAgentController = __decorate([
    (0, swagger_1.ApiTags)('管理端-Agent 市场'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/agents'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_agent_service_1.AdminAgentService])
], AdminAgentController);
//# sourceMappingURL=admin-agent.controller.js.map