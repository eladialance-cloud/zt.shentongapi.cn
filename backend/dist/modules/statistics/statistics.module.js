"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatisticsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const daily_stats_entity_1 = require("./entities/daily-stats.entity");
const statistics_controller_1 = require("./controllers/statistics.controller");
const statistics_service_1 = require("./services/statistics.service");
const log_collection_service_1 = require("./services/log-collection.service");
const dashboard_stats_service_1 = require("./services/dashboard-stats.service");
let StatisticsModule = class StatisticsModule {
};
exports.StatisticsModule = StatisticsModule;
exports.StatisticsModule = StatisticsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([daily_stats_entity_1.DailyStatsEntity])],
        controllers: [statistics_controller_1.StatisticsController, statistics_controller_1.AdminStatisticsController],
        providers: [statistics_service_1.StatisticsService, log_collection_service_1.LogCollectionService, dashboard_stats_service_1.DashboardStatsService],
        exports: [statistics_service_1.StatisticsService, log_collection_service_1.LogCollectionService, dashboard_stats_service_1.DashboardStatsService],
    })
], StatisticsModule);
//# sourceMappingURL=statistics.module.js.map