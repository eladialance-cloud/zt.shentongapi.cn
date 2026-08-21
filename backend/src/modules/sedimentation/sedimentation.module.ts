import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModule } from '../chat/chat.module';
import { KnowledgeBaseModule } from '../knowledge/knowledge-base.module';
import { SedimentationFeedEntity } from './entities/sedimentation-feed.entity';
import { SedimentationService } from './sedimentation.service';
import { SedimentationController } from './sedimentation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SedimentationFeedEntity]),
    ChatModule,
    KnowledgeBaseModule,
  ],
  controllers: [SedimentationController],
  providers: [SedimentationService],
  exports: [SedimentationService],
})
export class SedimentationModule {}