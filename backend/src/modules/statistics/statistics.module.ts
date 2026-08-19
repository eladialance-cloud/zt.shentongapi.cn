import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyStatsEntity } from './entities/daily-stats.entity';
import { PublishPlanEntity } from '../channel/entities/publish-plan.entity';
import { AgentTaskEntity } from '../task/entities/agent-task.entity';
import { TeamTaskEntity } from '../team/entities/team-task.entity';
import { MediaAssetEntity } from '../media-assets/entities/media-asset.entity';
import { StatisticsController, AdminStatisticsController } from './controllers/statistics.controller';
import { StatisticsService } from './services/statistics.service';
import { LogCollectionService } from './services/log-collection.service';
import { DashboardStatsService } from './services/dashboard-stats.service';
import { CommonModule } from '../../common/common.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

/**
 * 统计模块
 * 数据合同真源：Task 33 - 统计报表数据源
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyStatsEntity,
      PublishPlanEntity,
      AgentTaskEntity,
      TeamTaskEntity,
      MediaAssetEntity,
    ]),
    CommonModule,
    AdminAuthModule,
  ],
  controllers: [StatisticsController, AdminStatisticsController],
  providers: [StatisticsService, LogCollectionService, DashboardStatsService],
  exports: [StatisticsService, LogCollectionService, DashboardStatsService],
})
export class StatisticsModule {}
