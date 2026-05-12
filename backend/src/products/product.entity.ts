import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TargetGender = 'men' | 'women' | 'unisex' | 'kids';

@Entity({ name: 'products' })
@Index('idx_products_store', ['storeId'])
@Index('idx_products_category', ['category'])
@Index('idx_products_brand', ['brand'])
export class Product {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  brand!: string;

  @Column({ type: 'varchar', length: 255 })
  category!: string;

  @Column({ name: 'store_id', type: 'char', length: 36 })
  storeId!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  discount!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  stock!: number;

  @Column({ name: 'image_first', type: 'text' })
  imageFirst!: string;

  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription!: string | null;

  @Column({ name: 'long_description', type: 'text', nullable: true })
  longDescription!: string | null;

  @Column({ type: 'json', nullable: true })
  highlights!: unknown;

  @Column({ type: 'json', nullable: true })
  color!: unknown;

  @Column({ name: 'available_colors', type: 'json', nullable: true })
  availableColors!: unknown;

  @Column({ name: 'available_sizes', type: 'json', nullable: true })
  availableSizes!: unknown;

  @Column({ type: 'varchar', length: 255, nullable: true })
  material!: string | null;

  @Column({
    name: 'target_gender',
    type: 'enum',
    enum: ['men', 'women', 'unisex', 'kids'],
    nullable: true,
  })
  targetGender!: TargetGender | null;

  @Column({ name: 'target_age_group', type: 'varchar', length: 64, nullable: true })
  targetAgeGroup!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
