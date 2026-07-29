import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { McpService } from '../services/mcp.service';
import { McpServerEntity } from '../entities/mcp-server.entity';
export declare class McpController {
    private readonly service;
    constructor(service: McpService);
    health(): {
        status: string;
        module: string;
    };
    listServers(user: ICurrentUser): Promise<McpServerEntity[]>;
    createServer(user: ICurrentUser, body: Partial<McpServerEntity>): Promise<McpServerEntity>;
    getServer(user: ICurrentUser, serverId: string): Promise<McpServerEntity>;
    updateServer(user: ICurrentUser, serverId: string, body: Partial<McpServerEntity>): Promise<McpServerEntity>;
    deleteServer(user: ICurrentUser, serverId: string): Promise<void>;
    listTools(user: ICurrentUser, serverId: string): Promise<unknown[]>;
    callTool(user: ICurrentUser, body: {
        serverId: string;
        toolName: string;
        args: Record<string, unknown>;
    }): Promise<unknown>;
    probeServer(user: ICurrentUser, serverId: string): Promise<{
        status: string;
        toolCount: number;
        tools: unknown[];
    }>;
}
