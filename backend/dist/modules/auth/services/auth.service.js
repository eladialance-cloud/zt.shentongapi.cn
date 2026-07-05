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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const user_service_1 = require("../../user/services/user.service");
const encryption_service_1 = require("../../../common/services/encryption.service");
const token_service_1 = require("./token.service");
const email_service_1 = require("./email.service");
const device_service_1 = require("../../device/device.service");
const invite_code_service_1 = require("../../user/invite-code.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const redis_service_1 = require("../../../common/services/redis.service");
const string_util_1 = require("../../../common/utils/string.util");
const HMAC_SECRET_PREFIX = 'hmac:secret:';
const PWD_RESET_PREFIX = 'pwd:reset:';
const PWD_RESET_TTL = 30 * 60;
const RESET_LINK_TEMPLATE = 'https://app.shentong.ai/reset-password?token=';
let AuthService = class AuthService {
    userService;
    encryption;
    tokenService;
    emailService;
    deviceService;
    inviteCodeService;
    redis;
    config;
    constructor(userService, encryption, tokenService, emailService, deviceService, inviteCodeService, redis, config) {
        this.userService = userService;
        this.encryption = encryption;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.deviceService = deviceService;
        this.inviteCodeService = inviteCodeService;
        this.redis = redis;
        this.config = config;
    }
    async register(dto) {
        const existsByUsername = await this.userService.findByUsername(dto.username);
        if (existsByUsername) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '用户名已被使用');
        }
        const existsByEmail = await this.userService.findByEmail(dto.email);
        if (existsByEmail) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '邮箱已被注册');
        }
        let inviterId;
        if (dto.inviteCode) {
            const inviteCode = await this.inviteCodeService.validateCode(dto.inviteCode);
            if (!inviteCode) {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVITE_CODE_INVALID, '邀请码无效或已过期');
            }
            inviterId = inviteCode.inviterId;
        }
        const hashedPassword = await this.encryption.hash(dto.password);
        const user = await this.userService.createUser({
            username: dto.username,
            email: dto.email,
            password: hashedPassword,
            inviteCode: undefined,
            inviterId,
            registerSource: dto.inviteCode ? 'invite' : 'direct',
        });
        if (dto.inviteCode) {
            await this.inviteCodeService.consumeCode(dto.inviteCode, user.id);
        }
        const roles = await this.userService.findUserRoles(user.id);
        const accessToken = await this.tokenService.generateAccessToken({
            sub: user.id,
            username: user.username,
            email: user.email,
            roles,
        });
        const refreshToken = await this.tokenService.generateRefreshToken(user.id);
        const secretKey = await this.generateAndStoreSecretKey(user.id);
        return {
            accessToken,
            refreshToken,
            secretKey,
            user: this.sanitizeUser(user, roles),
        };
    }
    async login(dto, ip) {
        let user;
        if ((0, string_util_1.isEmail)(dto.account)) {
            user = await this.userService.findByEmail(dto.account);
        }
        else {
            user = await this.userService.findByUsername(dto.account);
        }
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVALID_CREDENTIALS);
        }
        const userWithPwd = await this.userService.findByIdWithPassword(user.id);
        const isMatch = await this.encryption.compare(dto.password, userWithPwd.password);
        if (!isMatch) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVALID_CREDENTIALS);
        }
        if (dto.deviceFingerprint) {
            const existingDevice = await this.deviceService.findByFingerprint(user.id, dto.deviceFingerprint);
            if (!existingDevice) {
                const deviceCount = await this.deviceService.getUserDeviceCount(user.id);
                if (deviceCount >= 3) {
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.DEVICE_LIMIT_EXCEEDED, '已绑定设备数超过限制（最多 3 台），请先解绑旧设备');
                }
                await this.deviceService.bindDevice(user.id, {
                    deviceFingerprint: dto.deviceFingerprint,
                    deviceName: dto.deviceName || '未知设备',
                    deviceType: dto.deviceType || 'unknown',
                }, ip);
            }
            else {
                await this.deviceService.updateLoginInfo(existingDevice.id, ip);
            }
        }
        const roles = await this.userService.findUserRoles(user.id);
        const accessToken = await this.tokenService.generateAccessToken({
            sub: user.id,
            username: user.username,
            email: user.email,
            roles,
        });
        const refreshToken = await this.tokenService.generateRefreshToken(user.id);
        const secretKey = await this.generateAndStoreSecretKey(user.id);
        return {
            accessToken,
            refreshToken,
            secretKey,
            user: this.sanitizeUser(user, roles),
        };
    }
    async refresh(refreshToken) {
        const userId = await this.tokenService.verifyRefreshToken(refreshToken);
        if (!userId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.TOKEN_EXPIRED, 'refreshToken已失效,请重新登录');
        }
        const user = await this.userService.findById(userId);
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const roles = await this.userService.findUserRoles(user.id);
        await this.tokenService.revokeRefreshToken(refreshToken);
        const accessToken = await this.tokenService.generateAccessToken({
            sub: user.id,
            username: user.username,
            email: user.email,
            roles,
        });
        const newRefreshToken = await this.tokenService.generateRefreshToken(user.id);
        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    }
    async logout(refreshToken) {
        if (refreshToken) {
            await this.tokenService.revokeRefreshToken(refreshToken);
        }
        return null;
    }
    async forgotPassword(email) {
        const user = await this.userService.findByEmail(email);
        if (!user) {
            return;
        }
        const token = (0, string_util_1.generateRandomString)(64);
        await this.redis.set(`${PWD_RESET_PREFIX}${token}`, String(user.id), PWD_RESET_TTL);
        const resetLink = `${RESET_LINK_TEMPLATE}${token}`;
        await this.emailService.sendPasswordResetEmail(email, resetLink);
    }
    async resetPassword(token, newPassword) {
        const userIdStr = await this.redis.get(`${PWD_RESET_PREFIX}${token}`);
        if (!userIdStr) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVALID_OR_EXPIRED_TOKEN, '重置令牌无效或已过期');
        }
        const userId = Number(userIdStr);
        await this.userService.findById(userId);
        const hashedPassword = await this.encryption.hash(newPassword);
        await this.userService.updatePassword(userId, hashedPassword);
        await this.redis.del(`${PWD_RESET_PREFIX}${token}`);
    }
    async validateUser(account, password) {
        let user;
        if ((0, string_util_1.isEmail)(account)) {
            user = await this.userService.findByEmail(account);
        }
        else {
            user = await this.userService.findByUsername(account);
        }
        if (!user)
            return null;
        const userWithPwd = await this.userService.findByIdWithPassword(user.id);
        const isMatch = await this.encryption.compare(password, userWithPwd.password);
        if (!isMatch)
            return null;
        const roles = await this.userService.findUserRoles(user.id);
        return this.sanitizeUser(user, roles);
    }
    sanitizeUser(user, roles) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            status: user.status,
            level: user.level,
            roles,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
    async generateAndStoreSecretKey(userId) {
        const secretKey = (0, string_util_1.generateRandomString)(64);
        const ttl = this.parseRefreshTtl();
        await this.redis.set(`${HMAC_SECRET_PREFIX}${userId}`, secretKey, ttl);
        return secretKey;
    }
    parseRefreshTtl() {
        const ttl = this.config.get('JWT_REFRESH_EXPIRES_IN', '7d');
        const match = ttl.match(/^(\d+)([smhd])?$/);
        if (!match)
            return 7 * 24 * 3600;
        const num = parseInt(match[1], 10);
        const unit = match[2] || 's';
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
        return num * multipliers[unit];
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_service_1.UserService,
        encryption_service_1.EncryptionService,
        token_service_1.TokenService,
        email_service_1.EmailService,
        device_service_1.DeviceService,
        invite_code_service_1.InviteCodeService,
        redis_service_1.RedisService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map