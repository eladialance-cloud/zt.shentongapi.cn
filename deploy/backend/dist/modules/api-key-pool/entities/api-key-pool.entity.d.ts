import { BaseEntity } from '../../../common/entities/base.entity';
export type ApiKeyStatus = 'active' | 'exhausted' | 'error' | 'disabled';
export declare class ApiKeyPoolEntity extends BaseEntity {
    modelConfigId?: number;
    provider: string;
    apiKey: string;
    alias?: string;
    priority: number;
    status: ApiKeyStatus;
    totalQuota: number;
    usedQuota: number;
    remainingQuota: number;
    dailyQuota?: number;
    monthlyQuota?: number;
    dailyUsedQuota: number;
    monthlyUsedQuota: number;
    lastUsedAt?: Date;
    lastCheckAt?: Date;
    errorCount: number;
}
