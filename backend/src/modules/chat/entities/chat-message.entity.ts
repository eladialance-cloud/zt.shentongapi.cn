import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_chat_messages_session_id')
  @Column({ name: 'session_id', type: 'bigint' })
  sessionId: number;

  @Column({
    type: 'enum',
    enum: ['user', 'assistant', 'system', 'tool'],
  })
  role: 'user' | 'assistant' | 'system' | 'tool';

  @Column({ type: 'mediumtext' })
  content: string;

  @Column({ name: 'tool_calls', type: 'json', nullable: true })
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }>;

  @Column({ name: 'token_usage', type: 'json', nullable: true })
  tokenUsage?: { input: number; output: number; total: number };

  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  @Column({ type: 'json', nullable: true })
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    size: number;
  }>;

  @Index('idx_chat_messages_created_at')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
