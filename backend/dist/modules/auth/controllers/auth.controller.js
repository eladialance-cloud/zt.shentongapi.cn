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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("../services/auth.service");
const token_service_1 = require("../services/token.service");
const register_dto_1 = require("../dto/register.dto");
const login_dto_1 = require("../dto/login.dto");
const refresh_token_dto_1 = require("../dto/refresh-token.dto");
const forgot_password_dto_1 = require("../dto/forgot-password.dto");
const reset_password_dto_1 = require("../dto/reset-password.dto");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const user_service_1 = require("../../user/services/user.service");
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
    }
    return req.ip || '0.0.0.0';
}
let AuthController = class AuthController {
    authService;
    tokenService;
    userService;
    constructor(authService, tokenService, userService) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.userService = userService;
    }
    register(dto) {
        return this.authService.register(dto);
    }
    login(dto, req) {
        return this.authService.login(dto, getClientIp(req));
    }
    refresh(dto) {
        return this.authService.refresh(dto.refreshToken);
    }
    async logout(body) {
        return this.authService.logout(body?.refreshToken || '');
    }
    async forgotPassword(dto) {
        await this.authService.forgotPassword(dto.email);
        return { message: '重置链接已发送到您的邮箱（30 分钟内有效）' };
    }
    async resetPassword(dto) {
        await this.authService.resetPassword(dto.token, dto.newPassword);
        return { message: '密码重置成功' };
    }
    async profile(user) {
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
    async me(user) {
        return this.profile(user);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: '用户注册' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '用户登录' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '刷新Token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '退出登录' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '忘记密码（发送重置邮件）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: '重置密码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '获取当前用户信息' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "profile", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '获取当前用户信息(前端兼容)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('认证'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        token_service_1.TokenService,
        user_service_1.UserService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map