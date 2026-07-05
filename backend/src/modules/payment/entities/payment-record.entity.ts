import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('payment_records')
export class PaymentRecordEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index({ unique: true })
  @Column({ name: 'order_no', length: 64 })
  orderNo: string;

  @Column({
    type: 'enum',
    enum: ['wechat', 'alipay', 'stripe'],
  })
  channel: 'wechat' | 'alipay' | 'stripe';

  @Column({ name: 'sub_method', length: 32, nullable: true })
  subMethod?: 'native' | 'jsapi' | 'pc' | 'wap' | 'card';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 8, default: 'CNY' })
  currency: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'paid', 'failed', 'refunded', 'refunding'],
    default: 'pending',
  })
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'refunding';

  @Index()
  @Column({ name: 'payment_txn_id', length: 128, nullable: true })
  paymentTxnId?: string;

  @Column({ name: 'pay_params', type: 'json', nullable: true })
  payParams?: Record<string, unknown>;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt?: Date;

  @Column({ name: 'refund_txn_id', length: 128, nullable: true })
  refundTxnId?: string;

  @Column({ name: 'refund_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  refundAmount?: number;

  @Column({ name: 'refunded_at', type: 'datetime', nullable: true })
  refundedAt?: Date;

  @Column({ length: 256, nullable: true })
  description?: string;

  @Column({ name: 'callback_raw', type: 'json', nullable: true })
  callbackRaw?: Record<string, unknown>;
}
