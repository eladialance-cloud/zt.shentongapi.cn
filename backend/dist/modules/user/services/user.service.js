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
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../entities/user.entity");
const role_entity_1 = require("../entities/role.entity");
const user_role_entity_1 = require("../entities/user-role.entity");
const encryption_service_1 = require("../../../common/services/encryption.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let UserService = class UserService {
    userRepo;
    roleRepo;
    userRoleRepo;
    encryption;
    constructor(userRepo, roleRepo, userRoleRepo, encryption) {
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.userRoleRepo = userRoleRepo;
        this.encryption = encryption;
    }
    async findById(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
    async findByIdWithPassword(id) {
        const user = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.id = :id', { id })
            .getOne();
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
    async findByUsername(username) {
        return this.userRepo.findOne({ where: { username } });
    }
    async findByEmail(email) {
        return this.userRepo.findOne({ where: { email } });
    }
    async createUser(dto) {
        const inviteCode = dto.inviteCode || Math.random().toString(36).slice(2, 10).toUpperCase();
        const user = this.userRepo.create({
            username: dto.username,
            email: dto.email,
            password: dto.password,
            inviteCode,
            inviterId: dto.inviterId,
            registerSource: dto.registerSource || 'direct',
        });
        const saved = await this.userRepo.save(user);
        const userRole = await this.roleRepo.findOne({ where: { name: 'user' } });
        if (userRole) {
            await this.userRoleRepo.save({
                userId: saved.id,
                roleId: userRole.id,
            });
        }
        return saved;
    }
    async update(id, dto) {
        const user = await this.findById(id);
        if (dto.username && dto.username !== user.username) {
            const exists = await this.findByUsername(dto.username);
            if (exists) {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '用户名已被使用');
            }
        }
        if (dto.email && dto.email !== user.email) {
            const exists = await this.findByEmail(dto.email);
            if (exists) {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '邮箱已被使用');
            }
        }
        Object.assign(user, dto);
        return this.userRepo.save(user);
    }
    async changePassword(id, dto) {
        const user = await this.findByIdWithPassword(id);
        const isMatch = await this.encryption.compare(dto.oldPassword, user.password);
        if (!isMatch) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PASSWORD_INCORRECT);
        }
        user.password = await this.encryption.hash(dto.newPassword);
        await this.userRepo.save(user);
    }
    async updatePassword(id, hashedPassword) {
        const user = await this.findById(id);
        user.password = hashedPassword;
        await this.userRepo.save(user);
    }
    async updateAvatar(id, avatarUrl) {
        const user = await this.findById(id);
        user.avatar = avatarUrl;
        return this.userRepo.save(user);
    }
    async findUserRoles(userId) {
        const userRoles = await this.userRoleRepo.find({ where: { userId } });
        if (userRoles.length === 0)
            return [];
        const roleIds = userRoles.map((ur) => ur.roleId);
        const roles = await this.roleRepo.findByIds(roleIds);
        return roles.map((r) => r.name);
    }
    async paginate(page, pageSize, keyword) {
        const where = keyword
            ? [{ username: (0, typeorm_2.Like)(`%${keyword}%`) }, { email: (0, typeorm_2.Like)(`%${keyword}%`) }]
            : {};
        const [list, total] = await this.userRepo.findAndCount({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            order: { createdAt: 'DESC' },
        });
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_role_entity_1.UserRoleEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        encryption_service_1.EncryptionService])
], UserService);
//# sourceMappingURL=user.service.js.map