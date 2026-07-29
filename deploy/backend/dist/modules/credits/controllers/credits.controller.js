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
exports.AdminCreditsController = exports.CreditsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const credits_service_1 = require("../services/credits.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../../common/guards/roles.guard");
class AdminAdjustDto {
    userId;
    amount;
    remark;
}
let CreditsController = class CreditsController {
    creditsService;
    constructor(creditsService) {
        this.creditsService = creditsService;
    }
    health() {
        return this.creditsService.health();
    }
    async getAccount(user) {
        return this.creditsService.getAccount(user.userId);
    }
    async getTransactions(user, page, pageSize, type, source, startDate, endDate, keyword) {
        const query = {
            page: page ? parseInt(page, 10) : 1,
            pageSize: pageSize ? parseInt(pageSize, 10) : 10,
            keyword,
            type: type,
            source: source,
            startDate,
            endDate,
        };
        return this.creditsService.getTransactions(user.userId, query);
    }
};
exports.CreditsController = CreditsController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CreditsController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('account'),
    (0, swagger_1.ApiOperation)({ summary: '查询当前用户积分账户' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CreditsController.prototype, "getAccount", null);
__decorate([
    (0, common_1.Get)('transactions'),
    (0, swagger_1.ApiOperation)({ summary: '分页查询当前用户积分流水' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('source')),
    __param(5, (0, common_1.Query)('startDate')),
    __param(6, (0, common_1.Query)('endDate')),
    __param(7, (0, common_1.Query)('keyword')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], CreditsController.prototype, "getTransactions", null);
exports.CreditsController = CreditsController = __decorate([
    (0, swagger_1.ApiTags)('积分'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('credits'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [credits_service_1.CreditsService])
], CreditsController);
let AdminCreditsController = class AdminCreditsController {
    creditsService;
    constructor(creditsService) {
        this.creditsService = creditsService;
    }
    async adjust(dto, user) {
        return this.creditsService.adminAdjust(dto.userId, dto.amount, user.userId, dto.remark);
    }
};
exports.AdminCreditsController = AdminCreditsController;
__decorate([
    (0, common_1.Post)('adjust'),
    (0, swagger_1.ApiOperation)({ summary: '管理员调整用户积分' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [AdminAdjustDto, Object]),
    __metadata("design:returntype", Promise)
], AdminCreditsController.prototype, "adjust", null);
exports.AdminCreditsController = AdminCreditsController = __decorate([
    (0, swagger_1.ApiTags)('积分-管理端'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/credits'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin'),
    __metadata("design:paramtypes", [credits_service_1.CreditsService])
], AdminCreditsController);
//# sourceMappingURL=credits.controller.js.map