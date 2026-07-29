export declare class HermesCallLogEntity {
    id: number;
    instanceId: number;
    userId: number;
    callType: 'skill_execute' | 'tool_call' | 'agent_invoke' | 'workflow_run';
    status: 'success' | 'failed' | 'timeout' | 'running';
    durationMs: number;
    creditsCost: number;
    target?: string;
    errorMessage?: string;
    createdAt: Date;
}
