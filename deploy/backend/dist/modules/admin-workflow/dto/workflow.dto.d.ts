export declare class AdminWorkflowQueryDto {
    engineType?: string;
    category?: string;
    keyword?: string;
    status?: string;
    page?: number;
    pageSize?: number;
}
export declare class AdminWorkflowReviewQueryDto {
    status?: string;
    page?: number;
    pageSize?: number;
}
export declare class CreateAdminWorkflowDto {
    name: string;
    description: string;
    engineType: string;
    n8nWorkflowId?: string;
    cozeWorkflowId?: string;
    category: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    pricePerExecution: number;
    isActive?: boolean;
}
export declare class UpdateAdminWorkflowDto {
    name?: string;
    description?: string;
    engineType?: string;
    n8nWorkflowId?: string;
    cozeWorkflowId?: string;
    category?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    pricePerExecution?: number;
    isActive?: boolean;
}
