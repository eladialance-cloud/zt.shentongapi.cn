export declare class RechargeOrderQueryDto {
    status?: 'pending' | 'paid' | 'failed' | 'refunded';
    paymentMethod?: string;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
}
