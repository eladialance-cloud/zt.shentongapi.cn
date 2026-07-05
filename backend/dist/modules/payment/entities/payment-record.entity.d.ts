import { BaseEntity } from '../../../common/entities/base.entity';
export declare class PaymentRecordEntity extends BaseEntity {
    userId: number;
    orderNo: string;
    channel: 'wechat' | 'alipay' | 'stripe';
    subMethod?: 'native' | 'jsapi' | 'pc' | 'wap' | 'card';
    amount: number;
    currency: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded' | 'refunding';
    paymentTxnId?: string;
    payParams?: Record<string, unknown>;
    paidAt?: Date;
    refundTxnId?: string;
    refundAmount?: number;
    refundedAt?: Date;
    description?: string;
    callbackRaw?: Record<string, unknown>;
}
