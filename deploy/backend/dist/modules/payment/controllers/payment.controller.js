"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const payment_service_1 = require("../services/payment.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const create_recharge_dto_1 = require("../dto/create-recharge.dto");
let PaymentController = class PaymentController {
    paymentService;
    constructor(paymentService) {
        this.paymentService = paymentService;
    }
    health() {
        return this.paymentService.health();
    }
    async createRecharge(dto, user) {
        const order = await this.paymentService.createRechargeOrder(user.userId, dto.packageId ?? null, dto.credits, dto.amount, dto.channel);
        const payment = await this.paymentService.initiatePayment(order.orderNo, dto.channel, dto.subMethod ?? '');
        return { order, payment };
    }
    async getOrders(user, page = '1', pageSize = '20') {
        return this.paymentService.getUserOrders(user.userId, Number(page), Number(pageSize));
    }
    async getOrderStatus(orderNo, user) {
        return this.paymentService.getOrderStatus(orderNo, user.userId);
    }
    async wechatCallback(body, headers) {
        return this.paymentService.handlePaymentCallback('wechat', {
            body,
            'wechatpay-signature': headers['wechatpay-signature'],
            'wechatpay-serial': headers['wechatpay-serial'],
            'wechatpay-nonce': headers['wechatpay-nonce'],
            'wechatpay-timestamp': headers['wechatpay-timestamp'],
        });
    }
    async alipayCallback(body) {
        return this.paymentService.handlePaymentCallback('alipay', body);
    }
    async stripeCallback(body, sig) {
        return this.paymentService.handlePaymentCallback('stripe', {
            ...body,
            'stripe-signature': sig,
            raw_body: JSON.stringify(body),
        });
    }
    async getPlans() {
        return this.paymentService.getPlans();
    }
};
exports.PaymentController = PaymentController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaymentController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('recharge'),
    (0, swagger_1.ApiOperation)({ summary: '创建充值订单并发起支付' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_recharge_dto_1.CreateRechargeDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "createRecharge", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, swagger_1.ApiOperation)({ summary: '我的充值订单' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "getOrders", null);
__decorate([
    (0, common_1.Get)('orders/:orderNo'),
    (0, swagger_1.ApiOperation)({ summary: '查询订单状态' }),
    __param(0, (0, common_1.Param)('orderNo')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "getOrderStatus", null);
__decorate([
    (0, common_1.Post)('callback/wechat'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '微信支付回调' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "wechatCallback", null);
__decorate([
    (0, common_1.Post)('callback/alipay'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '支付宝支付回调' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "alipayCallback", null);
__decorate([
    (0, common_1.Post)('callback/stripe'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: 'Stripe支付回调' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('stripe-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "stripeCallback", null);
__decorate([
    (0, common_1.Get)('plans'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '获取会员套餐列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentController.prototype, "getPlans", null);
exports.PaymentController = PaymentController = __decorate([
    (0, swagger_1.ApiTags)('支付'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payment_service_1.PaymentService])
], PaymentController);
//# sourceMappingURL=payment.controller.js.map