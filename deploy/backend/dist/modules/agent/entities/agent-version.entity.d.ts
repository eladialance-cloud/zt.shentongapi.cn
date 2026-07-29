export declare class AgentVersionEntity {
    id: number;
    agentId: number;
    version: string;
    systemPrompt: string;
    modelId: string;
    config?: Record<string, unknown>;
    changelog?: string;
    createdAt: Date;
}
