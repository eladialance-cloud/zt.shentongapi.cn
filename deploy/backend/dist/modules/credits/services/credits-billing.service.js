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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditsBillingService = void 0;
const common_1 = require("@nestjs/common");
const credits_service_1 = require("./credits.service");
let CreditsBillingService = class CreditsBillingService {
    creditsService;
    constructor(creditsService) {
        this.creditsService = creditsService;
    }
    async estimateAndFreeze(userId, source, sourceId, estimatedCost) {
        return this.creditsService.freezeCredits(userId, estimatedCost, source, sourceId);
    }
    async settleActualCost(userId, frozenTxnId, actualCost) {
        return this.creditsService.settleCredits(userId, frozenTxnId, actualCost);
    }
    async refund(userId, frozenTxnId) {
        return this.creditsService.refundCredits(userId, frozenTxnId);
    }
    async getAccount(userId) {
        return this.creditsService.getAccount(userId);
    }
    async getTransactions(userId, query) {
        return this.creditsService.getTransactions(userId, query);
    }
};
exports.CreditsBillingService = CreditsBillingService;
exports.CreditsBillingService = CreditsBillingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [credits_service_1.CreditsService])
], CreditsBillingService);
//# sourceMappingURL=credits-billing.service.js.map