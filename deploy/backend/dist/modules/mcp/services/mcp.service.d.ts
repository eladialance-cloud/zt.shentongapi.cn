import { Repository } from 'typeorm';
import { McpServerEntity } from '../entities/mcp-server.entity';
import { RedisService } from '../../../common/services/redis.service';
interface CallToolData {
    serverId: string;
    toolName: string;
    args: Record<string, unknown>;
}
export declare class McpService {
    private readonly serverRepo;
    private readonly redis;
    private readonly logger;
    private static readonly TOOLS_CACHE_TTL;
    private static readonly STDIO_TIMEOUT;
    private static readonly HTTP_TIMEOUT;
    constructor(serverRepo: Repository<McpServerEntity>, redis: RedisService);
    health(): {
        status: string;
        module: string;
    };
    listServers(userId: number): Promise<McpServerEntity[]>;
    createServer(userId: number, data: Partial<McpServerEntity>): Promise<McpServerEntity>;
    updateServer(userId: number, serverId: string, data: Partial<McpServerEntity>): Promise<McpServerEntity>;
    deleteServer(userId: number, serverId: string): Promise<void>;
    listTools(userId: number, serverId: string): Promise<unknown[]>;
    callTool(userId: number, data: CallToolData): Promise<unknown>;
    probeServer(userId: number, serverId: string): Promise<{
        status: string;
        toolCount: number;
        tools: unknown[];
    }>;
    private findUserServer;
    private validateTransportFields;
    private getToolsCacheKey;
    private fetchToolsList;
    private invokeTool;
    private sendMcpRequest;
    private sendStdioRequest;
    private sendHttpRequest;
    private parseJsonRpcResponse;
    private parseSseResponse;
}
export {};
