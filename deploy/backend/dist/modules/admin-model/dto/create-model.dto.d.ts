export declare class CreateModelDto {
    provider: string;
    modelId: string;
    displayName: string;
    apiKey?: string;
    apiEndpoint?: string;
    inputPricePerToken: number;
    outputPricePerToken: number;
    capabilities: string[];
    enabled: boolean;
    concurrencyLimit?: number;
    rateLimitPerMinute?: number;
    minUserLevel: number;
}
