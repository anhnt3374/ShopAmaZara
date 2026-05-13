import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export type SenderKind = 'buyer' | 'store' | 'system';

@Entity({ name: 'messages' })
@Index('idx_messages_conversation', ['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'conversation_id', type: 'bigint', unsigned: true })
  conversationId!: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  @Column({ name: 'sender_kind', type: 'enum', enum: ['buyer', 'store', 'system'] })
  senderKind!: SenderKind;

  @Column({ name: 'sender_id', type: 'varchar', length: 64, default: '' })
  senderId!: string;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
