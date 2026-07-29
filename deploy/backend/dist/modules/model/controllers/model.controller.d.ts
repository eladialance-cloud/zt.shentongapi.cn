import { ModelService } from '../services/model.service';
export declare class ModelController {
    private readonly modelService;
    constructor(modelService: ModelService);
    health(): {
        status: string;
        module: string;
    };
    listAvailableModels(): Promise<{
        id: number;
        provider: string;
        modelId: string;
        name: string;
        description?: string;
        contextWindow?: number;
        maxTokens?: number;
        supportsVision: boolean;
        supportsFunctions: boolean;
        pricePer1kInput?: number;
        pricePer1kOutput?: number;
        isActive: boolean;
        concurrencyLimit: number;
        rateLimitPerMinute: number;
        minUserLevel: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    detail(modelId: string): Promise<{
        id: number;
        provider: string;
        modelId: string;
        name: string;
        description?: string;
        contextWindow?: number;
        maxTokens?: number;
        supportsVision: boolean;
        supportsFunctions: boolean;
        pricePer1kInput?: number;
        pricePer1kOutput?: number;
        isActive: boolean;
        concurrencyLimit: number;
        rateLimitPerMinute: number;
        minUserLevel: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
