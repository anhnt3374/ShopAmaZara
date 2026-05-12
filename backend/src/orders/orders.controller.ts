import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders/checkout')
  @HttpCode(201)
  checkout(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(req.user.id, dto);
  }

  @Get('me/orders')
  list(@Req() req: Request & { user: { id: string } }) {
    return this.orders.listForBuyer(req.user.id);
  }

  @Get('me/orders/:id')
  findOne(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.orders.findOneForBuyer(req.user.id, id);
  }
}
