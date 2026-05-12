import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
