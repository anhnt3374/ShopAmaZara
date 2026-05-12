import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { StoresModule } from '../stores/stores.module';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { StoreOrdersController } from './store-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product]),
    StoresModule,
  ],
  controllers: [OrdersController, StoreOrdersController],
  providers: [OrdersService, SellerStoreGuard],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
