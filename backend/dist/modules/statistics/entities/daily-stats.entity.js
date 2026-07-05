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
exports.DailyStatsEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let DailyStatsEntity = class DailyStatsEntity extends base_entity_1.BaseEntity {
    date;
    dau;
    newUsers;
    totalUsers;
    totalCalls;
    totalRevenue;
    totalConsumed;
    avgOrderValue;
    onlineUsers;
};
exports.DailyStatsEntity = DailyStatsEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", String)
], DailyStatsEntity.prototype, "date", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'dau', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "dau", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'new_users', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "newUsers", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_users', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "totalUsers", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_calls', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "totalCalls", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_revenue', type: 'decimal', precision: 12, scale: 4, default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "totalRevenue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_consumed', type: 'decimal', precision: 12, scale: 4, default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "totalConsumed", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'avg_order_value', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "avgOrderValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'online_users', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], DailyStatsEntity.prototype, "onlineUsers", void 0);
exports.DailyStatsEntity = DailyStatsEntity = __decorate([
    (0, typeorm_1.Entity)('daily_stats')
], DailyStatsEntity);
//# sourceMappingURL=daily-stats.entity.js.map