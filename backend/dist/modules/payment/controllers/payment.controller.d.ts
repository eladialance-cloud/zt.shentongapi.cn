import { PaymentService } from '../services/payment.service';
export declare class PaymentController {
    private readonly paymentService;
    constructor(paymentService: PaymentService);
    health(): {
        status: string;
        module: string;
    };
}
