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
exports.AdminStatisticsController = exports.StatisticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../../common/guards/roles.guard");
const statistics_service_1 = require("../services/statistics.service");
const dashboard_stats_service_1 = require("../services/dashboard-stats.service");
let StatisticsController = class StatisticsController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
};
exports.StatisticsController = StatisticsController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StatisticsController.prototype, "health", null);
exports.StatisticsController = StatisticsController = __decorate([
    (0, swagger_1.ApiTags)('统计'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('statistics'),
    __metadata("design:paramtypes", [statistics_service_1.StatisticsService])
], StatisticsController);
let AdminStatisticsController = class AdminStatisticsController {
    dashboard;
    constructor(dashboard) {
        this.dashboard = dashboard;
    }
    async overview(date) {
        return this.dashboard.getOverview(date || new Date());
    }
    async trends(metric, granularity, startDate, endDate) {
        const today = new Date();
        const end = endDate || this.fmt(today);
        const startD = new Date();
        startD.setDate(startD.getDate() - 30);
        return this.dashboard.getTrends(metric || 'dau', granularity || 'day', startDate || this.fmt(startD), end);
    }
    async rankings(type, period) {
        return this.dashboard.getRankings(type || 'agent', period || '7d');
    }
    async retention(period) {
        return this.dashboard.getRetention(period || '30d');
    }
    async realtime() {
        return this.dashboard.getRealtime();
    }
    async today() {
        return this.dashboard.getToday();
    }
    fmt(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
};
exports.AdminStatisticsController = AdminStatisticsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: '仪表盘概览' }),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('trends'),
    (0, swagger_1.ApiOperation)({ summary: '趋势分析' }),
    __param(0, (0, common_1.Query)('metric')),
    __param(1, (0, common_1.Query)('granularity')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "trends", null);
__decorate([
    (0, common_1.Get)('rankings'),
    (0, swagger_1.ApiOperation)({ summary: '排行榜' }),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "rankings", null);
__decorate([
    (0, common_1.Get)('retention'),
    (0, swagger_1.ApiOperation)({ summary: '用户留存' }),
    __param(0, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "retention", null);
__decorate([
    (0, common_1.Get)('realtime'),
    (0, swagger_1.ApiOperation)({ summary: '实时数据' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "realtime", null);
__decorate([
    (0, common_1.Get)('today'),
    (0, swagger_1.ApiOperation)({ summary: '今日概览' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminStatisticsController.prototype, "today", null);
exports.AdminStatisticsController = AdminStatisticsController = __decorate([
    (0, swagger_1.ApiTags)('统计-管理端'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/stats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    __metadata("design:paramtypes", [dashboard_stats_service_1.DashboardStatsService])
], AdminStatisticsController);
//# sourceMappingURL=statistics.controller.js.map