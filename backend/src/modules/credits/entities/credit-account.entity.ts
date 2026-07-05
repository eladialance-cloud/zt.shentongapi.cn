import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 积分账户实体
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@Entity('credit_accounts')
export class CreditAccountEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ type: 'int', default: 0 })
  balance: number;

  @Column({ name: 'frozen_balance', type: 'int', default: 0 })
  frozenBalance: number;

  @Column({ name: 'total_recharged', type: 'int', default: 0 })
  totalRecharged: number;

  @Column({ name: 'total_consumed', type: 'int', default: 0 })
  totalConsumed: number;

  /** 乐观锁版本号 */
  @Column({ type: 'int', default: 0 })
  version: number;
}
