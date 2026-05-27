import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';
import { SearchModule } from '../search/search.module';
import { BehaviorModule } from '../behavior/behavior.module';
import { ProductReviewsController } from './product-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Order, OrderItem, User]), SearchModule, BehaviorModule],
  controllers: [ProductReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService, TypeOrmModule],
})
export class ReviewsModule {}
