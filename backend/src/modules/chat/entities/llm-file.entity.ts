import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

const idColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 用户经 llm-proxy 上传到上游的文件映射（qwen-long 两步式等专用文本模型）
 * 作用：1) chat 请求中的 file id 归属校验；2) 审计上传来源模型。
 */
@Entity('llm_files')
export class LlmFileEntity {
  @PrimaryGeneratedColumn(idColumnOptions)
  id: number;

  @Index('idx_llm_files_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  /** 上游返回的文件 ID（如 file-fe-xxxx），chat 请求原样回传 */
  @Column({ name: 'upstream_file_id', length: 128 })
  upstreamFileId: string;

  @Column({ name: 'file_name', length: 255, nullable: true })
  fileName?: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}