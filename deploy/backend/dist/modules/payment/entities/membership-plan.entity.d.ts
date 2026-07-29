import { BaseEntity } from '../../../common/entities/base.entity';
export declare class MembershipPlanEntity extends BaseEntity {
    name: string;
    description?: string;
    price: number;
    credits: number;
    durationDays: number;
    features?: string[];
    isActive: boolean;
}
