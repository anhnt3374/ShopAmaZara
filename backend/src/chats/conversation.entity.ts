import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Message } from './message.entity';

export type ConversationKind = 'system' | 'store';

@Entity({ name: 'conversations' })
@Index('idx_conversations_buyer', ['buyerId'])
@Index('idx_conversations_store', ['storeId'])
export class Conversation {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'enum', enum: ['system', 'store'] })
  kind!: ConversationKind;

  @Column({ name: 'buyer_id', type: 'bigint', unsigned: true })
  buyerId!: string;

  @Column({ name: 'store_id', type: 'char', length: 36, nullable: true })
  storeId!: string | null;

  @Column({ name: 'buyer_last_read_at', type: 'timestamp', nullable: true })
  buyerLastReadAt!: Date | null;

  @Column({ name: 'store_last_read_at', type: 'timestamp', nullable: true })
  storeLastReadAt!: Date | null;

  @OneToMany(() => Message, (m) => m.conversation, { cascade: true })
  messages?: Message[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
