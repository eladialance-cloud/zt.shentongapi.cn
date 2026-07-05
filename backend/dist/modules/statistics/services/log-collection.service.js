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
var LogCollectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogCollectionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let LogCollectionService = LogCollectionService_1 = class LogCollectionService {
    dataSource;
    logger = new common_1.Logger(LogCollectionService_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    onModuleInit() {
        this.scheduleDaily(1, 0, () => {
            this.aggregateYesterday().catch((err) => this.logger.error(`昨日聚合失败: ${err?.message || err}`));
        });
    }
    async aggregateDailyStats(date) {
        const dateStr = typeof date === 'string' ? date : this.formatDate(date);
        const start = `${dateStr} 00:00:00`;
        const end = `${dateStr} 23:59:59`;
        const newUsersRow = await this.dataSource.query(`SELECT COUNT(*) AS cnt FROM users WHERE created_at BETWEEN ? AND ?`, [start, end]);
        const newUsers = Number(newUsersRow[0]?.cnt || 0);
        const totalUsersRow = await this.dataSource.query(`SELECT COUNT(*) AS cnt FROM users WHERE created_at <= ?`, [end]);
        const totalUsers = Number(totalUsersRow[0]?.cnt || 0);
        let dau = 0;
        try {
            const dauRow = await this.dataSource.query(`SELECT COUNT(DISTINCT user_id) AS cnt FROM credit_transactions WHERE created_at BETWEEN ? AND ?`, [start, end]);
            dau = Number(dauRow[0]?.cnt || 0);
        }
        catch (e) {
            this.logger.warn?.(`DAU 聚合跳过: ${e.message}`);
        }
        let totalCalls = 0;
        try {
            const callsRow = await this.dataSource.query(`SELECT COUNT(*) AS cnt FROM agent_call_logs WHERE created_at BETWEEN ? AND ?`, [start, end]);
            totalCalls = Number(callsRow[0]?.cnt || 0);
        }
        catch (e) {
            this.logger.warn?.(`调用数聚合跳过: ${e.message}`);
        }
        let totalRevenue = 0;
        let paidOrders = 0;
        try {
            const revRow = await this.dataSource.query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM payment_records WHERE status = 'paid' AND paid_at BETWEEN ? AND ?`, [start, end]);
            totalRevenue = Number(revRow[0]?.total || 0);
            paidOrders = Number(revRow[0]?.cnt || 0);
        }
        catch (e) {
            this.logger.warn?.(`收入聚合跳过: ${e.message}`);
        }
        let totalConsumed = 0;
        try {
            const consumedRow = await this.dataSource.query(`SELECT COALESCE(SUM(amount),0) AS total FROM credit_transactions WHERE type = 'settle' AND created_at BETWEEN ? AND ?`, [start, end]);
            totalConsumed = Number(consumedRow[0]?.total || 0);
        }
        catch (e) {
            this.logger.warn?.(`消耗聚合跳过: ${e.message}`);
        }
        const avgOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;
        await this.dataSource.query(`INSERT INTO daily_stats
        (date, dau, new_users, total_users, total_calls, total_revenue, total_consumed, avg_order_value, online_users, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        dau = VALUES(dau), new_users = VALUES(new_users), total_users = VALUES(total_users),
        total_calls = VALUES(total_calls), total_revenue = VALUES(total_revenue),
        total_consumed = VALUES(total_consumed), avg_order_value = VALUES(avg_order_value),
        updated_at = NOW()`, [dateStr, dau, newUsers, totalUsers, totalCalls, totalRevenue, totalConsumed, avgOrderValue]);
    }
    async aggregateYesterday() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await this.aggregateDailyStats(yesterday);
        this.logger.log('昨日日报聚合完成');
    }
    health() {
        return { status: 'ok', module: 'log-collection' };
    }
    formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    scheduleDaily(hour, minute, fn) {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
        if (next.getTime() <= now.getTime()) {
            next.setDate(next.getDate() + 1);
        }
        const delay = next.getTime() - now.getTime();
        setTimeout(() => {
            fn();
            setInterval(fn, 24 * 60 * 60 * 1000);
        }, delay);
    }
};
exports.LogCollectionService = LogCollectionService;
exports.LogCollectionService = LogCollectionService = LogCollectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], LogCollectionService);
//# sourceMappingURL=log-collection.service.js.map