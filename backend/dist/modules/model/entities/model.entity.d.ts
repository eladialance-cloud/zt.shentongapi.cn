import { BaseEntity } from '../../../common/entities/base.entity';
export declare class ModelEntity extends BaseEntity {
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
}
