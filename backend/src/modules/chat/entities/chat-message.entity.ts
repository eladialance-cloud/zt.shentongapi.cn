import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段,
// 但 TypeORM 运行时会透传该属性(Object.assign),故以变量形式传入绕过多余属性检查。
const idColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn(idColumnOptions)
  id: number;

  @Index('idx_chat_messages_session_id')
  @Column({ name: 'session_id', type: 'bigint', transformer: bigintTransformer })
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
