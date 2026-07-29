import { BaseEntity } from '../../../common/entities/base.entity';
export declare class HermesSkillEntity extends BaseEntity {
    name: string;
    description?: string;
    author?: string;
    pricePerMinute: number;
    installCount: number;
    icon?: string;
    version: string;
    isActive: boolean;
}
