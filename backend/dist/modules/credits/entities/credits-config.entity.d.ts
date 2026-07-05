import { BaseEntity } from '../../../common/entities/base.entity';
export declare class CreditsConfigEntity extends BaseEntity {
    configKey: string;
    configValue: Record<string, unknown>;
    description?: string;
    isActive: boolean;
}
