import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('store/orders')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.orders.listForStore(req.store.id, { status, q });
  }

  @Patch(':id')
  update(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatusForStore(req.store.id, id, dto.status);
  }
}
