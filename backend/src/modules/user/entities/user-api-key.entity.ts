import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 用户 API Key 实体
 * 表 user_api_keys：服务端只存 key 的 SHA-256 哈希与展示前缀，不存明文
 */
@Entity('user_api_keys')
export class UserApiKeyEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ length: 128 })
  alias: string;

  /** 完整 key 的 SHA-256 十六进制哈希（不可逆，用于后续校验） */
  @Index({ unique: true })
  @Column({ name: 'key_hash', length: 64 })
  keyHash: string;

  /** 明文 key 前 8 位，用于列表脱敏展示 */
  @Column({ name: 'key_prefix', length: 16 })
  keyPrefix: string;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt?: Date | null;
}
