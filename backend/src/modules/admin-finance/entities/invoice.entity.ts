import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type InvoiceStatus = 'pending' | 'issued' | 'rejected';
export type InvoiceType = 'personal' | 'enterprise';

/**
 * 发票申请实体
 * 数据合同真源：Task 24 - 积分财务管理
 */
@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index({ unique: true })
  @Column({ name: 'apply_no', length: 64 })
  applyNo: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'order_no', length: 64 })
  orderNo: string;

  @Column({ name: 'invoice_type', length: 16, default: 'personal' })
  invoiceType: InvoiceType;

  @Column({ length: 256 })
  title: string;

  @Column({ name: 'tax_no', length: 64, nullable: true })
  taxNo?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Index()
  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  status: InvoiceStatus;

  @Column({ name: 'invoice_number', length: 128, nullable: true })
  invoiceNumber?: string;

  @Column({ name: 'invoice_url', length: 512, nullable: true })
  invoiceUrl?: string;

  @Column({ name: 'reject_reason', length: 512, nullable: true })
  rejectReason?: string;

  @Column({ name: 'issued_at', type: 'datetime', nullable: true })
  issuedAt?: Date;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
