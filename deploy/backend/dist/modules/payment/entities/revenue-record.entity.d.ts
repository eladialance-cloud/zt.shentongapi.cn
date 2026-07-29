import { BaseEntity } from '../../../common/entities/base.entity';
export declare class RevenueRecordEntity extends BaseEntity {
    userId: number;
    source: 'agent_sale' | 'recharge' | 'referral' | 'withdrawal' | 'adjustment';
    amount: number;
    referenceId?: number;
    description?: string;
}
