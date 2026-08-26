import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAssetEntity } from './entities/media-asset.entity';
import { MediaAssetController } from './controllers/media-asset.controller';
import { MediaAssetService } from './services/media-asset.service';
import { TaskOutputItemEntity } from '../task/entities/task-output-item.entity';
import { MediaJobEntity } from '../media-generation/entities/media-job.entity';
import { AgentTaskEntity } from '../task/entities/agent-task.entity';
import { PublishPlanEntity } from '../channel/entities/publish-plan.entity';
import { MaterialSearchService } from './services/material-search.service';
import { CommonModule } from '../../common/common.module';
import { OralWorkshopModule } from '../oral-workshop/oral-workshop.module';

/**
 * 素材资产模块
 * 提供素材库的手动登记、列表查询、导入（task_output_item / media_jobs）与更新
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MediaAssetEntity,
      TaskOutputItemEntity,
      MediaJobEntity,
      AgentTaskEntity,
      PublishPlanEntity,
    ]),
    CommonModule,
    forwardRef(() => OralWorkshopModule),
  ],
  controllers: [MediaAssetController],
  providers: [MediaAssetService, MaterialSearchService],
  exports: [MediaAssetService, MaterialSearchService],
})
export class MediaAssetsModule {}