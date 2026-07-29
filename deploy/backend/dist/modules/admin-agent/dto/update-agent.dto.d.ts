export declare class UpdateAgentDto {
    name?: string;
    displayName?: string;
    description?: string;
    systemPrompt?: string;
    category?: 'office' | 'programming' | 'copywriting' | 'data_analysis' | 'other';
    usageExamples?: string[];
    modelId?: string;
    modelConfig?: Record<string, unknown>;
    apiKey?: string;
    pricingMode?: 'perCall' | 'perToken';
    pricePerCall?: number;
    pricePerTokenInput?: number;
    pricePerTokenOutput?: number;
}
