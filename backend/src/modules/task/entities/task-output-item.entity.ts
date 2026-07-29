import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 任务输出项实体
 * 存储任务的各类输出内容（文本、表单、图片、音频、视频）
 */
@Entity('task_output_item')
export class TaskOutputItemEntity extends BaseEntity {
  @Index()
  @Column({ name: 'task_id', type: 'bigint' })
  taskId: number;

  @Index()
  @Column({
    name: 'output_type',
    type: 'enum',
    enum: ['text', 'form', 'image', 'audio', 'video'],
    default: 'text',
  })
  outputType: 'text' | 'form' | 'image' | 'audio' | 'video';

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'content_json', type: 'json', nullable: true })
  contentJson?: Record<string, unknown>;

  @Column({ name: 'file_url', length: 512, nullable: true })
  fileUrl?: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize?: number;

  @Column({ name: 'mime_type', length: 128, nullable: true })
  mimeType?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;
}
