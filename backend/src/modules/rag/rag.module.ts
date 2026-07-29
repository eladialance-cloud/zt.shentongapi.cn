import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagDocumentEntity } from './entities/rag-document.entity';
import { RagController } from './controllers/rag.controller';
import { RagService } from './services/rag.service';

@Module({
  imports: [TypeOrmModule.forFeature([RagDocumentEntity])],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
