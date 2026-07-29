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
exports.OpcService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const opc_team_entity_1 = require("../entities/opc-team.entity");
const opc_team_member_entity_1 = require("../entities/opc-team-member.entity");
const opc_task_entity_1 = require("../entities/opc-task.entity");
const opc_agent_repo_entity_1 = require("../entities/opc-agent-repo.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let OpcService = class OpcService {
    teamRepo;
    memberRepo;
    taskRepo;
    agentRepo;
    dataSource;
    constructor(teamRepo, memberRepo, taskRepo, agentRepo, dataSource) {
        this.teamRepo = teamRepo;
        this.memberRepo = memberRepo;
        this.taskRepo = taskRepo;
        this.agentRepo = agentRepo;
        this.dataSource = dataSource;
    }
    health() {
        return { status: 'ok', module: 'opc' };
    }
    async listTeams(userId, page = 1, pageSize = 20) {
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
            const teamRepo = manager.getRepository(opc_team_entity_1.OpcTeamEntity);
            const memberRepo = manager.getRepository(opc_team_member_entity_1.OpcTeamMemberEntity);
            const team = teamRepo.create({
                name: data.name,
                avatar: data.avatar,
                description: data.description,
                memberCount: 1,
                creatorId: userId,
            });
            const saved = await teamRepo.save(team);
            const member = memberRepo.create({
                teamId: saved.id,
                userId,
                role: 'owner',
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
        await this.assertAdmin(userId, teamId);
        if (data.name !== undefined)
            team.name = data.name;
        if (data.description !== undefined)
            team.description = data.description;
        if (data.avatar !== undefined)
            team.avatar = data.avatar;
        return this.teamRepo.save(team);
    }
    async deleteTeam(userId, teamId) {
        const team = await this.teamRepo.findOne({ where: { id: teamId } });
        if (!team) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队不存在');
        }
        await this.assertOwner(userId, teamId);
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(opc_team_member_entity_1.OpcTeamMemberEntity, { teamId });
            await manager.delete(opc_task_entity_1.OpcTaskEntity, { teamId });
            await manager.delete(opc_agent_repo_entity_1.OpcAgentRepoEntity, { teamId });
            await manager.delete(opc_team_entity_1.OpcTeamEntity, { id: teamId });
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
        return this.dataSource.transaction(async (manager) => {
            const memberRepo = manager.getRepository(opc_team_member_entity_1.OpcTeamMemberEntity);
            const teamRepo = manager.getRepository(opc_team_entity_1.OpcTeamEntity);
            const exists = await memberRepo.findOne({
                where: { teamId, userId: targetUserId },
            });
            if (exists) {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '该用户已是团队成员');
            }
            const member = memberRepo.create({
                teamId,
                userId: targetUserId,
                role,
            });
            const saved = await memberRepo.save(member);
            await teamRepo.increment({ id: teamId }, 'memberCount', 1);
            return saved;
        });
    }
    async removeMember(userId, teamId, targetUserId) {
        await this.assertAdmin(userId, teamId);
        return this.dataSource.transaction(async (manager) => {
            const memberRepo = manager.getRepository(opc_team_member_entity_1.OpcTeamMemberEntity);
            const teamRepo = manager.getRepository(opc_team_entity_1.OpcTeamEntity);
            const member = await memberRepo.findOne({
                where: { teamId, userId: targetUserId },
            });
            if (!member) {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '成员不存在');
            }
            if (member.role === 'owner') {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '不能移除团队所有者');
            }
            await memberRepo.delete({ id: member.id });
            await teamRepo.decrement({ id: teamId }, 'memberCount', 1);
        });
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
    async listTasks(userId, teamId, page = 1, pageSize = 20, status) {
        await this.assertMember(userId, teamId);
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const where = { teamId };
        if (status) {
            where.status = status;
        }
        const [list, total] = await this.taskRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return { list, total, page: p, pageSize: ps };
    }
    async createTask(userId, teamId, data) {
        await this.assertMember(userId, teamId);
        const task = this.taskRepo.create({
            teamId,
            title: data.title,
            description: data.description,
            status: 'pending',
            assigneeId: data.assigneeId,
            creatorId: userId,
            priority: data.priority ?? 'medium',
            dueDate: data.dueDate,
        });
        return this.taskRepo.save(task);
    }
    async getTask(userId, teamId, taskId) {
        await this.assertMember(userId, teamId);
        const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
        if (!task) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '任务不存在');
        }
        return task;
    }
    async updateTask(userId, teamId, taskId, data) {
        await this.assertMember(userId, teamId);
        const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
        if (!task) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '任务不存在');
        }
        if (data.title !== undefined)
            task.title = data.title;
        if (data.description !== undefined)
            task.description = data.description;
        if (data.assigneeId !== undefined)
            task.assigneeId = data.assigneeId;
        if (data.priority !== undefined)
            task.priority = data.priority;
        if (data.dueDate !== undefined)
            task.dueDate = data.dueDate;
        if (data.status !== undefined)
            task.status = data.status;
        return this.taskRepo.save(task);
    }
    async deleteTask(userId, teamId, taskId) {
        const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
        if (!task) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '任务不存在');
        }
        const membership = await this.assertMember(userId, teamId);
        const isCreator = task.creatorId === userId;
        const isAdminish = membership.role === 'owner' || membership.role === 'admin';
        if (!isCreator && !isAdminish) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '无权删除该任务');
        }
        await this.taskRepo.delete({ id: taskId });
    }
    async listTeamAgents(userId, teamId) {
        await this.assertMember(userId, teamId);
        return this.agentRepo.find({
            where: { teamId },
            order: { addedAt: 'DESC' },
        });
    }
    async addTeamAgent(userId, teamId, agentId) {
        await this.assertAdmin(userId, teamId);
        const exists = await this.agentRepo.findOne({ where: { teamId, agentId } });
        if (exists) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '该 Agent 已添加到团队');
        }
        const agent = this.agentRepo.create({
            teamId,
            agentId,
            addedBy: userId,
        });
        return this.agentRepo.save(agent);
    }
    async removeTeamAgent(userId, teamId, agentId) {
        await this.assertAdmin(userId, teamId);
        const agent = await this.agentRepo.findOne({ where: { teamId, agentId } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '团队未关联该 Agent');
        }
        await this.agentRepo.delete({ id: agent.id });
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
        if (member.role !== 'owner' && member.role !== 'admin') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '需要管理员权限');
        }
        return member;
    }
    async assertOwner(userId, teamId) {
        const member = await this.assertMember(userId, teamId);
        if (member.role !== 'owner') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '需要团队所有者权限');
        }
        return member;
    }
};
exports.OpcService = OpcService;
exports.OpcService = OpcService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(opc_team_entity_1.OpcTeamEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(opc_team_member_entity_1.OpcTeamMemberEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(opc_task_entity_1.OpcTaskEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(opc_agent_repo_entity_1.OpcAgentRepoEntity)),
    __param(4, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], OpcService);
//# sourceMappingURL=opc.service.js.map