import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Query() dto: ListProductsDto, @Req() req: Request & { user?: { id: string } }) {
    return this.products.list(dto, req.user?.id);
  }

  @Get('facets')
  facets(@Query('q') q?: string) {
    return this.products.facets(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
