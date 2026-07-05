import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('knowledge_base_chunks')
export class KnowledgeBaseChunkEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_knowledge_base_chunks_document_id')
  @Column({ name: 'document_id', type: 'bigint' })
  documentId: number;

  @Index('idx_knowledge_base_chunks_kb_id')
  @Column({ name: 'knowledge_base_id', type: 'bigint' })
  knowledgeBaseId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'chunk_index', type: 'int' })
  chunkIndex: number;

  @Column({ name: 'token_count', type: 'int' })
  tokenCount: number;

  @Column({ name: 'embedding_id', length: 64 })
  embeddingId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
