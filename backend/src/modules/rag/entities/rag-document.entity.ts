import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * RAG 文档实体
 * 存储用户上传的文档及其分块内容，用于 RAG 检索。
 */
@Entity('rag_documents')
@Index('idx_user_doc', ['userId', 'documentId'])
export class RagDocumentEntity extends BaseEntity {
  /** 用户 ID */
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  /** 文档 ID（用户自定义标识） */
  @Column({ name: 'document_id', length: 256 })
  documentId: string;

  /** 文档标题 */
  @Column({ length: 512, nullable: true })
  title?: string;

  /** 分块索引（从 0 开始） */
  @Column({ name: 'chunk_index', type: 'int', default: 0 })
  chunkIndex: number;

  /** 分块内容 */
  @Column({ type: 'text' })
  content: string;

  /** 分块大小（字符数） */
  @Column({ name: 'chunk_size', type: 'int', default: 0 })
  chunkSize: number;

  /** 元数据（JSON） */
  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;
}
