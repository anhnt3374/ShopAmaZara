import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';

@Controller('store')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreMeController {
  @Get('me')
  me(@Req() req: Request & { store: Store }) {
    return { store: req.store };
  }
}
