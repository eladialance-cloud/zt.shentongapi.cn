export declare class RegisterInstanceDto {
    agentId: number;
    openclawAgentId: string;
    endpoint?: string;
    config?: Record<string, unknown>;
}
export declare class UpdateConfigDto {
    endpoint?: string;
    config?: Record<string, unknown>;
}
