import { BaseEntity } from '../../../common/entities/base.entity';
export type N8nLastExecutionStatus = 'success' | 'error' | 'running' | 'unknown';
export declare class N8nWorkflowEntity extends BaseEntity {
    instanceId: number;
    userId: number;
    workflowId: string;
    name: string;
    active: boolean;
    nodes?: Record<string, unknown>;
    connections?: Record<string, unknown>;
    tags?: unknown[];
    lastExecutedAt?: Date;
    lastExecutionStatus: N8nLastExecutionStatus;
}
