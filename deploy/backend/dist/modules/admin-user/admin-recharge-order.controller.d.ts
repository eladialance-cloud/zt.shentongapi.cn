import { AdminUserService } from './admin-user.service';
import { RechargeOrderQueryDto } from './dto/recharge-order-query.dto';
import { RefundDto } from './dto/refund.dto';
export declare class AdminRechargeOrderController {
    private readonly service;
    constructor(service: AdminUserService);
    list(query: RechargeOrderQueryDto): Promise<{
        list: {
            id: number;
            orderNo: string;
            userId: number;
            username: string;
            amount: number;
            credits: number;
            paymentMethod: string;
            status: "pending" | "failed" | "paid" | "refunded";
            createdAt: string;
            paidAt: string | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    refund(id: number, dto: RefundDto): Promise<void>;
}
