import { BaseEntity } from '../../../common/entities/base.entity';
export declare class OpenClawInstanceEntity extends BaseEntity {
    userId: number;
    agentId?: number;
    openclawAgentId: string;
    endpoint: string;
    status: 'online' | 'offline' | 'error';
    lastHeartbeatAt?: Date;
    config?: Record<string, unknown>;
}
