"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const credit_account_entity_1 = require("./entities/credit-account.entity");
const credit_transaction_entity_1 = require("./entities/credit-transaction.entity");
const credits_config_entity_1 = require("./entities/credits-config.entity");
const credits_controller_1 = require("./controllers/credits.controller");
const credits_service_1 = require("./services/credits.service");
const credits_billing_service_1 = require("./services/credits-billing.service");
let CreditsModule = class CreditsModule {
};
exports.CreditsModule = CreditsModule;
exports.CreditsModule = CreditsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                credit_account_entity_1.CreditAccountEntity,
                credit_transaction_entity_1.CreditTransactionEntity,
                credits_config_entity_1.CreditsConfigEntity,
            ]),
        ],
        controllers: [credits_controller_1.CreditsController, credits_controller_1.AdminCreditsController],
        providers: [credits_service_1.CreditsService, credits_billing_service_1.CreditsBillingService],
        exports: [credits_service_1.CreditsService, credits_billing_service_1.CreditsBillingService],
    })
], CreditsModule);
//# sourceMappingURL=credits.module.js.map