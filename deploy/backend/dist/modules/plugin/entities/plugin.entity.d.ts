import { BaseEntity } from '../../../common/entities/base.entity';
export declare class PluginEntity extends BaseEntity {
    name: string;
    description?: string;
    type?: string;
    version: string;
    mcpServerUrl?: string;
    config?: Record<string, unknown>;
    isOfficial: boolean;
    isActive: boolean;
    pricingMode: string;
    pricePerCall: number;
    pricePerTokenInput: number;
    pricePerTokenOutput: number;
    sandboxConfig?: Record<string, unknown>;
    reviewStatus: 'pending' | 'approved' | 'rejected';
    rejectReason?: string;
}
