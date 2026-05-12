import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index('idx_orders_buyer')
  @Column({ name: 'buyer_id', type: 'bigint', unsigned: true })
  buyerId!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  shipping!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  tax!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: string;

  @Column({
    type: 'enum',
    enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Processing',
  })
  status!: OrderStatus;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: true })
  items?: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
