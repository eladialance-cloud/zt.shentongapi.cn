import { BaseEntity } from '../../../common/entities/base.entity';
export declare class McpServerEntity extends BaseEntity {
    userId: number;
    name: string;
    description?: string;
    transportType: 'stdio' | 'http' | 'streamable-http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    enabled: boolean;
    lastConnectedAt?: Date;
    toolCount: number;
    status: 'pending' | 'connected' | 'failed' | 'disabled';
}
