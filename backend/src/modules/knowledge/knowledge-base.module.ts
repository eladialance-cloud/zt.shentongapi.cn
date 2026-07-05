import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseEntity } from './entities/knowledge-base.entity';
import { KnowledgeBaseChunkEntity } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocumentEntity } from './entities/knowledge-base-document.entity';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { KnowledgeBaseService } from './services/knowledge-base.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeBaseChunkEntity,
      KnowledgeBaseDocumentEntity,
    ]),
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
