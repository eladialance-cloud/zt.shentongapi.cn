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
exports.TenantService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const team_entity_1 = require("../../user/entities/team.entity");
const team_member_entity_1 = require("../../user/entities/team-member.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let TenantService = class TenantService {
    teamRepo;
    memberRepo;
    dataSource;
    constructor(teamRepo, memberRepo, dataSource) {
        this.teamRepo = teamRepo;
        this.memberRepo = memberRepo;
        this.dataSource = dataSource;
    }
    health() {
        return { status: 'ok', module: 'tenant' };
    }
    async listMyTeams(userId, page = 1, pageSize = 20) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const [memberships, total] = await this.memberRepo.findAndCount({
            where: { userId },
            skip: (p - 1) * ps,
            take: ps,
            order: { joinedAt: 'DESC' },
        });
        if (memberships.length === 0) {
            return { list: [], total, page: p, pageSize: ps };
        }
        const teamIds = memberships.map((m) => m.teamId);
        const teams = await this.teamRepo.find({
            where: teamIds.map((id) => ({ id })),
            order: { createdAt: 'DESC' },
        });
        return { list: teams, total, page: p, pageSize: ps };
    }
    async createTeam(userId, data) {
        return this.dataSource.transaction(async (manager) => {
            const teamRepo = manager.getRepository(team_entity_1.TeamEntity);
            const memberRepo = manager.getRepository(team_member_entity_1.TeamMemberEntity);
            const team = teamRepo.create({
                name: data.name,
                description: data.description,
                ownerId: userId,
            });
            const saved = await teamRepo.save(team);
            const member = memberRepo.create({
                teamId: saved.id,
                userId,
                role: 'admin',
            });
            await memberRepo.save(member);
            return saved;
        });
    }
    async getTeamDetail(userId, teamId) {
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        const membership = await this.assertMember(userId, teamId);
        return { team, role: membership.role };
    }
    async updateTeam(userId, teamId, data) {
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        await this.assertOwner(userId, teamId);
        if (data.name !== undefined)
            team.name = data.name;
        if (data.description !== undefined)
            team.description = data.description;
        return this.teamRepo.save(team);
    }
    async deleteTeam(userId, teamId) {
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        await this.assertOwner(userId, teamId);
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(team_member_entity_1.TeamMemberEntity, { teamId });
            await manager.delete(team_entity_1.TeamEntity, { id: teamId });
        });
    }
    async listMembers(userId, teamId) {
        await this.assertMember(userId, teamId);
        return this.memberRepo.find({
            where: { teamId },
            order: { joinedAt: 'ASC' },
        });
    }
    async addMember(userId, teamId, targetUserId, role) {
        await this.assertAdmin(userId, teamId);
        if (userId === targetUserId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '不能添加自己为成员');
        }
        const exists = await this.memberRepo.findOne({
            where: { teamId, userId: targetUserId },
        });
        if (exists) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '该用户已是团队成员');
        }
        const member = this.memberRepo.create({
            teamId,
            userId: targetUserId,
            role,
        });
        return this.memberRepo.save(member);
    }
    async removeMember(userId, teamId, targetUserId) {
        await this.assertAdmin(userId, teamId);
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        if (team.ownerId === targetUserId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '不能移除团队所有者');
        }
        const member = await this.memberRepo.findOne({
            where: { teamId, userId: targetUserId },
        });
        if (!member) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '成员不存在');
        }
        await this.memberRepo.delete({ id: member.id });
    }
    async updateMemberRole(userId, teamId, targetUserId, role) {
        await this.assertOwner(userId, teamId);
        if (userId === targetUserId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '不能修改自己的角色');
        }
        const member = await this.memberRepo.findOne({
            where: { teamId, userId: targetUserId },
        });
        if (!member) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '成员不存在');
        }
        member.role = role;
        return this.memberRepo.save(member);
    }
    async assertMember(userId, teamId) {
        const member = await this.memberRepo.findOne({ where: { teamId, userId } });
        if (!member) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '您不是该团队成员');
        }
        return member;
    }
    async assertAdmin(userId, teamId) {
        const member = await this.assertMember(userId, teamId);
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (team && team.ownerId === userId) {
            return member;
        }
        if (member.role === 'admin') {
            return member;
        }
        business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '需要管理员权限');
    }
    async assertOwner(userId, teamId) {
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        if (team.ownerId !== userId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '需要团队所有者权限');
        }
        return team;
    }
};
exports.TenantService = TenantService;
exports.TenantService = TenantService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(team_entity_1.TeamEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(team_member_entity_1.TeamMemberEntity)),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], TenantService);
//# sourceMappingURL=tenant.service.js.map