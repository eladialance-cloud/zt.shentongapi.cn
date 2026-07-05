export declare class AgentCallLogEntity {
    id: number;
    agentId: number;
    userId: number;
    sessionId: number;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
    creditsCost: number;
    durationMs?: number;
    success: boolean;
    error?: string;
    createdAt: Date;
}
