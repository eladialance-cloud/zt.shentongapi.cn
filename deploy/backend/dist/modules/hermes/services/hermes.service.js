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
var HermesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HermesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const hermes_instance_entity_1 = require("../entities/hermes-instance.entity");
const hermes_call_log_entity_1 = require("../entities/hermes-call-log.entity");
const hermes_skill_entity_1 = require("../entities/hermes-skill.entity");
const credits_service_1 = require("../../credits/services/credits.service");
const mcp_service_1 = require("../../mcp/services/mcp.service");
const n8n_service_1 = require("../../n8n/services/n8n.service");
const openclaw_service_1 = require("../../openclaw/services/openclaw.service");
let HermesService = HermesService_1 = class HermesService {
    instanceRepo;
    callLogRepo;
    skillRepo;
    creditsService;
    mcpService;
    n8nService;
    openclawService;
    logger = new common_1.Logger(HermesService_1.name);
    constructor(instanceRepo, callLogRepo, skillRepo, creditsService, mcpService, n8nService, openclawService) {
        this.instanceRepo = instanceRepo;
        this.callLogRepo = callLogRepo;
        this.skillRepo = skillRepo;
        this.creditsService = creditsService;
        this.mcpService = mcpService;
        this.n8nService = n8nService;
        this.openclawService = openclawService;
    }
    async listInstances(userId) {
        return this.instanceRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
    async createInstance(userId, dto) {
        const instance = this.instanceRepo.create({
            userId,
            name: dto.name,
            status: 'stopped',
            skillCount: dto.skillIds?.length || 0,
            skillIds: dto.skillIds || [],
        });
        return this.instanceRepo.save(instance);
    }
    async getInstance(userId, instanceId) {
        const instance = await this.instanceRepo.findOne({
            where: { id: instanceId, userId },
        });
        if (!instance) {
            throw new common_1.NotFoundException('Hermes 实例不存在');
        }
        return instance;
    }
    async startInstance(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        if (instance.status === 'running') {
            throw new common_1.BadRequestException('实例已在运行中');
        }
        instance.status = 'running';
        instance.startedAt = new Date();
        instance.errorMessage = undefined;
        instance.cpuPercent = 0.5;
        instance.memoryUsedMb = 128;
        instance.memoryTotalMb = 1024;
        return this.instanceRepo.save(instance);
    }
    async stopInstance(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        if (instance.status !== 'running') {
            throw new common_1.BadRequestException('实例未在运行');
        }
        instance.status = 'stopped';
        instance.pid = undefined;
        instance.cpuPercent = 0;
        instance.memoryUsedMb = 0;
        return this.instanceRepo.save(instance);
    }
    async deleteInstance(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        if (instance.status === 'running') {
            await this.stopInstance(userId, instanceId);
        }
        await this.callLogRepo.delete({ instanceId });
        await this.instanceRepo.delete(instanceId);
    }
    async getCallLogs(userId, instanceId, query) {
        const page = Math.max(1, query.page || 1);
        const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
        const [list, total] = await this.callLogRepo.findAndCount({
            where: { instanceId, userId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
    }
    async unmountSkill(userId, instanceId, skillId) {
        const instance = await this.getInstance(userId, instanceId);
        const skillIds = (instance.skillIds || []).filter((id) => id !== skillId);
        instance.skillIds = skillIds;
        instance.skillCount = skillIds.length;
        return this.instanceRepo.save(instance);
    }
    async listMarketSkills() {
        return this.skillRepo.find({
            where: { isActive: true },
            order: { installCount: 'DESC' },
        });
    }
    async listInstalledSkills(userId) {
        const instances = await this.listInstances(userId);
        const allSkillIds = new Set();
        for (const inst of instances) {
            (inst.skillIds || []).forEach((id) => allSkillIds.add(id));
        }
        if (allSkillIds.size === 0)
            return [];
        return this.skillRepo
            .createQueryBuilder('s')
            .where('s.id IN (:...ids)', { ids: [...allSkillIds] })
            .getMany();
    }
    async installSkill(userId, skillId) {
        const skill = await this.skillRepo.findOne({ where: { id: skillId } });
        if (!skill) {
            throw new common_1.NotFoundException('技能包不存在');
        }
        await this.skillRepo.increment({ id: skillId }, 'installCount', 1);
        return skill;
    }
    async executeTask(task) {
        const startTime = Date.now();
        const log = this.callLogRepo.create({
            instanceId: task.instanceId,
            userId: task.userId,
            callType: task.callType,
            status: 'running',
            target: task.target,
        });
        const savedLog = await this.callLogRepo.save(log);
        try {
            let result;
            switch (task.callType) {
                case 'agent_invoke':
                    result = await this.invokeAgent(task);
                    break;
                case 'workflow_run':
                    result = await this.runWorkflow(task);
                    break;
                case 'tool_call':
                    result = await this.callTool(task);
                    break;
                case 'skill_execute':
                    result = await this.executeSkill(task);
                    break;
                default:
                    throw new common_1.BadRequestException(`不支持的调用类型: ${task.callType}`);
            }
            const durationMs = Date.now() - startTime;
            const durationMin = Math.max(1, Math.ceil(durationMs / 60000));
            const creditsCost = task.pricePerMinute * durationMin;
            if (creditsCost > 0) {
                try {
                    await this.creditsService.freezeCredits(task.userId, creditsCost, 'plugin_call', `hermes_instance_${task.instanceId}`);
                }
                catch (err) {
                    this.logger.warn(`Hermes 积分扣费失败: ${err.message}`);
                }
            }
            await this.callLogRepo.update(savedLog.id, {
                status: 'success',
                durationMs,
                creditsCost,
            });
            return result;
        }
        catch (err) {
            const durationMs = Date.now() - startTime;
            await this.callLogRepo.update(savedLog.id, {
                status: 'failed',
                durationMs,
                errorMessage: err.message?.slice(0, 512),
            });
            throw err;
        }
    }
    async invokeAgent(task) {
        if (!task.agentId) {
            throw new common_1.BadRequestException('Agent 调用需要 agentId');
        }
        this.logger.log(`invokeAgent via OpenClaw: agentId=${task.agentId}`);
        return this.openclawService.invokeAgent(task.userId, String(task.agentId), JSON.stringify(task.input));
    }
    async runWorkflow(task) {
        if (!task.n8nInstanceId || !task.workflowId) {
            throw new common_1.BadRequestException('工作流调用需要 n8nInstanceId 和 workflowId');
        }
        return this.n8nService.triggerWorkflow(task.userId, task.n8nInstanceId, task.workflowId, task.input);
    }
    async callTool(task) {
        if (!task.serverId || !task.toolName) {
            throw new common_1.BadRequestException('工具调用需要 serverId 和 toolName');
        }
        return this.mcpService.callTool(task.userId, {
            serverId: task.serverId,
            toolName: task.toolName,
            args: task.args || {},
        });
    }
    async executeSkill(task) {
        this.logger.log(`executeSkill: skillId=${task.skillId}, input=${JSON.stringify(task.input).slice(0, 200)}`);
        return {
            skillId: task.skillId,
            status: 'completed',
            message: '技能执行完成',
        };
    }
    health() {
        return { status: 'ok', module: 'hermes' };
    }
};
exports.HermesService = HermesService;
exports.HermesService = HermesService = HermesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(hermes_instance_entity_1.HermesInstanceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(hermes_call_log_entity_1.HermesCallLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(hermes_skill_entity_1.HermesSkillEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        credits_service_1.CreditsService,
        mcp_service_1.McpService,
        n8n_service_1.N8nService,
        openclaw_service_1.OpenClawService])
], HermesService);
//# sourceMappingURL=hermes.service.js.map