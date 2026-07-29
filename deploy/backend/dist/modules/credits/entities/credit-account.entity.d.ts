import { BaseEntity } from '../../../common/entities/base.entity';
export declare class CreditAccountEntity extends BaseEntity {
    userId: number;
    balance: number;
    frozenBalance: number;
    totalRecharged: number;
    totalConsumed: number;
    version: number;
}
