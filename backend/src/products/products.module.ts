import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresModule } from '../stores/stores.module';
import { SearchModule } from '../search/search.module';
import { Product } from './product.entity';
import { Review } from '../reviews/review.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StoreProductsController } from './store-products.controller';
import { StoreInventoryController } from './store-inventory.controller';
import { StoreMeController } from './store-me.controller';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { ProductsBulkService } from './products.bulk.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Review]), StoresModule, SearchModule],
  controllers: [
    ProductsController,
    StoreProductsController,
    StoreInventoryController,
    StoreMeController,
  ],
  providers: [ProductsService, SellerStoreGuard, ProductsBulkService],
  exports: [ProductsService],
})
export class ProductsModule {}
