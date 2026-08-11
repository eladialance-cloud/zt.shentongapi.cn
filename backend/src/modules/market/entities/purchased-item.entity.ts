import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/** 市场已购清单（官方内容购买记录，换机可重下） */
export type MarketItemType = 'skill' | 'plugin' | 'workflow' | 'agent' | 'mcp';

@Entity('purchased_items')
export class PurchasedItemEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'item_type', length: 16 })
  itemType: MarketItemType;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId: number;

  @Column({ length: 32, default: '1.0.0' })
  version: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
