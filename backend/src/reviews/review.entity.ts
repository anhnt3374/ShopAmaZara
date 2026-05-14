import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'reviews' })
@Index('idx_reviews_product_created', ['productId', 'createdAt'])
@Index('idx_reviews_user', ['userId'])
@Index('uniq_reviews_product_user', ['productId', 'userId'], { unique: true })
export class Review {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ type: 'tinyint', unsigned: true })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
