import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type BehaviorEventType =
  | 'purchase'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'add_to_wishlist'
  | 'remove_wishlist'
  | 'review'
  | 'view';

@Entity({ name: 'user_product_events' })
@Index('idx_upe_user_product', ['userId', 'productId'])
@Index('idx_upe_user_product_type', ['userId', 'productId', 'type'])
export class UserProductEvent {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({
    type: 'enum',
    enum: ['purchase', 'add_to_cart', 'remove_from_cart', 'add_to_wishlist', 'remove_wishlist', 'review', 'view'],
  })
  type!: BehaviorEventType;

  @Column({ type: 'tinyint' })
  weight!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
