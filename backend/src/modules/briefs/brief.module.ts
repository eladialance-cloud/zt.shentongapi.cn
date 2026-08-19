import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BriefEntity } from './entities/brief.entity';
import { BriefController } from './controllers/brief.controller';
import { BriefService } from './services/brief.service';
import { BriefDispatchService } from './services/brief-dispatch.service';
import { TeamTaskEntity } from '../team/entities/team-task.entity';
import { TeamMemberEntity } from '../team/entities/team-member.entity';
import { TeamEntity } from '../team/entities/team.entity';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { CommonModule } from '../../common/common.module';

/**
 * 需求单模块
 * 提供需求单 CRUD 与状态流转（create/list/history/getOne/update/confirm/cancel）
 * confirm 接线 BriefDispatchService：AI 拆解需求单并派发 team_tasks
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BriefEntity,
      TeamTaskEntity,
      TeamMemberEntity,
      TeamEntity,
      ModelEntity,
      ModelProviderEntity,
    ]),
    CommonModule,
  ],
  controllers: [BriefController],
  providers: [BriefService, BriefDispatchService],
  exports: [BriefService],
})
export class BriefsModule {}