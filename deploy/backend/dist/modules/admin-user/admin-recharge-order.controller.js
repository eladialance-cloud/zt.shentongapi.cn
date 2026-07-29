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
exports.AdminRechargeOrderController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_user_service_1 = require("./admin-user.service");
const recharge_order_query_dto_1 = require("./dto/recharge-order-query.dto");
const refund_dto_1 = require("./dto/refund.dto");
let AdminRechargeOrderController = class AdminRechargeOrderController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.listRechargeOrders(query);
    }
    async refund(id, dto) {
        await this.service.refundOrder(id, dto);
    }
};
exports.AdminRechargeOrderController = AdminRechargeOrderController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '充值订单列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recharge_order_query_dto_1.RechargeOrderQueryDto]),
    __metadata("design:returntype", Promise)
], AdminRechargeOrderController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/refund'),
    (0, swagger_1.ApiOperation)({ summary: '退款' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, refund_dto_1.RefundDto]),
    __metadata("design:returntype", Promise)
], AdminRechargeOrderController.prototype, "refund", null);
exports.AdminRechargeOrderController = AdminRechargeOrderController = __decorate([
    (0, swagger_1.ApiTags)('管理端-充值订单'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/recharge-orders'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_user_service_1.AdminUserService])
], AdminRechargeOrderController);
//# sourceMappingURL=admin-recharge-order.controller.js.map