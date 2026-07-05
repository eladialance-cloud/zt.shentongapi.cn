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
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const user_service_1 = require("../services/user.service");
const invite_code_service_1 = require("../invite-code.service");
const update_user_dto_1 = require("../dto/update-user.dto");
const change_password_dto_1 = require("../dto/change-password.dto");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const file_util_1 = require("../../../common/utils/file.util");
let UserController = class UserController {
    userService;
    inviteCodeService;
    constructor(userService, inviteCodeService) {
        this.userService = userService;
        this.inviteCodeService = inviteCodeService;
    }
    async getProfile(user) {
        const fullUser = await this.userService.findById(user.userId);
        const roles = await this.userService.findUserRoles(user.userId);
        return {
            id: fullUser.id,
            username: fullUser.username,
            email: fullUser.email,
            phone: fullUser.phone,
            avatar: fullUser.avatar,
            status: fullUser.status,
            level: fullUser.level,
            roles,
            createdAt: fullUser.createdAt,
            updatedAt: fullUser.updatedAt,
        };
    }
    changePassword(dto, user) {
        return this.userService.changePassword(user.userId, dto);
    }
    async uploadAvatar(user, file) {
        const avatarUrl = `/uploads/avatars/${file.filename}`;
        return this.userService.updateAvatar(user.userId, avatarUrl);
    }
    update(id, dto, currentUser) {
        if (currentUser.userId !== id) {
            return this.userService.update(currentUser.userId, dto);
        }
        return this.userService.update(id, dto);
    }
    async generateInviteCode(user) {
        return this.inviteCodeService.generateCode(user.userId);
    }
    async listMyInviteCodes(user) {
        return this.inviteCodeService.listMyCodes(user.userId);
    }
    async getInviteStats(user) {
        return this.inviteCodeService.getInviteStats(user.userId);
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人信息' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)('password'),
    (0, swagger_1.ApiOperation)({ summary: '修改密码' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [change_password_dto_1.ChangePasswordDto, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Post)('avatar'),
    (0, swagger_1.ApiOperation)({ summary: '上传头像' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: './uploads/avatars',
            filename: (req, file, cb) => {
                const filename = (0, file_util_1.generateFileName)(file.originalname);
                cb(null, filename);
            },
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/^image\/(jpg|jpeg|png|gif|webp)$/)) {
                return cb(new Error('只允许上传图片文件'), false);
            }
            cb(null, true);
        },
    })),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "uploadAvatar", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '更新用户信息' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_user_dto_1.UpdateUserDto, Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('invite-codes'),
    (0, swagger_1.ApiOperation)({ summary: '生成邀请码' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "generateInviteCode", null);
__decorate([
    (0, common_1.Get)('invite-codes'),
    (0, swagger_1.ApiOperation)({ summary: '查询我的邀请码' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "listMyInviteCodes", null);
__decorate([
    (0, common_1.Get)('invite-stats'),
    (0, swagger_1.ApiOperation)({ summary: '邀请统计' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "getInviteStats", null);
exports.UserController = UserController = __decorate([
    (0, swagger_1.ApiTags)('用户'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [user_service_1.UserService,
        invite_code_service_1.InviteCodeService])
], UserController);
//# sourceMappingURL=user.controller.js.map