import { BaseEntity } from '../../../common/entities/base.entity';
export declare class SystemConfigEntity extends BaseEntity {
    section: string;
    configValue: Record<string, unknown>;
    description?: string;
}
