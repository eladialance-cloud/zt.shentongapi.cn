import { BaseEntity } from '../../../common/entities/base.entity';
export declare class RechargeOrderEntity extends BaseEntity {
    orderNo: string;
    userId: number;
    packageId?: number;
    credits: number;
    amount: number;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    paymentChannel?: 'wechat' | 'alipay' | 'stripe';
    paymentRecordId?: number;
}
