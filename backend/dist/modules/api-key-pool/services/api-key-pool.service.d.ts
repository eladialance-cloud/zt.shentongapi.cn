import { OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ApiKeyPoolEntity } from '../entities/api-key-pool.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
export declare class ApiKeyPoolService implements OnModuleInit {
    private keyRepo;
    private encryption;
    private readonly logger;
    constructor(keyRepo: Repository<ApiKeyPoolEntity>, encryption: EncryptionService);
    onModuleInit(): void;
    getNextAvailableKey(provider: string): Promise<ApiKeyPoolEntity | null>;
    markExhausted(keyId: number): Promise<void>;
    markError(keyId: number): Promise<void>;
    deductQuota(keyId: number, amount: number): Promise<void>;
    resetDailyQuota(): Promise<void>;
    resetMonthlyQuota(): Promise<void>;
    checkBalance(): Promise<void>;
    list(provider?: string): Promise<ApiKeyPoolEntity[]>;
    get(id: number): Promise<ApiKeyPoolEntity>;
    create(data: Partial<ApiKeyPoolEntity>): Promise<ApiKeyPoolEntity>;
    update(id: number, data: Partial<ApiKeyPoolEntity>): Promise<ApiKeyPoolEntity>;
    delete(id: number): Promise<void>;
    resetErrors(id: number): Promise<void>;
    setLimits(id: number, dailyQuota?: number, monthlyQuota?: number): Promise<ApiKeyPoolEntity>;
    getStats(): Promise<{
        total: number;
        active: number;
        exhausted: number;
        error: number;
        disabled: number;
        dailyConsumed: number;
        monthlyConsumed: number;
    }>;
    health(): {
        status: string;
        module: string;
    };
    private maskKey;
    private scheduleDaily;
    private scheduleMonthly;
}
