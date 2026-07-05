import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyStatsEntity } from './entities/daily-stats.entity';
import { StatisticsController, AdminStatisticsController } from './controllers/statistics.controller';
import { StatisticsService } from './services/statistics.service';
import { LogCollectionService } from './services/log-collection.service';
import { DashboardStatsService } from './services/dashboard-stats.service';
import { CommonModule } from '../../common/common.module';

/**
 * 统计模块
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@Module({
  imports: [TypeOrmModule.forFeature([DailyStatsEntity]), CommonModule],
  controllers: [StatisticsController, AdminStatisticsController],
  providers: [StatisticsService, LogCollectionService, DashboardStatsService],
  exports: [StatisticsService, LogCollectionService, DashboardStatsService],
})
export class StatisticsModule {}
