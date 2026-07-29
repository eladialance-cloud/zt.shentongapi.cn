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
var N8nService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const n8n_instance_entity_1 = require("../entities/n8n-instance.entity");
const n8n_workflow_entity_1 = require("../entities/n8n-workflow.entity");
const redis_service_1 = require("../../../common/services/redis.service");
const encryption_service_1 = require("../../../common/services/encryption.service");
const WORKFLOW_CACHE_TTL = 120;
const WORKFLOW_CACHE_KEY = (instanceId) => `n8n:workflows:${instanceId}`;
let N8nService = N8nService_1 = class N8nService {
    instanceRepo;
    workflowRepo;
    redisService;
    encryptionService;
    logger = new common_1.Logger(N8nService_1.name);
    constructor(instanceRepo, workflowRepo, redisService, encryptionService) {
        this.instanceRepo = instanceRepo;
        this.workflowRepo = workflowRepo;
        this.redisService = redisService;
        this.encryptionService = encryptionService;
    }
    health() {
        return {
            status: 'ok',
            module: 'n8n',
        };
    }
    async listInstances(userId) {
        return this.instanceRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
    async getInstance(userId, instanceId) {
        const instance = await this.instanceRepo.findOne({
            where: { id: instanceId, userId },
        });
        if (!instance) {
            throw new common_1.HttpException('N8N 实例不存在或无权访问', common_1.HttpStatus.NOT_FOUND);
        }
        return instance;
    }
    async createInstance(userId, data) {
        const encryptedKey = data.apiKey
            ? this.encryptionService.encryptAes(data.apiKey)
            : '';
        const instance = this.instanceRepo.create({
            userId,
            name: data.name,
            description: data.description,
            baseUrl: data.baseUrl,
            apiKey: encryptedKey,
            status: 'pending',
            webhookUrl: data.webhookUrl,
            config: data.config,
        });
        return this.instanceRepo.save(instance);
    }
    async updateInstance(userId, instanceId, data) {
        const instance = await this.getInstance(userId, instanceId);
        if (data.name !== undefined)
            instance.name = data.name;
        if (data.description !== undefined)
            instance.description = data.description;
        if (data.baseUrl !== undefined)
            instance.baseUrl = data.baseUrl;
        if (data.apiKey !== undefined)
            instance.apiKey = this.encryptionService.encryptAes(data.apiKey);
        if (data.status !== undefined)
            instance.status = data.status;
        if (data.webhookUrl !== undefined)
            instance.webhookUrl = data.webhookUrl;
        if (data.config !== undefined)
            instance.config = data.config;
        await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        return this.instanceRepo.save(instance);
    }
    async deleteInstance(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        await this.workflowRepo.delete({ instanceId, userId });
        await this.instanceRepo.remove(instance);
    }
    buildHeaders(apiKey) {
        return {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json',
        };
    }
    normalizeBaseUrl(baseUrl) {
        return baseUrl.replace(/\/+$/, '');
    }
    async callN8nApi(instance, method, path, body) {
        const url = `${this.normalizeBaseUrl(instance.baseUrl)}/api/v1${path}`;
        this.logger.log(`N8N API ${method} ${url}`);
        const apiKey = this.encryptionService.decryptAes(instance.apiKey);
        try {
            const response = await fetch(url, {
                method,
                headers: this.buildHeaders(apiKey),
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                this.logger.error(`N8N API error: ${response.status} ${response.statusText} - ${errorText}`);
                throw new common_1.HttpException(`N8N API 调用失败: ${response.status} ${response.statusText}`, response.status >= 400 && response.status < 500
                    ? common_1.HttpStatus.BAD_REQUEST
                    : common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
            const text = await response.text();
            if (!text || text.trim().length === 0) {
                return undefined;
            }
            return JSON.parse(text);
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            this.logger.error(`N8N API request failed: ${String(error)}`);
            throw new common_1.HttpException(`N8N API 请求失败: ${String(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async testConnection(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        try {
            const result = await this.callN8nApi(instance, 'GET', '/workflows');
            instance.status = 'running';
            instance.lastStartedAt = new Date();
            await this.instanceRepo.save(instance);
            const workflowCount = result?.count ?? result?.data?.length ?? 0;
            return {
                success: true,
                message: `连接成功，共 ${workflowCount} 个工作流`,
                workflows: workflowCount,
            };
        }
        catch (error) {
            instance.status = 'error';
            await this.instanceRepo.save(instance);
            throw error;
        }
    }
    async listWorkflows(userId, instanceId) {
        const instance = await this.getInstance(userId, instanceId);
        const cacheKey = WORKFLOW_CACHE_KEY(instanceId);
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
                this.logger.warn(`Failed to parse cached workflows for instance ${instanceId}`);
            }
        }
        const result = await this.callN8nApi(instance, 'GET', '/workflows');
        const workflowList = result?.data ?? [];
        const entities = [];
        for (const wf of workflowList) {
            let local = await this.workflowRepo.findOne({
                where: { instanceId, userId, workflowId: wf.id },
            });
            if (!local) {
                local = this.workflowRepo.create({
                    instanceId,
                    userId,
                    workflowId: wf.id,
                    name: wf.name,
                    active: wf.active,
                    nodes: wf.nodes,
                    connections: wf.connections,
                    tags: wf.tags,
                    lastExecutionStatus: 'unknown',
                });
            }
            else {
                local.name = wf.name;
                local.active = wf.active;
                local.nodes = wf.nodes;
                local.connections = wf.connections;
                local.tags = wf.tags;
            }
            entities.push(await this.workflowRepo.save(local));
        }
        await this.redisService.set(cacheKey, JSON.stringify(entities), WORKFLOW_CACHE_TTL);
        return entities;
    }
    async getWorkflowDetail(userId, instanceId, workflowId) {
        const instance = await this.getInstance(userId, instanceId);
        return this.callN8nApi(instance, 'GET', `/workflows/${workflowId}`);
    }
    async triggerWorkflow(userId, instanceId, workflowId, inputData) {
        const instance = await this.getInstance(userId, instanceId);
        const body = inputData ? { inputData } : {};
        const result = await this.callN8nApi(instance, 'POST', `/workflows/${workflowId}/execute`, body);
        const executionId = result?.executionId ?? result?.id ?? '';
        if (!executionId) {
            this.logger.warn(`N8N execute response missing executionId: ${JSON.stringify(result)}`);
        }
        await this.workflowRepo.update({ instanceId, userId, workflowId }, {
            lastExecutedAt: new Date(),
            lastExecutionStatus: 'running',
        });
        await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        return {
            executionId: String(executionId),
            message: '工作流已触发',
        };
    }
    async getExecutionStatus(userId, instanceId, executionId) {
        const instance = await this.getInstance(userId, instanceId);
        return this.callN8nApi(instance, 'GET', `/executions/${executionId}`);
    }
    async activateWorkflow(userId, instanceId, workflowId) {
        const instance = await this.getInstance(userId, instanceId);
        await this.callN8nApi(instance, 'POST', `/workflows/${workflowId}/activate`);
        await this.workflowRepo.update({ instanceId, userId, workflowId }, { active: true });
        await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        return {
            success: true,
            message: '工作流已激活',
        };
    }
    async deactivateWorkflow(userId, instanceId, workflowId) {
        const instance = await this.getInstance(userId, instanceId);
        await this.callN8nApi(instance, 'POST', `/workflows/${workflowId}/deactivate`);
        await this.workflowRepo.update({ instanceId, userId, workflowId }, { active: false });
        await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        return {
            success: true,
            message: '工作流已停用',
        };
    }
    async handleWebhook(instanceId, workflowId, body, signature) {
        this.logger.log(`收到 N8N Webhook 回调: instanceId=${instanceId}, workflowId=${workflowId}`);
        const instance = await this.instanceRepo.findOne({
            where: { id: instanceId },
        });
        if (!instance) {
            this.logger.warn(`Webhook 回调: 实例 ${instanceId} 不存在`);
            return { received: false, status: 'instance_not_found' };
        }
        const workflow = await this.workflowRepo.findOne({
            where: { instanceId, workflowId },
        });
        if (workflow) {
            const bodyObj = body;
            const success = bodyObj?.success !== false;
            await this.workflowRepo.update(workflow.id, {
                lastExecutionStatus: success ? 'success' : 'error',
                lastExecutedAt: new Date(),
            });
            await this.redisService.del(WORKFLOW_CACHE_KEY(instanceId));
        }
        this.logger.log(`N8N Webhook 处理完成: instanceId=${instanceId}, workflowId=${workflowId}`);
        return { received: true, status: 'processed' };
    }
};
exports.N8nService = N8nService;
exports.N8nService = N8nService = N8nService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(n8n_instance_entity_1.N8nInstanceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(n8n_workflow_entity_1.N8nWorkflowEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        encryption_service_1.EncryptionService])
], N8nService);
//# sourceMappingURL=n8n.service.js.map