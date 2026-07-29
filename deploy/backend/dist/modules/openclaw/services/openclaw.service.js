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
var OpenClawService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const openclaw_instance_entity_1 = require("../entities/openclaw-instance.entity");
const agent_entity_1 = require("../../agent/entities/agent.entity");
const config_1 = require("@nestjs/config");
const credits_service_1 = require("../../credits/services/credits.service");
let OpenClawService = OpenClawService_1 = class OpenClawService {
    instanceRepo;
    agentRepo;
    configService;
    creditsService;
    logger = new common_1.Logger(OpenClawService_1.name);
    constructor(instanceRepo, agentRepo, configService, creditsService) {
        this.instanceRepo = instanceRepo;
        this.agentRepo = agentRepo;
        this.configService = configService;
        this.creditsService = creditsService;
    }
    async listInstances(userId) {
        return this.instanceRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
    async registerInstance(userId, dto) {
        const existing = await this.instanceRepo.findOne({
            where: { openclawAgentId: dto.openclawAgentId },
        });
        if (existing) {
            throw new common_1.BadRequestException('该 OpenClaw Agent 已注册');
        }
        const instance = this.instanceRepo.create({
            userId,
            agentId: dto.agentId,
            openclawAgentId: dto.openclawAgentId,
            endpoint: dto.endpoint || 'http://localhost:8080',
            status: 'offline',
            config: dto.config,
        });
        const saved = await this.instanceRepo.save(instance);
        if (dto.agentId) {
            await this.agentRepo.update(dto.agentId, {
                openclawAgentId: dto.openclawAgentId,
                syncStatus: 'pending',
            });
        }
        return saved;
    }
    async deleteInstance(userId, id) {
        const instance = await this.getInstance(userId, id);
        await this.instanceRepo.delete(id);
        if (instance.agentId) {
            await this.agentRepo.update(instance.agentId, {
                openclawAgentId: undefined,
                syncStatus: 'pending',
            });
        }
    }
    async getInstance(userId, id) {
        const instance = await this.instanceRepo.findOne({
            where: { id, userId },
        });
        if (!instance) {
            throw new common_1.NotFoundException('OpenClaw 实例不存在');
        }
        return instance;
    }
    async syncAgent(userId, id) {
        const instance = await this.getInstance(userId, id);
        if (!instance.agentId) {
            throw new common_1.BadRequestException('该实例未关联 Agent');
        }
        const agent = await this.agentRepo.findOne({
            where: { id: instance.agentId },
        });
        if (!agent) {
            throw new common_1.NotFoundException('关联的 Agent 不存在');
        }
        try {
            const response = await fetch(`${instance.endpoint}/api/agents/${instance.openclawAgentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: agent.name,
                    systemPrompt: agent.systemPrompt,
                    model: agent.modelId,
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`OpenClaw API error ${response.status}: ${errorText}`);
            }
            await this.agentRepo.update(agent.id, {
                syncStatus: 'synced',
                syncError: undefined,
            });
            await this.instanceRepo.update(id, {
                status: 'online',
                lastHeartbeatAt: new Date(),
            });
            return { success: true, message: '同步成功' };
        }
        catch (err) {
            const errorMsg = err.message?.slice(0, 512) || '同步失败';
            await this.agentRepo.update(agent.id, {
                syncStatus: 'failed',
                syncError: errorMsg,
            });
            await this.instanceRepo.update(id, { status: 'error' });
            this.logger.error(`同步 Agent 到 OpenClaw 失败: ${errorMsg}`);
            return { success: false, message: errorMsg };
        }
    }
    async getStatus(userId, id) {
        const instance = await this.getInstance(userId, id);
        try {
            const response = await fetch(`${instance.endpoint}/api/health`, {
                signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
                await this.instanceRepo.update(id, {
                    status: 'online',
                    lastHeartbeatAt: new Date(),
                });
                return {
                    status: 'online',
                    endpoint: instance.endpoint,
                    lastHeartbeatAt: new Date(),
                };
            }
        }
        catch {
        }
        return {
            status: instance.status,
            endpoint: instance.endpoint,
            lastHeartbeatAt: instance.lastHeartbeatAt,
        };
    }
    async healthCheck() {
        const defaultEndpoint = this.configService.get('OPENCLAW_ENDPOINT', 'http://localhost:8080');
        try {
            const response = await fetch(`${defaultEndpoint}/api/health`, {
                signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
                return { status: 'online', endpoint: defaultEndpoint };
            }
            return { status: 'offline', endpoint: defaultEndpoint };
        }
        catch {
            return { status: 'offline', endpoint: defaultEndpoint };
        }
    }
    async updateConfig(userId, id, dto) {
        const instance = await this.getInstance(userId, id);
        if (dto.endpoint !== undefined)
            instance.endpoint = dto.endpoint;
        if (dto.config !== undefined)
            instance.config = dto.config;
        return this.instanceRepo.save(instance);
    }
    async invokeAgent(userId, openclawAgentId, message, history) {
        const instance = await this.instanceRepo.findOne({
            where: { openclawAgentId },
        });
        if (!instance) {
            throw new common_1.NotFoundException(`OpenClaw Agent ${openclawAgentId} 未注册`);
        }
        const estimatedCost = 10;
        let frozenTxnId = null;
        try {
            const freezeTxn = await this.creditsService.freezeCredits(userId, estimatedCost, 'model_call', `openclaw_${openclawAgentId}`);
            frozenTxnId = freezeTxn.id;
        }
        catch {
            throw new common_1.BadRequestException('积分余额不足，请充值');
        }
        try {
            const response = await fetch(`${instance.endpoint}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: openclawAgentId,
                    message,
                    history: history || [],
                }),
                signal: AbortSignal.timeout(120000),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`OpenClaw chat API error ${response.status}: ${errorText}`);
            }
            if (frozenTxnId) {
                try {
                    await this.creditsService.settleCredits(userId, frozenTxnId, estimatedCost);
                }
                catch (err) {
                    this.logger.error(`OpenClaw 积分结算失败: ${err.message}`);
                }
            }
            return response;
        }
        catch (err) {
            if (frozenTxnId) {
                try {
                    await this.creditsService.refundCredits(userId, frozenTxnId);
                }
                catch (refundErr) {
                    this.logger.error(`OpenClaw 积分退款失败: ${refundErr.message}`);
                }
            }
            throw err;
        }
    }
    health() {
        return { status: 'ok', module: 'openclaw' };
    }
};
exports.OpenClawService = OpenClawService;
exports.OpenClawService = OpenClawService = OpenClawService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(openclaw_instance_entity_1.OpenClawInstanceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(agent_entity_1.AgentEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        config_1.ConfigService,
        credits_service_1.CreditsService])
], OpenClawService);
//# sourceMappingURL=openclaw.service.js.map