import { BaseEntity } from '../../../common/entities/base.entity';
export declare class WithdrawalRecordEntity extends BaseEntity {
    userId: number;
    amount: number;
    status: 'pending' | 'approved' | 'rejected' | 'paid';
    channel?: string;
    accountInfo?: Record<string, unknown>;
    rejectedReason?: string;
    paidAt?: Date;
}
