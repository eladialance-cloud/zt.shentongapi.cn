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
exports.AdminUserController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_user_service_1 = require("./admin-user.service");
const create_admin_user_dto_1 = require("./dto/create-admin-user.dto");
const user_query_dto_1 = require("./dto/user-query.dto");
const ban_user_dto_1 = require("./dto/ban-user.dto");
const credits_adjust_dto_1 = require("./dto/credits-adjust.dto");
const update_user_level_dto_1 = require("./dto/update-user-level.dto");
let AdminUserController = class AdminUserController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.listUsers(query);
    }
    async create(dto) {
        return this.service.createAdminUser(dto);
    }
    async delete(id) {
        await this.service.deleteUser(id);
    }
    async ban(id, dto) {
        await this.service.banUser(id, dto);
    }
    async unban(id) {
        await this.service.unbanUser(id);
    }
    async updateLevel(id, dto) {
        await this.service.updateUserLevel(id, dto.level);
    }
    async creditsAccount(id) {
        return this.service.getCreditsAccount(id);
    }
    async creditsAdjust(id, dto, req) {
        await this.service.adjustCredits(id, dto, req.adminUser.id);
    }
    async creditsTransactions(id, limit) {
        return this.service.listCreditTransactions(id, limit ? Number(limit) : 50);
    }
};
exports.AdminUserController = AdminUserController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '用户列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_query_dto_1.UserQueryDto]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '管理员创建用户' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_admin_user_dto_1.CreateAdminUserDto]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除用户（软删除）' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/ban'),
    (0, swagger_1.ApiOperation)({ summary: '封禁用户' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, ban_user_dto_1.BanUserDto]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "ban", null);
__decorate([
    (0, common_1.Post)(':id/unban'),
    (0, swagger_1.ApiOperation)({ summary: '解封用户' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "unban", null);
__decorate([
    (0, common_1.Patch)(':id/level'),
    (0, swagger_1.ApiOperation)({ summary: '调整用户等级' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_user_level_dto_1.UpdateUserLevelDto]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "updateLevel", null);
__decorate([
    (0, common_1.Get)(':id/credits-account'),
    (0, swagger_1.ApiOperation)({ summary: '用户积分账户' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "creditsAccount", null);
__decorate([
    (0, common_1.Post)(':id/credits-adjust'),
    (0, swagger_1.ApiOperation)({ summary: '手动调整积分' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, credits_adjust_dto_1.CreditsAdjustDto, Object]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "creditsAdjust", null);
__decorate([
    (0, common_1.Get)(':id/credits-transactions'),
    (0, swagger_1.ApiOperation)({ summary: '用户积分流水' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], AdminUserController.prototype, "creditsTransactions", null);
exports.AdminUserController = AdminUserController = __decorate([
    (0, swagger_1.ApiTags)('管理端-用户'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/users'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_user_service_1.AdminUserService])
], AdminUserController);
//# sourceMappingURL=admin-user.controller.js.map