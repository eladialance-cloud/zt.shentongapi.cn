import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('knowledge_bases')
export class KnowledgeBaseEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['private', 'public'],
    default: 'private',
  })
  visibility: 'private' | 'public';

  @Index()
  @Column({
    type: 'enum',
    enum: [
      'active',
      'processing',
      'reindexing',
      'error',
      'deleting',
      'delete_failed',
    ],
    default: 'active',
  })
  status:
    | 'active'
    | 'processing'
    | 'reindexing'
    | 'error'
    | 'deleting'
    | 'delete_failed';

  @Column({ name: 'embedding_model', length: 64, default: 'text-embedding-ada-002' })
  embeddingModel: string;

  @Column({ name: 'chunk_size', type: 'int', default: 1000 })
  chunkSize: number;

  @Column({ name: 'chunk_overlap', type: 'int', default: 200 })
  chunkOverlap: number;

  @Column({ name: 'document_count', type: 'int', default: 0 })
  documentCount: number;

  @Column({ name: 'total_chunks', type: 'int', default: 0 })
  totalChunks: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens: number;
}
