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
exports.AdminRoleService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const role_entity_1 = require("../user/entities/role.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
let AdminRoleService = class AdminRoleService {
    roleRepo;
    userRoleRepo;
    constructor(roleRepo, userRoleRepo) {
        this.roleRepo = roleRepo;
        this.userRoleRepo = userRoleRepo;
    }
    async listRoles() {
        const roles = await this.roleRepo.find({ order: { createdAt: 'DESC' } });
        if (roles.length === 0)
            return [];
        const roleIds = roles.map((r) => r.id);
        const rows = await this.userRoleRepo
            .createQueryBuilder('ur')
            .select('ur.role_id', 'roleId')
            .addSelect('COUNT(*)', 'cnt')
            .where('ur.role_id IN (:...roleIds)', { roleIds })
            .groupBy('ur.role_id')
            .getRawMany();
        const countMap = new Map(rows.map((r) => [Number(r.roleId), Number(r.cnt)]));
        return roles.map((r) => this.toAdminRole(r, countMap.get(r.id) || 0));
    }
    async updatePermissions(id, permissionCodes) {
        const role = await this.roleRepo.findOne({ where: { id } });
        if (!role) {
            return null;
        }
        role.permissions = permissionCodes;
        await this.roleRepo.save(role);
        return this.toAdminRole(role, 0);
    }
    toAdminRole(role, userCount) {
        const permissions = role.permissions;
        const permissionCodes = Array.isArray(permissions)
            ? permissions.map(String)
            : [];
        return {
            id: role.id,
            name: role.name,
            code: role.code || '',
            permissionCodes,
            userCount,
            description: role.description,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt,
        };
    }
};
exports.AdminRoleService = AdminRoleService;
exports.AdminRoleService = AdminRoleService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_role_entity_1.UserRoleEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], AdminRoleService);
//# sourceMappingURL=admin-role.service.js.map