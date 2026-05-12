import {
  Body,
  Controller,
  Delete,
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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('store/products')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.listForStore(req.store.id, {
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  async create(
    @Req() req: Request & { store: Store },
    @Body() dto: CreateProductDto,
  ) {
    const product = await this.products.createForStore(req.store.id, dto);
    return { product };
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.products.updateForStore(req.store.id, id, dto);
    return { product };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request & { store: Store }, @Param('id') id: string) {
    await this.products.deleteForStore(req.store.id, id);
  }
}
