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
exports.AdminInviteCodeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const invite_code_service_1 = require("../user/invite-code.service");
const generate_invite_codes_dto_1 = require("./dto/generate-invite-codes.dto");
const invite_code_query_dto_1 = require("./dto/invite-code-query.dto");
let AdminInviteCodeController = class AdminInviteCodeController {
    inviteCodeService;
    constructor(inviteCodeService) {
        this.inviteCodeService = inviteCodeService;
    }
    async generate(dto, req) {
        const adminId = req.adminUser?.id ?? 0;
        const codes = [];
        for (let i = 0; i < dto.count; i++) {
            const entity = await this.inviteCodeService.generateCode(adminId, dto.expireDays);
            codes.push({
                id: entity.id,
                code: entity.code,
                expiresAt: entity.expiresAt,
            });
        }
        return { codes, count: codes.length };
    }
    async list(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const result = await this.inviteCodeService.listAdminCodes({
            status: query.status,
            page,
            pageSize,
        });
        return result;
    }
    async revoke(id) {
        await this.inviteCodeService.revokeCode(id);
        return { success: true };
    }
};
exports.AdminInviteCodeController = AdminInviteCodeController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, swagger_1.ApiOperation)({ summary: '批量生成邀请码' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_invite_codes_dto_1.GenerateInviteCodesDto, Object]),
    __metadata("design:returntype", Promise)
], AdminInviteCodeController.prototype, "generate", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '邀请码列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [invite_code_query_dto_1.InviteCodeQueryDto]),
    __metadata("design:returntype", Promise)
], AdminInviteCodeController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/revoke'),
    (0, swagger_1.ApiOperation)({ summary: '作废邀请码' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminInviteCodeController.prototype, "revoke", null);
exports.AdminInviteCodeController = AdminInviteCodeController = __decorate([
    (0, swagger_1.ApiTags)('管理端-邀请码'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/invite-codes'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [invite_code_service_1.InviteCodeService])
], AdminInviteCodeController);
//# sourceMappingURL=admin-invite-code.controller.js.map