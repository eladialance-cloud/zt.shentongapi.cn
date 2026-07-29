export declare class CreateRechargeDto {
    packageId?: number;
    credits: number;
    amount: number;
    channel: 'wechat' | 'alipay' | 'stripe';
    subMethod?: string;
}
