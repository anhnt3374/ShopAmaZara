import { Logger, UnauthorizedException, forwardRef, Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { StoresService } from '../stores/stores.service';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { ChatsService } from './chats.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: 'buyer' | 'seller';
}

@WebSocketGateway({
  path: '/ws/chat',
  cors: { origin: '*', credentials: false },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger('ChatsGateway');
  private readonly recentTyping = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly stores: StoresService,
    @Inject(forwardRef(() => ChatsService))
    private readonly chats: ChatsService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as
          | string
          | undefined);
      if (!token) throw new UnauthorizedException('No token');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      socket.data.userId = payload.sub;
      socket.join(`user:${payload.sub}`);
      const store = await this.stores.findByOwnerId(payload.sub);
      if (store) {
        socket.data.storeId = store.id;
        socket.join(`store:${store.id}`);
      }
    } catch (err) {
      this.log.warn(`Rejecting socket: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    for (const key of this.recentTyping.keys()) {
      if (key.startsWith(`${socket.id}:`)) this.recentTyping.delete(key);
    }
  }

  fanOutMessages(payload: { conversation: Conversation; messages: Message[] }) {
    const rooms = this.roomsFor(payload.conversation);
    for (const msg of payload.messages) {
      const out = {
        conversationId: String(payload.conversation.id),
        message: {
          id: String(msg.id),
          conversationId: String(msg.conversationId),
          senderKind: msg.senderKind,
          senderId: msg.senderId,
          body: msg.body ?? '',
          contentBlocks: msg.contentBlocks ?? null,
          createdAt: msg.createdAt,
        },
      };
      for (const r of rooms) this.server.to(r).emit('message:new', out);
    }
  }

  emitDelta(
    userId: string,
    conversationId: string,
    requestId: string,
    textDelta: string,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit('message:delta', { conversationId, requestId, textDelta });
  }

  emitDone(
    userId: string,
    conversationId: string,
    requestId: string,
    messageId: string,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit('message:done', { conversationId, requestId, messageId });
  }

  emitError(
    userId: string,
    conversationId: string,
    requestId: string,
    code: string,
    text: string,
  ) {
    this.server
      .to(`user:${userId}`)
      .emit('message:error', { conversationId, requestId, code, text });
  }

  @SubscribeMessage('message:action')
  async onAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: {
      conversationId: string;
      action: string;
      preorderId?: string;
    },
  ) {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const sentinel = `[action:${body.action}${body.preorderId ? `:${body.preorderId}` : ''}]`;
    try {
      const { conversation, messages } = await this.chats.sendBuyerMessage(
        userId,
        body.conversationId,
        sentinel,
      );
      this.fanOutMessages({ conversation, messages });
    } catch (err) {
      this.log.warn(`action ${body.action} failed: ${(err as Error).message}`);
    }
  }

  fanOutRead(conversation: Conversation, party: 'buyer' | 'store', at: Date) {
    const rooms = this.roomsFor(conversation).filter((r) =>
      party === 'buyer' ? r.startsWith('store:') : r.startsWith('user:'),
    );
    for (const r of rooms) {
      this.server.to(r).emit('read', {
        conversationId: String(conversation.id),
        party,
        at,
      });
    }
  }

  @SubscribeMessage('typing:start')
  onTypingStart(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId: string }) {
    this.forwardTyping(socket, body.conversationId, 'start');
  }

  @SubscribeMessage('typing:stop')
  onTypingStop(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId: string }) {
    this.forwardTyping(socket, body.conversationId, 'stop');
  }

  private forwardTyping(socket: Socket, conversationId: string, kind: 'start' | 'stop') {
    if (kind === 'start') {
      const key = `${socket.id}:${conversationId}`;
      const last = this.recentTyping.get(key) ?? 0;
      const now = Date.now();
      if (now - last < 1000) return;
      this.recentTyping.set(key, now);
    }
    const event = kind === 'start' ? 'typing:start' : 'typing:stop';
    if (socket.data.userId) {
      socket
        .to(`user:${socket.data.userId}`)
        .emit(event, { conversationId, party: 'buyer' });
    }
    if (socket.data.storeId) {
      socket
        .to(`store:${socket.data.storeId}`)
        .emit(event, { conversationId, party: 'store' });
    }
  }

  private roomsFor(c: Conversation): string[] {
    const rooms = [`user:${c.buyerId}`];
    if (c.kind === 'store' && c.storeId) rooms.push(`store:${c.storeId}`);
    return rooms;
  }
}
