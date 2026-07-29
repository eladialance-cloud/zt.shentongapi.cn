"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUserModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../user/entities/user.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
const role_entity_1 = require("../user/entities/role.entity");
const credit_account_entity_1 = require("../credits/entities/credit-account.entity");
const credit_transaction_entity_1 = require("../credits/entities/credit-transaction.entity");
const credits_config_entity_1 = require("../credits/entities/credits-config.entity");
const recharge_order_entity_1 = require("../payment/entities/recharge-order.entity");
const payment_record_entity_1 = require("../payment/entities/payment-record.entity");
const device_entity_1 = require("../device/entities/device.entity");
const invite_code_entity_1 = require("../user/entities/invite-code.entity");
const credits_module_1 = require("../credits/credits.module");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const user_module_1 = require("../user/user.module");
const common_module_1 = require("../../common/common.module");
const admin_user_controller_1 = require("./admin-user.controller");
const admin_user_level_controller_1 = require("./admin-user-level.controller");
const admin_recharge_order_controller_1 = require("./admin-recharge-order.controller");
const admin_device_controller_1 = require("./admin-device.controller");
const admin_invite_code_controller_1 = require("./admin-invite-code.controller");
const admin_user_service_1 = require("./admin-user.service");
let AdminUserModule = class AdminUserModule {
};
exports.AdminUserModule = AdminUserModule;
exports.AdminUserModule = AdminUserModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                user_role_entity_1.UserRoleEntity,
                role_entity_1.RoleEntity,
                credit_account_entity_1.CreditAccountEntity,
                credit_transaction_entity_1.CreditTransactionEntity,
                credits_config_entity_1.CreditsConfigEntity,
                recharge_order_entity_1.RechargeOrderEntity,
                payment_record_entity_1.PaymentRecordEntity,
                device_entity_1.DeviceEntity,
                invite_code_entity_1.InviteCodeEntity,
            ]),
            credits_module_1.CreditsModule,
            admin_auth_module_1.AdminAuthModule,
            user_module_1.UserModule,
            common_module_1.CommonModule,
        ],
        controllers: [
            admin_user_controller_1.AdminUserController,
            admin_user_level_controller_1.AdminUserLevelController,
            admin_recharge_order_controller_1.AdminRechargeOrderController,
            admin_device_controller_1.AdminDeviceController,
            admin_invite_code_controller_1.AdminInviteCodeController,
        ],
        providers: [admin_user_service_1.AdminUserService],
        exports: [admin_user_service_1.AdminUserService],
    })
], AdminUserModule);
//# sourceMappingURL=admin-user.module.js.map