import { BaseEntity } from '../../../common/entities/base.entity';
export declare class AuditQueueEntity extends BaseEntity {
    type: 'conversation' | 'agent' | 'plugin' | 'workflow';
    contentSummary: string;
    content?: string;
    userId: number;
    username?: string;
    triggerReason: 'sensitive_word' | 'ai_audit';
    hitWords?: string[];
    riskLevel: 'low' | 'medium' | 'high';
    status: 'pending' | 'approved' | 'rejected' | 'false_positive';
    processedBy?: string;
    processedAt?: Date;
    processRemark?: string;
}
