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
exports.TokenService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../../common/services/redis.service");
const app_constant_1 = require("../../../common/constants/app.constant");
const uuid_1 = require("uuid");
let TokenService = class TokenService {
    jwtService;
    config;
    redis;
    constructor(jwtService, config, redis) {
        this.jwtService = jwtService;
        this.config = config;
        this.redis = redis;
    }
    async generateAccessToken(payload) {
        return this.jwtService.signAsync({
            sub: payload.sub,
            username: payload.username,
            email: payload.email,
            roles: payload.roles,
        });
    }
    async generateRefreshToken(userId) {
        const refreshToken = (0, uuid_1.v4)();
        const ttl = this.parseTtl(this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'));
        await this.redis.set(`${app_constant_1.REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`, String(userId), ttl);
        return refreshToken;
    }
    async verifyRefreshToken(refreshToken) {
        const userId = await this.redis.get(`${app_constant_1.REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`);
        return userId ? Number(userId) : null;
    }
    async revokeRefreshToken(refreshToken) {
        await this.redis.del(`${app_constant_1.REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`);
    }
    parseTtl(ttl) {
        const match = ttl.match(/^(\d+)([smhd])?$/);
        if (!match)
            return 7 * 24 * 3600;
        const num = parseInt(match[1], 10);
        const unit = match[2] || 's';
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
        return num * multipliers[unit];
    }
};
exports.TokenService = TokenService;
exports.TokenService = TokenService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], TokenService);
//# sourceMappingURL=token.service.js.map