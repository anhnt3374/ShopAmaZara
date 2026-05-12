import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity({ name: 'order_items' })
@Index('idx_order_items_store', ['storeId'])
@Index('idx_order_items_order', ['orderId'])
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({ name: 'store_id', type: 'char', length: 36 })
  storeId!: string;

  @Column({ name: 'name_snapshot', type: 'varchar', length: 255 })
  nameSnapshot!: string;

  @Column({ name: 'price_snapshot', type: 'decimal', precision: 10, scale: 2 })
  priceSnapshot!: string;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;
}
