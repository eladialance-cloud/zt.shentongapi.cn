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
var McpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const child_process_1 = require("child_process");
const mcp_server_entity_1 = require("../entities/mcp-server.entity");
const redis_service_1 = require("../../../common/services/redis.service");
let McpService = class McpService {
    static { McpService_1 = this; }
    serverRepo;
    redis;
    logger = new common_1.Logger(McpService_1.name);
    static TOOLS_CACHE_TTL = 300;
    static STDIO_TIMEOUT = 15000;
    static HTTP_TIMEOUT = 10000;
    constructor(serverRepo, redis) {
        this.serverRepo = serverRepo;
        this.redis = redis;
    }
    health() {
        return { status: 'ok', module: 'mcp' };
    }
    async listServers(userId) {
        return this.serverRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
    async createServer(userId, data) {
        if (!data.name) {
            throw new common_1.HttpException('名称不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!data.transportType) {
            throw new common_1.HttpException('传输类型不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        this.validateTransportFields(data);
        const server = this.serverRepo.create({
            ...data,
            userId,
            status: 'pending',
            toolCount: 0,
        });
        const saved = await this.serverRepo.save(server);
        this.logger.log(`用户 ${userId} 创建 MCP Server: ${saved.name}(${saved.id})`);
        return saved;
    }
    async updateServer(userId, serverId, data) {
        const server = await this.findUserServer(userId, serverId);
        if (data.transportType || data.command || data.url) {
            this.validateTransportFields({ ...server, ...data });
        }
        await this.serverRepo.update(server.id, data);
        await this.redis.del(this.getToolsCacheKey(server.id));
        if (data.transportType || data.command || data.url || data.args) {
            await this.serverRepo.update(server.id, { status: 'pending' });
        }
        const updated = await this.serverRepo.findOne({ where: { id: server.id } });
        if (!updated) {
            throw new common_1.HttpException('更新后服务器不存在', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return updated;
    }
    async deleteServer(userId, serverId) {
        const server = await this.findUserServer(userId, serverId);
        await this.serverRepo.delete(server.id);
        await this.redis.del(this.getToolsCacheKey(server.id));
        this.logger.log(`用户 ${userId} 删除 MCP Server: ${server.name}(${server.id})`);
    }
    async listTools(userId, serverId) {
        const server = await this.findUserServer(userId, serverId);
        if (!server.enabled) {
            throw new common_1.HttpException('MCP Server 已禁用', common_1.HttpStatus.BAD_REQUEST);
        }
        const cacheKey = this.getToolsCacheKey(server.id);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
            }
        }
        const tools = await this.fetchToolsList(server);
        await this.redis.set(cacheKey, JSON.stringify(tools), McpService_1.TOOLS_CACHE_TTL);
        return tools;
    }
    async callTool(userId, data) {
        const server = await this.findUserServer(userId, data.serverId);
        if (!server.enabled) {
            throw new common_1.HttpException('MCP Server 已禁用', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!data.toolName) {
            throw new common_1.HttpException('工具名称不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const result = await this.invokeTool(server, data.toolName, data.args || {});
        return result;
    }
    async probeServer(userId, serverId) {
        const server = await this.findUserServer(userId, serverId);
        await this.redis.del(this.getToolsCacheKey(server.id));
        try {
            const tools = await this.fetchToolsList(server);
            await this.serverRepo.update(server.id, {
                status: 'connected',
                lastConnectedAt: new Date(),
                toolCount: Array.isArray(tools) ? tools.length : 0,
            });
            await this.redis.set(this.getToolsCacheKey(server.id), JSON.stringify(tools), McpService_1.TOOLS_CACHE_TTL);
            return {
                status: 'connected',
                toolCount: Array.isArray(tools) ? tools.length : 0,
                tools,
            };
        }
        catch (err) {
            await this.serverRepo.update(server.id, { status: 'failed' });
            throw new common_1.HttpException(`连接失败: ${err instanceof Error ? err.message : String(err)}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    async findUserServer(userId, serverId) {
        const id = Number(serverId);
        if (Number.isNaN(id)) {
            throw new common_1.HttpException('无效的 Server ID', common_1.HttpStatus.BAD_REQUEST);
        }
        const server = await this.serverRepo.findOne({
            where: { id, userId },
        });
        if (!server) {
            throw new common_1.HttpException('MCP Server 不存在', common_1.HttpStatus.NOT_FOUND);
        }
        return server;
    }
    validateTransportFields(data) {
        const transportType = data.transportType;
        if (transportType === 'stdio') {
            if (!data.command) {
                throw new common_1.HttpException('stdio 模式需要提供 command 字段', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        else if (transportType === 'http' || transportType === 'streamable-http') {
            if (!data.url) {
                throw new common_1.HttpException(`${transportType} 模式需要提供 url 字段`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
    }
    getToolsCacheKey(serverId) {
        return `mcp:tools:${serverId}`;
    }
    async fetchToolsList(server) {
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
        };
        const response = await this.sendMcpRequest(server, request);
        if (response.error) {
            throw new Error(`MCP tools/list 错误: ${response.error.message}`);
        }
        const result = response.result;
        return result?.tools ?? [];
    }
    async invokeTool(server, toolName, args) {
        const request = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: toolName, arguments: args },
        };
        const response = await this.sendMcpRequest(server, request);
        if (response.error) {
            throw new common_1.HttpException(`MCP tools/call 错误: ${response.error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
        return response.result;
    }
    async sendMcpRequest(server, request) {
        switch (server.transportType) {
            case 'stdio':
                return this.sendStdioRequest(server, request);
            case 'http':
            case 'streamable-http':
                return this.sendHttpRequest(server, request);
            default:
                throw new Error(`不支持的传输类型: ${server.transportType}`);
        }
    }
    async sendStdioRequest(server, request) {
        if (!server.command) {
            throw new Error('stdio 模式缺少 command 配置');
        }
        const args = server.args ?? [];
        const env = { ...process.env, ...(server.env ?? {}) };
        return new Promise((resolve, reject) => {
            let child;
            try {
                child = (0, child_process_1.spawn)(server.command, args, {
                    env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            }
            catch (err) {
                reject(new Error(`启动子进程失败: ${err instanceof Error ? err.message : String(err)}`));
                return;
            }
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`stdio 通信超时 (${McpService_1.STDIO_TIMEOUT}ms)`));
            }, McpService_1.STDIO_TIMEOUT);
            let stdoutBuffer = '';
            let stderrBuffer = '';
            child.stdout?.on('data', (data) => {
                stdoutBuffer += data.toString('utf-8');
            });
            child.stderr?.on('data', (data) => {
                stderrBuffer += data.toString('utf-8');
            });
            child.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`子进程错误: ${err.message}`));
            });
            child.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0 && !stdoutBuffer) {
                    reject(new Error(`子进程退出(code=${code})${stderrBuffer ? ': ' + stderrBuffer.trim() : ''}`));
                    return;
                }
                const response = this.parseJsonRpcResponse(stdoutBuffer, server.id);
                if (response) {
                    resolve(response);
                }
                else {
                    reject(new Error(`无法解析 MCP 响应: ${stdoutBuffer.substring(0, 500)}`));
                }
            });
            const jsonLine = JSON.stringify(request) + '\n';
            try {
                child.stdin?.write(jsonLine);
                child.stdin?.end();
            }
            catch (err) {
                clearTimeout(timeout);
                child.kill('SIGTERM');
                reject(new Error(`写入 stdin 失败: ${err instanceof Error ? err.message : String(err)}`));
            }
        });
    }
    async sendHttpRequest(server, request) {
        if (!server.url) {
            throw new Error(`${server.transportType} 模式缺少 url 配置`);
        }
        const headers = {
            'Content-Type': 'application/json',
            ...(server.headers ?? {}),
        };
        if (server.transportType === 'streamable-http') {
            headers['Accept'] = 'application/json, text/event-stream';
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), McpService_1.HTTP_TIMEOUT);
        try {
            const res = await fetch(server.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
            }
            const contentType = res.headers.get('content-type') ?? '';
            if (contentType.includes('text/event-stream')) {
                const text = await res.text();
                return this.parseSseResponse(text);
            }
            const json = (await res.json());
            return json;
        }
        catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                throw new Error(`HTTP 请求超时 (${McpService_1.HTTP_TIMEOUT}ms)`);
            }
            throw err;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    parseJsonRpcResponse(text, serverId) {
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.jsonrpc === '2.0' &&
                    (parsed.result !== undefined || parsed.error !== undefined)) {
                    return parsed;
                }
            }
            catch {
                continue;
            }
        }
        try {
            const parsed = JSON.parse(text.trim());
            if (parsed.jsonrpc === '2.0' &&
                (parsed.result !== undefined || parsed.error !== undefined)) {
                return parsed;
            }
        }
        catch {
        }
        this.logger.warn(`Server ${serverId} 无法解析响应: ${text.substring(0, 200)}`);
        return null;
    }
    parseSseResponse(text) {
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                try {
                    return JSON.parse(jsonStr);
                }
                catch {
                    continue;
                }
            }
        }
        try {
            return JSON.parse(text.trim());
        }
        catch {
            throw new Error(`无法解析 SSE 响应: ${text.substring(0, 200)}`);
        }
    }
};
exports.McpService = McpService;
exports.McpService = McpService = McpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(mcp_server_entity_1.McpServerEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        redis_service_1.RedisService])
], McpService);
//# sourceMappingURL=mcp.service.js.map