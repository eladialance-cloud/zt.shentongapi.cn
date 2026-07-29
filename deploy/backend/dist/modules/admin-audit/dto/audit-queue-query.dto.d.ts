export declare class AuditQueueQueryDto {
    type?: 'conversation' | 'agent' | 'plugin' | 'workflow';
    status?: 'pending' | 'approved' | 'rejected' | 'false_positive';
    page?: number;
    pageSize?: number;
}
