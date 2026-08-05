import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseEntity } from '../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../knowledge/entities/knowledge-base-document.entity';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';
import { UserKbDownloadEntity } from '../knowledge/entities/user-kb-download.entity';
import { KnowledgeEngineClient } from './engine-client.interface';
import { MaxkbClient } from './maxkb.client';
import { KnowledgeEngineService } from './knowledge-engine.service';
import { OfficialKnowledgeController } from './official-knowledge.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeBaseDocumentEntity,
      IndustryCategoryEntity,
      UserKbDownloadEntity,
    ]),
  ],
  controllers: [OfficialKnowledgeController],
  providers: [
    {
      provide: KnowledgeEngineClient,
      useClass: MaxkbClient,
    },
    KnowledgeEngineService,
  ],
  exports: [KnowledgeEngineService],
})
export class KnowledgeEngineModule {}
