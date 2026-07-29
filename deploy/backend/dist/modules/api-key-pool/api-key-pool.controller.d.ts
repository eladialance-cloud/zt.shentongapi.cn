import { ApiKeyPoolService } from './services/api-key-pool.service';
import { ApiKeyPoolEntity } from './entities/api-key-pool.entity';
declare class CreateKeyDto {
    provider: string;
    apiKey: string;
    alias?: string;
    priority?: number;
    modelConfigId?: number;
    totalQuota?: number;
    dailyQuota?: number;
    monthlyQuota?: number;
}
declare class UpdateKeyDto {
    provider?: string;
    apiKey?: string;
    alias?: string;
    priority?: number;
    status?: string;
    modelConfigId?: number;
    totalQuota?: number;
}
declare class SetLimitsDto {
    dailyQuota?: number;
    monthlyQuota?: number;
}
export declare class ApiKeyPoolController {
    private readonly service;
    constructor(service: ApiKeyPoolService);
    health(): {
        status: string;
        module: string;
    };
    list(provider?: string): Promise<ApiKeyPoolEntity[]>;
    stats(): Promise<{
        total: number;
        active: number;
        exhausted: number;
        error: number;
        disabled: number;
        dailyConsumed: number;
        monthlyConsumed: number;
    }>;
    create(dto: CreateKeyDto): Promise<ApiKeyPoolEntity>;
    update(id: number, dto: UpdateKeyDto): Promise<ApiKeyPoolEntity>;
    remove(id: number): Promise<null>;
    resetErrors(id: number): Promise<null>;
    setLimits(id: number, dto: SetLimitsDto): Promise<ApiKeyPoolEntity>;
}
export {};
