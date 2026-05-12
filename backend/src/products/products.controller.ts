import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() dto: ListProductsDto) {
    return this.products.list(dto);
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
