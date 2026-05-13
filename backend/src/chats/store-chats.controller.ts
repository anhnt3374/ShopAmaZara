import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { ChatsService } from './chats.service';
import { ChatsGateway } from './chats.gateway';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('store/chats')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly gateway: ChatsGateway,
  ) {}

  @Get()
  list(@Req() req: Request & { store: Store }) {
    return this.chats.listForStore(req.store.id).then((items) => ({ items }));
  }

  @Get(':id/messages')
  messages(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chats.listStoreMessages(req.store.id, id, {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  @HttpCode(201)
  async send(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chats.sendStoreMessage(req.store.id, id, dto.body);
    this.gateway.fanOutMessages(result);
    return { messages: result.messages };
  }

  @Patch(':id/read')
  @HttpCode(200)
  async read(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
  ) {
    const out = await this.chats.markRead(id, { party: 'store', storeId: req.store.id });
    this.gateway.fanOutRead(out.conversation, 'store', out.at);
    return { at: out.at };
  }
}
