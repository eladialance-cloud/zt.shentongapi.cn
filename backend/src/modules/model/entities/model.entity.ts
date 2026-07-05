import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('models')
export class ModelEntity extends BaseEntity {
  @Index()
  @Column({ length: 64 })
  provider: string;

  @Index({ unique: true })
  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: 'context_window', type: 'int', nullable: true })
  contextWindow?: number;

  @Column({ name: 'max_tokens', type: 'int', nullable: true })
  maxTokens?: number;

  @Column({ name: 'supports_vision', type: 'boolean', default: false })
  supportsVision: boolean;

  @Column({ name: 'supports_functions', type: 'boolean', default: false })
  supportsFunctions: boolean;

  @Column({
    name: 'price_per_1k_input',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricePer1kInput?: number;

  @Column({
    name: 'price_per_1k_output',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricePer1kOutput?: number;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
