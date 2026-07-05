import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('knowledge_base_documents')
export class KnowledgeBaseDocumentEntity extends BaseEntity {
  @Index('idx_knowledge_base_documents_kb_id')
  @Column({ name: 'knowledge_base_id', type: 'bigint' })
  knowledgeBaseId: number;

  @Column({ length: 256 })
  name: string;

  @Column({ name: 'file_path', length: 512 })
  filePath: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @Column({ name: 'mime_type', length: 128, nullable: true })
  mimeType?: string;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @Column({ name: 'token_count', type: 'int', default: 0 })
  tokenCount: number;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'done', 'error'],
    default: 'pending',
  })
  status: 'pending' | 'processing' | 'done' | 'error';

  @Column({ length: 512, nullable: true })
  error?: string;
}
