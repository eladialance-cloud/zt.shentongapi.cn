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
exports.AdminAuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_audit_service_1 = require("./admin-audit.service");
const audit_queue_query_dto_1 = require("./dto/audit-queue-query.dto");
const reject_audit_dto_1 = require("./dto/reject-audit.dto");
const update_audit_config_dto_1 = require("./dto/update-audit-config.dto");
const audit_test_dto_1 = require("./dto/audit-test.dto");
let AdminAuditController = class AdminAuditController {
    service;
    constructor(service) {
        this.service = service;
    }
    async listQueue(query) {
        return this.service.listQueue(query);
    }
    async approve(id, req) {
        await this.service.approve(id, req.adminUser);
        return null;
    }
    async reject(id, dto, req) {
        await this.service.reject(id, dto, req.adminUser);
        return null;
    }
    async markFalsePositive(id, req) {
        await this.service.markFalsePositive(id, req.adminUser);
        return null;
    }
    async getConfig() {
        return this.service.getAuditConfig();
    }
    async updateConfig(dto) {
        await this.service.updateAuditConfig(dto);
        return null;
    }
    async test(dto) {
        return this.service.testAudit(dto);
    }
};
exports.AdminAuditController = AdminAuditController;
__decorate([
    (0, common_1.Get)('queue'),
    (0, swagger_1.ApiOperation)({ summary: '审核队列' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [audit_queue_query_dto_1.AuditQueueQueryDto]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "listQueue", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, swagger_1.ApiOperation)({ summary: '审核通过' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '审核驳回' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, reject_audit_dto_1.RejectAuditDto, Object]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/false-positive'),
    (0, swagger_1.ApiOperation)({ summary: '标记误报' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "markFalsePositive", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, swagger_1.ApiOperation)({ summary: 'AI 审核配置' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, swagger_1.ApiOperation)({ summary: '更新 AI 审核配置' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_audit_config_dto_1.UpdateAuditConfigDto]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "updateConfig", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, swagger_1.ApiOperation)({ summary: 'AI 审核测试' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [audit_test_dto_1.AuditTestDto]),
    __metadata("design:returntype", Promise)
], AdminAuditController.prototype, "test", null);
exports.AdminAuditController = AdminAuditController = __decorate([
    (0, swagger_1.ApiTags)('管理端-内容审核'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/audit'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_audit_service_1.AdminAuditService])
], AdminAuditController);
//# sourceMappingURL=admin-audit.controller.js.map