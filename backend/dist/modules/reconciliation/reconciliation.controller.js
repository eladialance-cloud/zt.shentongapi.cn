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
exports.ReconciliationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reconciliation_service_1 = require("./services/reconciliation.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
class AdjustDiffDto {
    amount;
    remark;
}
class IgnoreDiffDto {
    remark;
}
let ReconciliationController = class ReconciliationController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    async getDiffs(page, pageSize, type, status) {
        return this.service.getDiffs({
            page: page ? parseInt(page, 10) : 1,
            pageSize: pageSize ? parseInt(pageSize, 10) : 10,
            type: type,
            status,
        });
    }
    async run() {
        return this.service.runAllReconciliations();
    }
    async adjust(id, dto, user) {
        return this.service.adjustDiff(id, user.userId, dto.amount, dto.remark);
    }
    async ignore(id, dto, user) {
        return this.service.ignoreDiff(id, user.userId, dto.remark);
    }
};
exports.ReconciliationController = ReconciliationController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReconciliationController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('diffs'),
    (0, swagger_1.ApiOperation)({ summary: '分页查询对账差异列表' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('type')),
    __param(3, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ReconciliationController.prototype, "getDiffs", null);
__decorate([
    (0, common_1.Post)('run'),
    (0, swagger_1.ApiOperation)({ summary: '手动触发全量对账' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReconciliationController.prototype, "run", null);
__decorate([
    (0, common_1.Post)(':id/adjust'),
    (0, swagger_1.ApiOperation)({ summary: '手动调整对账差异' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, AdjustDiffDto, Object]),
    __metadata("design:returntype", Promise)
], ReconciliationController.prototype, "adjust", null);
__decorate([
    (0, common_1.Post)(':id/ignore'),
    (0, swagger_1.ApiOperation)({ summary: '标记对账差异为忽略' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, IgnoreDiffDto, Object]),
    __metadata("design:returntype", Promise)
], ReconciliationController.prototype, "ignore", null);
exports.ReconciliationController = ReconciliationController = __decorate([
    (0, swagger_1.ApiTags)('对账-管理端'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/reconciliation'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin'),
    __metadata("design:paramtypes", [reconciliation_service_1.ReconciliationService])
], ReconciliationController);
//# sourceMappingURL=reconciliation.controller.js.map