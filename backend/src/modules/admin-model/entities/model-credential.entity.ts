import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';
import { ModelEntity } from '../../model/entities/model.entity';

/** 模型级连接凭据（P5 从 ai_models 拆出；api_key 为应用层 AES-256-GCM 加密值） */
@Entity('ai_model_credentials')
export class ModelCredentialEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'model_id', type: 'bigint', transformer: bigintTransformer })
  modelId: number;

  @OneToOne(() => ModelEntity, (m) => m.credentials)
  @JoinColumn({ name: 'model_id' })
  model: ModelEntity;

  /** AES 加密的 API Key（模型级直连凭据；老数据回填后原样存储，读取时尝试解密、失败按明文兜底） */
  @Column({ name: 'api_key', length: 1024, nullable: true })
  apiKey?: string;

  /** API 地址 */
  @Column({ name: 'api_endpoint', length: 512, nullable: true })
  apiEndpoint?: string;
}
