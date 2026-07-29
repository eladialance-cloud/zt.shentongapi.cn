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
var ChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const chat_session_entity_1 = require("../entities/chat-session.entity");
const chat_message_entity_1 = require("../entities/chat-message.entity");
const agent_entity_1 = require("../../agent/entities/agent.entity");
const credits_service_1 = require("../../credits/services/credits.service");
const api_key_pool_service_1 = require("../../api-key-pool/services/api-key-pool.service");
const encryption_service_1 = require("../../../common/services/encryption.service");
const llm_client_service_1 = require("./llm-client.service");
const mcp_service_1 = require("../../mcp/services/mcp.service");
const openclaw_service_1 = require("../../openclaw/services/openclaw.service");
const secret_util_1 = require("../../../common/utils/secret.util");
let ChatService = ChatService_1 = class ChatService {
    sessionRepo;
    messageRepo;
    agentRepo;
    creditsService;
    apiKeyPoolService;
    encryptionService;
    llmClient;
    mcpService;
    openclawService;
    logger = new common_1.Logger(ChatService_1.name);
    constructor(sessionRepo, messageRepo, agentRepo, creditsService, apiKeyPoolService, encryptionService, llmClient, mcpService, openclawService) {
        this.sessionRepo = sessionRepo;
        this.messageRepo = messageRepo;
        this.agentRepo = agentRepo;
        this.creditsService = creditsService;
        this.apiKeyPoolService = apiKeyPoolService;
        this.encryptionService = encryptionService;
        this.llmClient = llmClient;
        this.mcpService = mcpService;
        this.openclawService = openclawService;
    }
    async createSession(userId, agentId, title) {
        let agent = null;
        if (agentId) {
            agent = await this.agentRepo.findOne({
                where: { id: agentId, status: 'published' },
            });
            if (!agent) {
                throw new common_1.NotFoundException('Agent 不存在或未上架');
            }
        }
        const session = this.sessionRepo.create({
            userId,
            agentId: agentId ? String(agentId) : undefined,
            modelId: agent?.modelId || 'gpt-4o-mini',
            title: title || agent?.name || '新会话',
            groupId: 0,
        });
        return this.sessionRepo.save(session);
    }
    async getUserSessions(userId, page = 1, pageSize = 20) {
        const [list, total] = await this.sessionRepo.findAndCount({
            where: { userId },
            order: { updatedAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async getSessionMessages(sessionId, userId, page = 1, pageSize = 50) {
        const session = await this.sessionRepo.findOne({
            where: { id: sessionId, userId },
        });
        if (!session) {
            throw new common_1.NotFoundException('会话不存在');
        }
        const [list, total] = await this.messageRepo.findAndCount({
            where: { sessionId },
            order: { createdAt: 'ASC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async deleteSession(sessionId, userId) {
        const session = await this.sessionRepo.findOne({
            where: { id: sessionId, userId },
        });
        if (!session)
            throw new common_1.NotFoundException('会话不存在');
        await this.messageRepo.delete({ sessionId });
        await this.sessionRepo.delete(sessionId);
    }
    async streamMessage(options, callbacks) {
        const { sessionId, content, userId } = options;
        let errorHandled = false;
        let frozenTxnId = null;
        const handleError = async (error) => {
            if (errorHandled)
                return;
            errorHandled = true;
            try {
                await this.messageRepo.delete({
                    sessionId,
                    role: 'user',
                    content,
                });
            }
            catch {
            }
            if (frozenTxnId) {
                try {
                    await this.creditsService.refundCredits(userId, frozenTxnId);
                }
                catch (err) {
                    this.logger.error(`退款失败: ${err.message}`);
                }
            }
            callbacks.onError(error);
        };
        try {
            const session = await this.sessionRepo.findOne({
                where: { id: sessionId, userId },
            });
            if (!session) {
                throw new common_1.NotFoundException('会话不存在');
            }
            const [agent, apiKeyEntry] = await Promise.all([
                session.agentId
                    ? this.agentRepo.findOne({
                        where: { id: Number(session.agentId) },
                    })
                    : Promise.resolve(null),
                this.apiKeyPoolService.getNextAvailableKey(this.llmClient.getProviderFromModelId(session.modelId)),
            ]);
            if (!apiKeyEntry) {
                throw new common_1.BadRequestException('没有可用的 API Key，请联系管理员');
            }
            const estimatedCost = this.estimateCost(agent);
            const [history] = await Promise.all([
                (async () => {
                    const userMessage = this.messageRepo.create({
                        sessionId,
                        role: 'user',
                        content,
                        attachments: options.attachments,
                    });
                    await this.messageRepo.save(userMessage);
                    return this.getContextMessages(sessionId, 20);
                })(),
                (async () => {
                    if (estimatedCost > 0) {
                        try {
                            const freezeTxn = await this.creditsService.freezeCredits(userId, estimatedCost, 'model_call', `session_${sessionId}`);
                            frozenTxnId = freezeTxn.id;
                        }
                        catch {
                            throw new common_1.ForbiddenException('积分余额不足，请充值');
                        }
                    }
                })(),
            ]);
            if (agent && agent.runtimeType === 'openclaw' && agent.openclawAgentId) {
                this.logger.log(`Agent ${agent.id} 路由到 OpenClaw 运行时: ${agent.openclawAgentId}`);
                try {
                    const openclawResponse = await this.openclawService.invokeAgent(userId, agent.openclawAgentId, content, history.map((m) => ({ role: m.role, content: m.content })));
                    if (openclawResponse instanceof Response) {
                        const reader = openclawResponse.body?.getReader();
                        if (reader) {
                            const decoder = new TextDecoder();
                            let fullResponse = '';
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done)
                                    break;
                                const chunk = decoder.decode(value, { stream: true });
                                fullResponse += chunk;
                                callbacks.onMessage(chunk);
                            }
                            const actualCost = this.estimateCost(agent);
                            try {
                                await this.messageRepo.save({
                                    sessionId,
                                    role: 'assistant',
                                    content: fullResponse,
                                    creditsCost: actualCost,
                                });
                            }
                            catch (err) {
                                this.logger.error(`保存 AI 消息失败: ${err.message}`);
                            }
                            if (frozenTxnId && actualCost > 0) {
                                try {
                                    await this.creditsService.settleCredits(userId, frozenTxnId, actualCost);
                                }
                                catch (err) {
                                    this.logger.error(`积分结算失败: ${err.message}`);
                                }
                            }
                            else if (frozenTxnId && actualCost === 0) {
                                try {
                                    await this.creditsService.refundCredits(userId, frozenTxnId);
                                }
                                catch (err) {
                                    this.logger.error(`退款失败: ${err.message}`);
                                }
                            }
                            try {
                                await this.agentRepo.increment({ id: agent.id }, 'callCount', 1);
                            }
                            catch (err) {
                                this.logger.error(`Agent调用次数更新失败: ${err.message}`);
                            }
                            callbacks.onDone({ input: 0, output: 0, total: 0 });
                        }
                        else {
                            throw new Error('OpenClaw 响应无可读流');
                        }
                    }
                    else {
                        const fullResponse = JSON.stringify(openclawResponse);
                        callbacks.onMessage(fullResponse);
                        await this.messageRepo.save({
                            sessionId,
                            role: 'assistant',
                            content: fullResponse,
                            creditsCost: this.estimateCost(agent),
                        });
                        if (frozenTxnId) {
                            try {
                                await this.creditsService.settleCredits(userId, frozenTxnId, this.estimateCost(agent));
                            }
                            catch (err) {
                                this.logger.error(`积分结算失败: ${err.message}`);
                            }
                        }
                        callbacks.onDone({ input: 0, output: 0, total: 0 });
                    }
                    await this.sessionRepo.update(sessionId, { updatedAt: new Date() });
                    return;
                }
                catch (err) {
                    this.logger.error(`OpenClaw 调用失败: ${err.message}`);
                    await handleError(err);
                    return;
                }
            }
            if (agent && (agent.runtimeType === 'hermes' || agent.runtimeType === 'hybrid')) {
                this.logger.log(`Agent ${agent.id} 路由到 Hermes 运行时`);
            }
            let decryptedKey = '';
            try {
                decryptedKey = this.encryptionService.decryptAes(apiKeyEntry.apiKey);
            }
            catch (err) {
                this.logger.error(`API Key 解密失败: ${err.message}`);
                if (frozenTxnId) {
                    await this.creditsService.refundCredits(userId, frozenTxnId);
                }
                throw new common_1.BadRequestException('API Key 解密失败');
            }
            try {
                this.logger.debug(`调用 LLM 流式接口: model=${session.modelId}, agentId=${agent?.id ?? 'none'}, key=${(0, secret_util_1.maskApiKey)(decryptedKey)}`);
                let openaiTools = [];
                let toolServerMap = {};
                try {
                    const mcpServers = await this.mcpService.listServers(userId);
                    const enabledServers = mcpServers.filter((s) => s.enabled);
                    for (const server of enabledServers) {
                        try {
                            const tools = await this.mcpService.listTools(userId, String(server.id));
                            for (const t of tools) {
                                const toolName = t.name;
                                const namespacedName = `${server.name}__${toolName}`;
                                openaiTools.push({
                                    type: 'function',
                                    function: {
                                        name: namespacedName,
                                        description: t.description || toolName,
                                        parameters: t.inputSchema || { type: 'object', properties: {} },
                                    },
                                });
                                toolServerMap[namespacedName] = String(server.id);
                            }
                        }
                        catch {
                        }
                    }
                    if (openaiTools.length > 0) {
                        this.logger.debug(`已加载 ${openaiTools.length} 个 MCP 工具`);
                    }
                }
                catch {
                    this.logger.warn('MCP 工具加载失败，将进行纯文本对话');
                }
                await this.llmClient.streamChat({
                    model: session.modelId,
                    apiKey: decryptedKey,
                    systemPrompt: agent?.systemPrompt || '你是一个有帮助的AI助手。',
                    messages: history.map((m) => ({ role: m.role, content: m.content })),
                    tools: openaiTools.length > 0 ? openaiTools : undefined,
                    toolExecutor: openaiTools.length > 0
                        ? async (toolName, args) => {
                            const sepIdx = toolName.indexOf('__');
                            if (sepIdx === -1) {
                                throw new Error(`工具名格式错误: ${toolName}`);
                            }
                            const serverId = toolServerMap[toolName];
                            const realToolName = toolName.slice(sepIdx + 2);
                            if (!serverId) {
                                throw new Error(`未找到工具对应的服务器: ${toolName}`);
                            }
                            this.logger.debug(`执行 MCP 工具: ${realToolName} on server ${serverId}`);
                            return this.mcpService.callTool(userId, {
                                serverId,
                                toolName: realToolName,
                                args,
                            });
                        }
                        : undefined,
                }, {
                    onMessage: (chunk) => callbacks.onMessage(chunk),
                    onDone: async (usage, fullResponse) => {
                        const actualCost = this.calculateActualCost(agent, usage);
                        try {
                            await this.messageRepo.save({
                                sessionId,
                                role: 'assistant',
                                content: fullResponse,
                                tokenUsage: usage,
                                creditsCost: actualCost,
                            });
                        }
                        catch (err) {
                            this.logger.error(`保存 AI 消息失败: ${err.message}`);
                            if (frozenTxnId) {
                                try {
                                    await this.creditsService.refundCredits(userId, frozenTxnId);
                                    this.logger.log(`消息保存失败，已退回冻结积分 txnId=${frozenTxnId}`);
                                }
                                catch (refundErr) {
                                    this.logger.error(`退回冻结积分失败: ${refundErr.message}`);
                                }
                            }
                            return;
                        }
                        if (frozenTxnId && actualCost > 0) {
                            try {
                                await this.creditsService.settleCredits(userId, frozenTxnId, actualCost);
                            }
                            catch (err) {
                                this.logger.error(`积分结算失败: ${err.message}, frozenTxnId=${frozenTxnId}, userId=${userId}`);
                            }
                        }
                        else if (frozenTxnId && actualCost === 0) {
                            try {
                                await this.creditsService.refundCredits(userId, frozenTxnId);
                            }
                            catch (err) {
                                this.logger.error(`退款失败: ${err.message}, frozenTxnId=${frozenTxnId}`);
                            }
                        }
                        try {
                            await this.apiKeyPoolService.deductQuota(apiKeyEntry.id, usage.total);
                        }
                        catch (err) {
                            this.logger.error(`API Key 配额扣减失败: ${err.message}, keyId=${apiKeyEntry.id}`);
                        }
                        if (agent) {
                            try {
                                await this.agentRepo.increment({ id: agent.id }, 'callCount', 1);
                            }
                            catch (err) {
                                this.logger.error(`Agent调用次数更新失败: ${err.message}, agentId=${agent.id}`);
                            }
                        }
                        callbacks.onDone(usage);
                    },
                    onError: async (error) => {
                        await handleError(error);
                    },
                });
            }
            finally {
                decryptedKey = '';
            }
            await this.sessionRepo.update(sessionId, { updatedAt: new Date() });
        }
        catch (err) {
            await handleError(err);
        }
    }
    estimateCost(agent) {
        if (!agent)
            return 5;
        return agent.pricePerCall || 5;
    }
    calculateActualCost(agent, usage) {
        if (!agent)
            return 5;
        if (agent.pricePerCall > 0)
            return agent.pricePerCall;
        if (agent.pricePerToken) {
            const inputCost = Math.ceil(usage.input * agent.pricePerToken.input);
            const outputCost = Math.ceil(usage.output * agent.pricePerToken.output);
            return inputCost + outputCost;
        }
        return 5;
    }
    async getContextMessages(sessionId, limit) {
        const msgs = await this.messageRepo.find({
            where: { sessionId },
            order: { createdAt: 'DESC' },
            take: limit,
        });
        return msgs
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .reverse();
    }
    health() {
        return { status: 'ok', module: 'chat' };
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = ChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chat_session_entity_1.ChatSessionEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chat_message_entity_1.ChatMessageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(agent_entity_1.AgentEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        credits_service_1.CreditsService,
        api_key_pool_service_1.ApiKeyPoolService,
        encryption_service_1.EncryptionService,
        llm_client_service_1.LlmClientService,
        mcp_service_1.McpService,
        openclaw_service_1.OpenClawService])
], ChatService);
//# sourceMappingURL=chat.service.js.map