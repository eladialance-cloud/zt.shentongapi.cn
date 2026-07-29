import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserEntity } from '../user/entities/user.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { RedisService } from '../../common/services/redis.service';
export declare const ADMIN_TOKEN_BLACKLIST_PREFIX = "admin:token:blacklist:";
export interface AdminTokenPayload {
    userId: number;
    username: string;
    role: 'admin';
}
export interface AdminLoginResult {
    token: string;
    expiresAt: number;
    user: {
        id: number;
        username: string;
        email?: string;
        avatar?: string;
        roleIds: number[];
        roleCodes: string[];
        status: 'active' | 'disabled';
        createdAt: Date;
        updatedAt: Date;
    };
    permissions: string[];
    mustChangePassword: boolean;
}
export declare class AdminAuthService {
    private userRepo;
    private roleRepo;
    private userRoleRepo;
    private jwtService;
    private config;
    private redisService;
    constructor(userRepo: Repository<UserEntity>, roleRepo: Repository<RoleEntity>, userRoleRepo: Repository<UserRoleEntity>, jwtService: JwtService, config: ConfigService, redisService: RedisService);
    login(username: string, password: string): Promise<AdminLoginResult>;
    logout(token: string): Promise<void>;
    getProfile(userId: number): Promise<{
        user: {
            id: number;
            username: string;
            email: string;
            avatar: string | undefined;
            roleIds: number[];
            roleCodes: string[];
            status: "active" | "disabled";
            createdAt: Date;
            updatedAt: Date;
        };
        permissions: string[];
    }>;
    changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void>;
    private loadAdminIdentity;
    private toAdminUser;
    private parseExpiresMs;
}
