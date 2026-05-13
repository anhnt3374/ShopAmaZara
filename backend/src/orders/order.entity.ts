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

export type OrderStatus = 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled';
export type ShippingMethod = 'Standard' | 'Express';
export type PaymentMethod = 'card' | 'ewallet' | 'bank';

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
    enum: ['Paid', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Paid',
  })
  status!: OrderStatus;

  @Column({
    name: 'shipping_method',
    type: 'enum',
    enum: ['Standard', 'Express'],
    default: 'Standard',
  })
  shippingMethod!: ShippingMethod;

  @Column({ name: 'shipping_recipient', type: 'varchar', length: 255, default: '' })
  shippingRecipient!: string;

  @Column({ name: 'shipping_phone', type: 'varchar', length: 32, default: '' })
  shippingPhone!: string;

  @Column({ name: 'shipping_line1', type: 'varchar', length: 255, default: '' })
  shippingLine1!: string;

  @Column({ name: 'shipping_line2', type: 'varchar', length: 255, nullable: true })
  shippingLine2!: string | null;

  @Column({ name: 'shipping_city', type: 'varchar', length: 128, default: '' })
  shippingCity!: string;

  @Column({ name: 'shipping_region', type: 'varchar', length: 128, default: '' })
  shippingRegion!: string;

  @Column({ name: 'shipping_postal', type: 'varchar', length: 32, default: '' })
  shippingPostal!: string;

  @Column({ name: 'shipping_country', type: 'varchar', length: 128, default: '' })
  shippingCountry!: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: ['card', 'ewallet', 'bank'],
    default: 'card',
  })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'payment_last4', type: 'varchar', length: 4, nullable: true })
  paymentLast4!: string | null;

  @Column({ name: 'payment_txn_id', type: 'varchar', length: 64, default: '' })
  paymentTxnId!: string;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'shipped_at', type: 'timestamp', nullable: true })
  shippedAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: true })
  items?: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
