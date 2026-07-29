import { PaymentService } from '../services/payment.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateRechargeDto } from '../dto/create-recharge.dto';
export declare class PaymentController {
    private readonly paymentService;
    constructor(paymentService: PaymentService);
    health(): {
        status: string;
        module: string;
    };
    createRecharge(dto: CreateRechargeDto, user: ICurrentUser): Promise<{
        order: import("../entities/recharge-order.entity").RechargeOrderEntity;
        payment: {
            paymentId: number;
            orderNo: string;
            payParams: Record<string, unknown>;
        };
    }>;
    getOrders(user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: import("../entities/recharge-order.entity").RechargeOrderEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getOrderStatus(orderNo: string, user: ICurrentUser): Promise<{
        orderNo: string;
        status: "pending" | "failed" | "paid" | "refunded";
        credits: number;
        amount: number;
        createdAt: Date;
        paidAt: Date;
    }>;
    wechatCallback(body: Record<string, unknown>, headers: Record<string, string>): Promise<{
        success: boolean;
        orderNo?: string;
    }>;
    alipayCallback(body: Record<string, unknown>): Promise<{
        success: boolean;
        orderNo?: string;
    }>;
    stripeCallback(body: Record<string, unknown>, sig: string): Promise<{
        success: boolean;
        orderNo?: string;
    }>;
    getPlans(): Promise<import("../entities/membership-plan.entity").MembershipPlanEntity[]>;
}
