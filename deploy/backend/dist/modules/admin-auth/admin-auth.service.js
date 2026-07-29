"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthService = exports.ADMIN_TOKEN_BLACKLIST_PREFIX = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const crypto = __importStar(require("crypto"));
const user_entity_1 = require("../user/entities/user.entity");
const role_entity_1 = require("../user/entities/role.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const redis_service_1 = require("../../common/services/redis.service");
exports.ADMIN_TOKEN_BLACKLIST_PREFIX = 'admin:token:blacklist:';
let AdminAuthService = class AdminAuthService {
    userRepo;
    roleRepo;
    userRoleRepo;
    jwtService;
    config;
    redisService;
    constructor(userRepo, roleRepo, userRoleRepo, jwtService, config, redisService) {
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.userRoleRepo = userRoleRepo;
        this.jwtService = jwtService;
        this.config = config;
        this.redisService = redisService;
    }
    async login(username, password) {
        const user = await this.userRepo
            .createQueryBuilder('u')
            .addSelect('u.password')
            .where('u.username = :username', { username })
            .getOne();
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVALID_CREDENTIALS);
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INVALID_CREDENTIALS);
        }
        const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(user.id);
        if (!roleCodes.some((c) => c === 'super_admin' || c === 'admin')) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '非管理员账号');
        }
        const payload = {
            userId: user.id,
            username: user.username,
            role: 'admin',
        };
        const token = await this.jwtService.signAsync(payload);
        const expiresAt = Date.now() + this.parseExpiresMs();
        return {
            token,
            expiresAt,
            user: this.toAdminUser(user, roleIds, roleCodes),
            permissions,
            mustChangePassword: user.mustChangePassword,
        };
    }
    async logout(token) {
        try {
            const decoded = this.jwtService.decode(token);
            if (decoded?.exp) {
                const ttl = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttl > 0) {
                    const tokenHash = crypto
                        .createHash('sha256')
                        .update(token)
                        .digest('hex');
                    await this.redisService.set(`${exports.ADMIN_TOKEN_BLACKLIST_PREFIX}${tokenHash}`, '1', ttl);
                }
            }
        }
        catch {
        }
    }
    async getProfile(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(userId);
        return {
            user: this.toAdminUser(user, roleIds, roleCodes),
            permissions,
        };
    }
    async changePassword(userId, oldPassword, newPassword) {
        const user = await this.userRepo
            .createQueryBuilder('u')
            .addSelect('u.password')
            .where('u.id = :id', { id: userId })
            .getOne();
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PASSWORD_INCORRECT);
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        await this.userRepo.update({ id: userId }, { password: hashed, mustChangePassword: false });
    }
    async loadAdminIdentity(userId) {
        const userRoles = await this.userRoleRepo.find({ where: { userId } });
        const roleIds = userRoles.map((ur) => ur.roleId);
        const roles = roleIds.length
            ? await this.roleRepo.findByIds(roleIds)
            : [];
        const roleCodes = roles
            .map((r) => r.code)
            .filter((c) => !!c);
        const permissions = Array.from(new Set(roles.flatMap((r) => {
            const p = r.permissions;
            return Array.isArray(p) ? p.map(String) : [];
        })));
        return { roleIds, roleCodes, permissions };
    }
    toAdminUser(user, roleIds, roleCodes) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            roleIds,
            roleCodes,
            status: (user.status === 'active'
                ? 'active'
                : 'disabled'),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
    parseExpiresMs() {
        const ttl = this.config.get('ADMIN_JWT_EXPIRES_IN', '8h');
        const match = ttl.match(/^(\d+)([smhd])?$/);
        if (!match)
            return 8 * 3600 * 1000;
        const num = parseInt(match[1], 10);
        const unit = match[2] || 's';
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 3600 * 1000,
            d: 86400 * 1000,
        };
        return num * multipliers[unit];
    }
};
exports.AdminAuthService = AdminAuthService;
exports.AdminAuthService = AdminAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_role_entity_1.UserRoleEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], AdminAuthService);
//# sourceMappingURL=admin-auth.service.js.map