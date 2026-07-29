export declare class AdminPluginQueryDto {
    type?: string;
    status?: string;
    page?: number;
    pageSize?: number;
}
export declare class AdminPluginReviewQueryDto {
    status?: string;
    page?: number;
    pageSize?: number;
}
export declare class PluginSyncQueryDto {
    status?: string;
    page?: number;
    pageSize?: number;
}
export declare class CreateAdminPluginDto {
    name: string;
    description: string;
    type: string;
    version: string;
    entryPoint?: string;
    sandboxConfig?: Record<string, unknown>;
    pricingMode: string;
    pricePerCall: number;
    pricePerTokenInput: number;
    pricePerTokenOutput: number;
}
export declare class UpdateAdminPluginDto {
    name?: string;
    description?: string;
    type?: string;
    version?: string;
    entryPoint?: string;
    sandboxConfig?: Record<string, unknown>;
    pricingMode?: string;
    pricePerCall?: number;
    pricePerTokenInput?: number;
    pricePerTokenOutput?: number;
}
