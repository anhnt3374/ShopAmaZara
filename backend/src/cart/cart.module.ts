import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CartItem, Product])],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService, TypeOrmModule],
})
export class CartModule {}
