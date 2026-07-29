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
var DashboardStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardStatsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const redis_service_1 = require("../../../common/services/redis.service");
const log_collection_service_1 = require("./log-collection.service");
let DashboardStatsService = DashboardStatsService_1 = class DashboardStatsService {
    dataSource;
    redis;
    logCollection;
    logger = new common_1.Logger(DashboardStatsService_1.name);
    constructor(dataSource, redis, logCollection) {
        this.dataSource = dataSource;
        this.redis = redis;
        this.logCollection = logCollection;
    }
    async getOverview(date) {
        const dateStr = typeof date === 'string' ? date : this.formatDate(date);
        const rows = await this.dataSource.query(`SELECT * FROM daily_stats WHERE date = ? LIMIT 1`, [dateStr]);
        if (rows.length > 0) {
            return rows[0];
        }
        try {
            await this.logCollection.aggregateDailyStats(dateStr);
        }
        catch (e) {
            this.logger.warn?.(`回退聚合失败: ${e.message}`);
        }
        const rows2 = await this.dataSource.query(`SELECT * FROM daily_stats WHERE date = ? LIMIT 1`, [dateStr]);
        return rows2[0] || { date: dateStr, dau: 0, newUsers: 0, totalUsers: 0, totalCalls: 0 };
    }
    async getTrends(metric, granularity, startDate, endDate) {
        const allowed = [
            'dau', 'new_users', 'total_users', 'total_calls',
            'total_revenue', 'total_consumed', 'avg_order_value', 'online_users',
        ];
        const column = allowed.includes(metric) ? metric : 'dau';
        const rows = await this.dataSource.query(`SELECT date, ${column} AS value FROM daily_stats
       WHERE date BETWEEN ? AND ? ORDER BY date ASC`, [startDate, endDate]);
        void granularity;
        return rows.map((r) => ({ date: String(r.date), value: Number(r.value) }));
    }
    async getRankings(type, period) {
        const { start, end } = this.periodRange(period);
        try {
            switch (type) {
                case 'agent':
                    return await this.dataSource.query(`SELECT a.id, a.name, COUNT(l.id) AS count
             FROM agents a LEFT JOIN agent_call_logs l ON l.agent_id = a.id
             WHERE l.created_at IS NULL OR l.created_at BETWEEN ? AND ?
             GROUP BY a.id, a.name ORDER BY count DESC LIMIT 20`, [start, end]);
                case 'model':
                    return await this.dataSource.query(`SELECT id, name, 0 AS count FROM models ORDER BY id ASC LIMIT 20`);
                case 'plugin':
                    return await this.dataSource.query(`SELECT id, name, 0 AS count FROM plugins ORDER BY id ASC LIMIT 20`);
                case 'workflow':
                    return await this.dataSource.query(`SELECT id, name, 0 AS count FROM workflows ORDER BY id ASC LIMIT 20`);
                default:
                    return [];
            }
        }
        catch (e) {
            this.logger.warn?.(`排行榜查询跳过: ${e.message}`);
            return [];
        }
    }
    async getRetention(period) {
        const { start, end } = this.periodRange(period);
        try {
            const rows = await this.dataSource.query(`SELECT DATE_FORMAT(created_at, '%Y-%u') AS cohort, COUNT(*) AS users
         FROM users WHERE created_at BETWEEN ? AND ?
         GROUP BY cohort ORDER BY cohort ASC`, [start, end]);
            return rows.map((r) => ({
                cohort: String(r.cohort),
                users: Number(r.users),
            }));
        }
        catch (e) {
            this.logger.warn?.(`留存查询跳过: ${e.message}`);
            return [];
        }
    }
    async getRealtime() {
        let onlineUsers = 0;
        try {
            const v = await this.redis.get('stats:online_users');
            onlineUsers = v ? Number(v) : 0;
        }
        catch {
            onlineUsers = 0;
        }
        let callsLastMinute = 0;
        try {
            const c = await this.redis.get('stats:calls_last_minute');
            callsLastMinute = c ? Number(c) : 0;
        }
        catch {
            callsLastMinute = 0;
        }
        return { onlineUsers, callsLastMinute };
    }
    async getToday() {
        const today = this.formatDate(new Date());
        return this.getOverview(today);
    }
    formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    periodRange(period) {
        const end = new Date();
        const start = new Date();
        switch (period) {
            case '7d':
                start.setDate(start.getDate() - 7);
                break;
            case '30d':
                start.setDate(start.getDate() - 30);
                break;
            case '90d':
                start.setDate(start.getDate() - 90);
                break;
            default:
                start.setDate(start.getDate() - 7);
        }
        return {
            start: this.formatDate(start) + ' 00:00:00',
            end: this.formatDate(end) + ' 23:59:59',
        };
    }
};
exports.DashboardStatsService = DashboardStatsService;
exports.DashboardStatsService = DashboardStatsService = DashboardStatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        redis_service_1.RedisService,
        log_collection_service_1.LogCollectionService])
], DashboardStatsService);
//# sourceMappingURL=dashboard-stats.service.js.map