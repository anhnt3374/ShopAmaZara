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
import { UserAddress } from '../addresses/address.entity';
import { BehaviorModule } from '../behavior/behavior.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product, UserAddress]),
    StoresModule,
    BehaviorModule,
  ],
  controllers: [OrdersController, StoreOrdersController],
  providers: [OrdersService, SellerStoreGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
