import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

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

  /** 是否官方知识库（管理后台创建，userId=0） */
  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  /** 所属行业分类 ID（官方库） */
  @Index()
  @Column({ name: 'industry_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  industryId?: number;

  /** 引擎侧（MaxKB）数据集 ID */
  @Column({ name: 'engine_kb_id', length: 64, nullable: true })
  engineKbId?: string;

  /** 发布状态：draft / published / unpublished */
  @Column({ name: 'publish_status', length: 16, default: 'draft' })
  publishStatus: string;
}
