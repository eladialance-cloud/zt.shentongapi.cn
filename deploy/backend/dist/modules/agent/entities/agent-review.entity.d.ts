export declare class AgentReviewEntity {
    id: number;
    agentId: number;
    reviewerId: number;
    action: 'approve' | 'reject';
    reason?: string;
    createdAt: Date;
}
