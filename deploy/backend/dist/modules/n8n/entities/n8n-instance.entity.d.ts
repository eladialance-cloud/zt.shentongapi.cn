import { BaseEntity } from '../../../common/entities/base.entity';
export type N8nInstanceStatus = 'pending' | 'running' | 'stopped' | 'error';
export declare class N8nInstanceEntity extends BaseEntity {
    userId: number;
    name: string;
    description?: string;
    baseUrl: string;
    apiKey: string;
    status: N8nInstanceStatus;
    version?: string;
    lastStartedAt?: Date;
    lastStoppedAt?: Date;
    webhookUrl?: string;
    config?: Record<string, unknown>;
}
