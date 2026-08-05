import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseEntity } from '../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../knowledge/entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../knowledge/entities/knowledge-base-chunk.entity';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';
import { FileEntity } from '../file/entities/file.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { KnowledgeEngineModule } from '../knowledge-engine/knowledge-engine.module';
import { AdminIndustryController } from './admin-industry.controller';
import { AdminKnowledgeController } from './admin-knowledge.controller';
import { IndustryService } from './industry.service';
import { AdminKnowledgeService } from './admin-knowledge.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeBaseDocumentEntity,
      KnowledgeBaseChunkEntity,
      IndustryCategoryEntity,
      FileEntity,
    ]),
    AdminAuthModule,
    KnowledgeEngineModule,
  ],
  controllers: [AdminIndustryController, AdminKnowledgeController],
  providers: [IndustryService, AdminKnowledgeService],
  exports: [IndustryService, AdminKnowledgeService],
})
export class AdminKnowledgeModule {}
