import { Repository } from 'typeorm';
import { ModelEntity } from '../entities/model.entity';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
type SafeModelOutput = {
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
};
export declare class ModelService {
    private readonly modelRepo;
    private readonly redis;
    private readonly encryption;
    private static readonly CACHE_KEY;
    private static readonly CACHE_TTL;
    constructor(modelRepo: Repository<ModelEntity>, redis: RedisService, encryption: EncryptionService);
    listAvailableModels(): Promise<SafeModelOutput[]>;
    detail(modelId: string): Promise<SafeModelOutput>;
    create(data: Partial<ModelEntity>): Promise<ModelEntity>;
    update(id: number, data: Partial<ModelEntity>): Promise<void>;
    remove(id: number): Promise<void>;
    health(): {
        status: string;
        module: string;
    };
    private toSafeModel;
}
export {};
