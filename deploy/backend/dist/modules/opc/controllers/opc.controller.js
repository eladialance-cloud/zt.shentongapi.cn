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
exports.OpcController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const opc_service_1 = require("../services/opc.service");
let OpcController = class OpcController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    listTeams(userId, page, pageSize) {
        return this.service.listTeams(userId, page ? Number(page) : 1, pageSize ? Number(pageSize) : 20);
    }
    createTeam(userId, body) {
        return this.service.createTeam(userId, body);
    }
    getTeamDetail(userId, teamId) {
        return this.service.getTeamDetail(userId, Number(teamId));
    }
    updateTeam(userId, teamId, body) {
        return this.service.updateTeam(userId, Number(teamId), body);
    }
    async deleteTeam(userId, teamId) {
        await this.service.deleteTeam(userId, Number(teamId));
        return null;
    }
    listMembers(userId, teamId) {
        return this.service.listMembers(userId, Number(teamId));
    }
    addMember(userId, teamId, body) {
        return this.service.addMember(userId, Number(teamId), Number(body.userId), body.role);
    }
    async removeMember(userId, teamId, targetUserId) {
        await this.service.removeMember(userId, Number(teamId), Number(targetUserId));
        return null;
    }
    updateMemberRole(userId, teamId, targetUserId, body) {
        return this.service.updateMemberRole(userId, Number(teamId), Number(targetUserId), body.role);
    }
    listTasks(userId, teamId, page, pageSize, status) {
        return this.service.listTasks(userId, Number(teamId), page ? Number(page) : 1, pageSize ? Number(pageSize) : 20, status);
    }
    createTask(userId, teamId, body) {
        return this.service.createTask(userId, Number(teamId), {
            title: body.title,
            description: body.description,
            assigneeId: body.assigneeId,
            priority: body.priority,
            dueDate: body.dueDate,
        });
    }
    getTask(userId, teamId, taskId) {
        return this.service.getTask(userId, Number(teamId), Number(taskId));
    }
    updateTask(userId, teamId, taskId, body) {
        return this.service.updateTask(userId, Number(teamId), Number(taskId), body);
    }
    async deleteTask(userId, teamId, taskId) {
        await this.service.deleteTask(userId, Number(teamId), Number(taskId));
        return null;
    }
    listTeamAgents(userId, teamId) {
        return this.service.listTeamAgents(userId, Number(teamId));
    }
    addTeamAgent(userId, teamId, body) {
        return this.service.addTeamAgent(userId, Number(teamId), Number(body.agentId));
    }
    async removeTeamAgent(userId, teamId, agentId) {
        await this.service.removeTeamAgent(userId, Number(teamId), Number(agentId));
        return null;
    }
};
exports.OpcController = OpcController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('teams'),
    (0, swagger_1.ApiOperation)({ summary: '团队列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "listTeams", null);
__decorate([
    (0, common_1.Post)('teams'),
    (0, swagger_1.ApiOperation)({ summary: '创建团队' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "createTeam", null);
__decorate([
    (0, common_1.Get)('teams/:teamId'),
    (0, swagger_1.ApiOperation)({ summary: '团队详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "getTeamDetail", null);
__decorate([
    (0, common_1.Patch)('teams/:teamId'),
    (0, swagger_1.ApiOperation)({ summary: '更新团队' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "updateTeam", null);
__decorate([
    (0, common_1.Delete)('teams/:teamId'),
    (0, swagger_1.ApiOperation)({ summary: '删除团队' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], OpcController.prototype, "deleteTeam", null);
__decorate([
    (0, common_1.Get)('teams/:teamId/members'),
    (0, swagger_1.ApiOperation)({ summary: '团队成员列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "listMembers", null);
__decorate([
    (0, common_1.Post)('teams/:teamId/members'),
    (0, swagger_1.ApiOperation)({ summary: '添加团队成员' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "addMember", null);
__decorate([
    (0, common_1.Delete)('teams/:teamId/members/:userId'),
    (0, swagger_1.ApiOperation)({ summary: '移除团队成员' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", Promise)
], OpcController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Patch)('teams/:teamId/members/:userId'),
    (0, swagger_1.ApiOperation)({ summary: '更新成员角色' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "updateMemberRole", null);
__decorate([
    (0, common_1.Get)('teams/:teamId/tasks'),
    (0, swagger_1.ApiOperation)({ summary: '团队任务列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __param(4, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String, String, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "listTasks", null);
__decorate([
    (0, common_1.Post)('teams/:teamId/tasks'),
    (0, swagger_1.ApiOperation)({ summary: '创建任务' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "createTask", null);
__decorate([
    (0, common_1.Get)('teams/:teamId/tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '任务详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "getTask", null);
__decorate([
    (0, common_1.Patch)('teams/:teamId/tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '更新任务' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('taskId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "updateTask", null);
__decorate([
    (0, common_1.Delete)('teams/:teamId/tasks/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '删除任务' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", Promise)
], OpcController.prototype, "deleteTask", null);
__decorate([
    (0, common_1.Get)('teams/:teamId/agents'),
    (0, swagger_1.ApiOperation)({ summary: '团队 Agent 列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "listTeamAgents", null);
__decorate([
    (0, common_1.Post)('teams/:teamId/agents'),
    (0, swagger_1.ApiOperation)({ summary: '添加团队 Agent' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", void 0)
], OpcController.prototype, "addTeamAgent", null);
__decorate([
    (0, common_1.Delete)('teams/:teamId/agents/:agentId'),
    (0, swagger_1.ApiOperation)({ summary: '移除团队 Agent' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('userId')),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Param)('agentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String]),
    __metadata("design:returntype", Promise)
], OpcController.prototype, "removeTeamAgent", null);
exports.OpcController = OpcController = __decorate([
    (0, swagger_1.ApiTags)('OPC协作'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('opc'),
    __metadata("design:paramtypes", [opc_service_1.OpcService])
], OpcController);
//# sourceMappingURL=opc.controller.js.map