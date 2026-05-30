import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Conversation, ConversationKind } from './conversation.entity';
import { Message, SenderKind } from './message.entity';
import { Store } from '../stores/store.entity';
import { AiService } from '../ai/ai.service';

export interface SendResult {
  conversation: Conversation;
  messages: Message[];
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  storeId: string | null;
  buyerId: string;
  lastMessage: { body: string | null; senderKind: SenderKind; createdAt: Date } | null;
  unread: number;
  lastReadAt: Date | null;
  updatedAt: Date;
}

@Injectable()
export class ChatsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(Store)
    private readonly stores: Repository<Store>,
    @Inject(forwardRef(() => AiService))
    private readonly ai: AiService,
  ) {}

  async ensureSystem(buyerId: string): Promise<Conversation> {
    // Get-or-create must not race: concurrent opens (React StrictMode
    // double-mount, multiple tabs/devices) would otherwise each read "none
    // found" and insert, splitting the assistant chat into duplicates. There
    // is no DB unique constraint that can cover system rows (store_id is NULL
    // and MySQL treats NULLs as distinct), so we serialize per buyer with a
    // named advisory lock held on a single dedicated connection.
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    const lockName = `amazara:sys:${buyerId}`;
    try {
      await runner.query('SELECT GET_LOCK(?, 10)', [lockName]);
      // Autocommit reads/writes on this connection so the second caller sees
      // the first caller's committed row instead of a stale snapshot.
      const existing = await runner.manager.findOne(Conversation, {
        where: { buyerId, kind: 'system' },
        order: { id: 'ASC' },
      });
      if (existing) return existing;
      const entity = runner.manager.create(Conversation, {
        kind: 'system',
        buyerId,
        storeId: null,
      });
      return await runner.manager.save(entity);
    } finally {
      await runner.query('SELECT RELEASE_LOCK(?)', [lockName]);
      await runner.release();
    }
  }

  async ensureStore(buyerId: string, storeId: string): Promise<Conversation> {
    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found');
    return this.ds.transaction(async (m) => {
      const existing = await m.findOne(Conversation, {
        where: { buyerId, kind: 'store', storeId },
      });
      if (existing) return existing;
      const entity = m.create(Conversation, {
        kind: 'store',
        buyerId,
        storeId,
      });
      return m.save(entity);
    });
  }

  async listForBuyer(buyerId: string): Promise<ConversationSummary[]> {
    const rows = await this.conversations.find({
      where: { buyerId },
      order: { updatedAt: 'DESC' },
    });
    return Promise.all(rows.map((c) => this.toSummary(c, 'buyer')));
  }

  async listForStore(storeId: string): Promise<ConversationSummary[]> {
    const rows = await this.conversations.find({
      where: { storeId, kind: 'store' },
      order: { updatedAt: 'DESC' },
    });
    return Promise.all(rows.map((c) => this.toSummary(c, 'store')));
  }

  async listBuyerMessages(
    buyerId: string,
    conversationId: string,
    opts: { before?: string; limit?: number } = {},
  ) {
    const convo = await this.requireBuyerOwned(buyerId, conversationId);
    return this.loadMessages(convo.id, opts);
  }

  async listStoreMessages(
    storeId: string,
    conversationId: string,
    opts: { before?: string; limit?: number } = {},
  ) {
    const convo = await this.requireStoreOwned(storeId, conversationId);
    return this.loadMessages(convo.id, opts);
  }

  async sendBuyerMessage(
    buyerId: string,
    conversationId: string,
    body: string,
  ): Promise<SendResult> {
    const result = await this.ds.transaction(async (m) => {
      const convo = await m.findOne(Conversation, { where: { id: conversationId } });
      if (!convo) throw new NotFoundException('Conversation not found');
      if (convo.buyerId !== buyerId) throw new ForbiddenException('Not your chat');
      const trimmed = body.trim();
      const buyerMsg = await m.save(
        m.create(Message, {
          conversationId: convo.id,
          senderKind: 'buyer',
          senderId: buyerId,
          body: trimmed,
        }),
      );
      await m.update(Conversation, { id: convo.id }, { updatedAt: new Date() });
      return {
        conversation: convo,
        messages: [buyerMsg as Message],
        trimmed,
      };
    });
    if (result.conversation.kind === 'system') {
      queueMicrotask(() => {
        this.ai
          .respond(buyerId, result.conversation, result.trimmed)
          .catch((e) => {
            // logging happens inside AiService; swallow here to keep the
            // fire-and-forget contract from leaking errors to the HTTP path.
            void e;
          });
      });
    }
    return { conversation: result.conversation, messages: result.messages };
  }

  async sendStoreMessage(
    storeId: string,
    conversationId: string,
    body: string,
  ): Promise<SendResult> {
    return this.ds.transaction(async (m) => {
      const convo = await m.findOne(Conversation, { where: { id: conversationId } });
      if (!convo) throw new NotFoundException('Conversation not found');
      if (convo.kind !== 'store' || convo.storeId !== storeId)
        throw new ForbiddenException('Not your chat');
      const msg = await m.save(
        m.create(Message, {
          conversationId: convo.id,
          senderKind: 'store',
          senderId: storeId,
          body: body.trim(),
        }),
      );
      await m.update(Conversation, { id: convo.id }, { updatedAt: new Date() });
      return { conversation: convo, messages: [msg as Message] };
    });
  }

  async loadRecentMessages(
    conversationId: string,
    limit: number,
  ): Promise<Message[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { id: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }

  async appendBotMessage(
    conversationId: string,
    body: string,
    contentBlocks: unknown[] | null,
  ): Promise<Message> {
    return this.ds.transaction(async (m) => {
      const saved = await m.save(
        m.create(Message, {
          conversationId,
          senderKind: 'system',
          senderId: '',
          body,
          contentBlocks,
        }),
      );
      await m.update(Conversation, { id: conversationId }, { updatedAt: new Date() });
      return saved as Message;
    });
  }

  async markRead(
    conversationId: string,
    party: { party: 'buyer'; userId: string } | { party: 'store'; storeId: string },
  ): Promise<{ conversation: Conversation; at: Date }> {
    return this.ds.transaction(async (m) => {
      const convo = await m.findOne(Conversation, { where: { id: conversationId } });
      if (!convo) throw new NotFoundException('Conversation not found');
      if (party.party === 'buyer') {
        if (convo.buyerId !== party.userId) throw new ForbiddenException('Not your chat');
        const at = new Date();
        await m.update(Conversation, { id: convo.id }, { buyerLastReadAt: at });
        return { conversation: convo, at };
      }
      if (convo.kind !== 'store' || convo.storeId !== party.storeId)
        throw new ForbiddenException('Not your chat');
      const at = new Date();
      await m.update(Conversation, { id: convo.id }, { storeLastReadAt: at });
      return { conversation: convo, at };
    });
  }

  private async requireBuyerOwned(buyerId: string, id: string) {
    const c = await this.conversations.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    if (c.buyerId !== buyerId) throw new ForbiddenException('Not your chat');
    return c;
  }

  private async requireStoreOwned(storeId: string, id: string) {
    const c = await this.conversations.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    if (c.kind !== 'store' || c.storeId !== storeId)
      throw new ForbiddenException('Not your chat');
    return c;
  }

  private async loadMessages(
    conversationId: string,
    opts: { before?: string; limit?: number },
  ) {
    const limit = Math.min(opts.limit ?? 50, 100);
    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.conversation_id = :cid', { cid: conversationId })
      .orderBy('m.id', 'DESC')
      .take(limit);
    if (opts.before) qb.andWhere('m.id < :before', { before: opts.before });
    const rows = await qb.getMany();
    return { items: rows.reverse() };
  }

  private async toSummary(
    c: Conversation,
    viewer: 'buyer' | 'store',
  ): Promise<ConversationSummary> {
    const [last] = await this.messages.find({
      where: { conversationId: c.id },
      order: { id: 'DESC' },
      take: 1,
    });
    const lastReadAt =
      viewer === 'buyer' ? c.buyerLastReadAt : c.storeLastReadAt;
    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.conversation_id = :cid', { cid: c.id })
      .andWhere('m.sender_kind != :own', { own: viewer });
    if (lastReadAt) qb.andWhere('m.created_at > :since', { since: lastReadAt });
    const unreadCount = await qb.getCount();
    return {
      id: String(c.id),
      kind: c.kind,
      storeId: c.storeId,
      buyerId: c.buyerId,
      lastMessage: last
        ? {
            body: last.body,
            senderKind: last.senderKind,
            createdAt: last.createdAt,
          }
        : null,
      unread: unreadCount,
      lastReadAt: lastReadAt ?? null,
      updatedAt: c.updatedAt,
    };
  }
}
