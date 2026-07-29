import { BaseEntity } from '../../../common/entities/base.entity';
export type WorkflowEngineType = 'n8n' | 'coze';
export type AdminWorkflowCategory = 'automation' | 'integration' | 'data_processing' | 'other';
export type WorkflowReviewStatus = 'pending_review' | 'approved' | 'rejected';
export declare class WorkflowEntity extends BaseEntity {
    name: string;
    description?: string;
    engineType: WorkflowEngineType;
    n8nWorkflowId?: string;
    cozeWorkflowId?: string;
    category: AdminWorkflowCategory;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    pricePerExecution: number;
    isActive: boolean;
    reviewStatus: WorkflowReviewStatus;
    rejectReason?: string;
    executionCount: number;
    creatorName?: string;
}
