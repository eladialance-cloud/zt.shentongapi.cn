import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('payment_configs')
export class PaymentConfigEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 16 })
  channel: 'wechat' | 'alipay' | 'stripe';

  @Column({ name: 'display_name', length: 32, nullable: true })
  displayName?: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ name: 'is_mock', type: 'boolean', default: true })
  isMock: boolean;
}
