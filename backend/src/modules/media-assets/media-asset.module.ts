import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAssetEntity } from './entities/media-asset.entity';
import { MediaAssetController } from './controllers/media-asset.controller';
import { MediaAssetService } from './services/media-asset.service';
import { TaskOutputItemEntity } from '../task/entities/task-output-item.entity';
import { MediaJobEntity } from '../media-generation/entities/media-job.entity';
import { AgentTaskEntity } from '../task/entities/agent-task.entity';

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
    ]),
  ],
  controllers: [MediaAssetController],
  providers: [MediaAssetService],
  exports: [MediaAssetService],
})
export class MediaAssetsModule {}