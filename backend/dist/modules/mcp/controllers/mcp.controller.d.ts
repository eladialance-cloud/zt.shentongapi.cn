import { McpService } from '../services/mcp.service';
export declare class McpController {
    private readonly service;
    constructor(service: McpService);
    health(): {
        status: string;
        module: string;
    };
}
