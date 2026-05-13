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
import { ChatsService } from './chats.service';
import { ChatsGateway } from './chats.gateway';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('me/chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly gateway: ChatsGateway,
  ) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.chats.listForBuyer(req.user.id).then((items) => ({ items }));
  }

  @Post('system')
  @HttpCode(201)
  async openSystem(@Req() req: Request & { user: { id: string } }) {
    const c = await this.chats.ensureSystem(req.user.id);
    return { conversation: this.toJson(c) };
  }

  @Post('store/:storeId')
  @HttpCode(201)
  async openStore(
    @Req() req: Request & { user: { id: string } },
    @Param('storeId') storeId: string,
  ) {
    const c = await this.chats.ensureStore(req.user.id, storeId);
    return { conversation: this.toJson(c) };
  }

  @Get(':id/messages')
  async messages(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chats.listBuyerMessages(req.user.id, id, {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  @HttpCode(201)
  async send(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chats.sendBuyerMessage(req.user.id, id, dto.body);
    this.gateway.fanOutMessages(result);
    return { messages: result.messages };
  }

  @Patch(':id/read')
  @HttpCode(200)
  async read(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    const out = await this.chats.markRead(id, { party: 'buyer', userId: req.user.id });
    this.gateway.fanOutRead(out.conversation, 'buyer', out.at);
    return { at: out.at };
  }

  private toJson(c: any) {
    return {
      id: String(c.id),
      kind: c.kind,
      storeId: c.storeId,
      buyerId: c.buyerId,
      updatedAt: c.updatedAt,
    };
  }
}
