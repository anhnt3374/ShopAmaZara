import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { ProductsService } from './products.service';

@Controller('store/inventory')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreInventoryController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('q') q?: string,
  ) {
    return this.products.inventoryForStore(req.store.id, q);
  }
}
