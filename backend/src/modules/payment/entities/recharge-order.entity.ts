import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('recharge_orders')
export class RechargeOrderEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'order_no', length: 64 })
  orderNo: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'package_id', type: 'bigint', nullable: true })
  packageId?: number;

  @Column({ type: 'int' })
  credits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  })
  status: 'pending' | 'paid' | 'failed' | 'refunded';

  @Column({ name: 'payment_channel', type: 'enum', enum: ['wechat', 'alipay', 'stripe'], nullable: true })
  paymentChannel?: 'wechat' | 'alipay' | 'stripe';

  @Column({ name: 'payment_record_id', type: 'bigint', nullable: true })
  paymentRecordId?: number;
}
