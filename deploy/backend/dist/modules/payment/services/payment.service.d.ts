import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentRecordEntity } from '../entities/payment-record.entity';
import { RechargeOrderEntity } from '../entities/recharge-order.entity';
import { MembershipPlanEntity } from '../entities/membership-plan.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { RedisService } from '../../../common/services/redis.service';
import { SystemConfigEntity } from '../../admin-system/entities/system-config.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
type PaymentChannel = 'wechat' | 'alipay' | 'stripe';
export declare class PaymentService {
    private paymentRepo;
    private orderRepo;
    private planRepo;
    private configRepo;
    private creditsService;
    private readonly redis;
    private readonly config;
    private readonly encryptionService;
    private dataSource;
    private readonly logger;
    private static readonly PLANS_CACHE_KEY;
    private static readonly PLANS_CACHE_TTL;
    private wechatPay;
    private alipaySdk;
    private stripeClient;
    constructor(paymentRepo: Repository<PaymentRecordEntity>, orderRepo: Repository<RechargeOrderEntity>, planRepo: Repository<MembershipPlanEntity>, configRepo: Repository<SystemConfigEntity>, creditsService: CreditsService, redis: RedisService, config: ConfigService, encryptionService: EncryptionService, dataSource: DataSource);
    createRechargeOrder(userId: number, packageId: number | null, credits: number, amount: number, channel: PaymentChannel): Promise<RechargeOrderEntity>;
    initiatePayment(orderNo: string, channel: PaymentChannel, subMethod: string): Promise<{
        paymentId: number;
        orderNo: string;
        payParams: Record<string, unknown>;
    }>;
    handlePaymentCallback(channel: string, callbackData: Record<string, unknown>): Promise<{
        success: boolean;
        orderNo?: string;
    }>;
    getOrderStatus(orderNo: string, userId: number): Promise<{
        orderNo: string;
        status: "pending" | "failed" | "paid" | "refunded";
        credits: number;
        amount: number;
        createdAt: Date;
        paidAt: Date;
    }>;
    getUserOrders(userId: number, page?: number, pageSize?: number): Promise<{
        list: RechargeOrderEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getPlans(): Promise<MembershipPlanEntity[]>;
    createPlan(data: Partial<MembershipPlanEntity>): Promise<MembershipPlanEntity>;
    updatePlan(id: number, data: Partial<MembershipPlanEntity>): Promise<void>;
    deletePlan(id: number): Promise<void>;
    refundOrder(orderId: number, adminId: number, reason: string): Promise<{
        success: boolean;
    }>;
    private loadPaymentConfig;
    private getWechatConfig;
    private getAlipayConfig;
    private getStripeConfig;
    private generateOrderNo;
    private generatePayParams;
    private initWechatPay;
    private generateWechatPayParams;
    private initAlipay;
    private generateAlipayParams;
    private initStripe;
    private generateStripeParams;
    private verifyCallbackSignature;
    health(): {
        status: string;
        module: string;
    };
}
export {};
