import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canUserReview(userId: string, productId: string): Promise<boolean> {
    const count = await this.orderItems
      .createQueryBuilder('oi')
      .innerJoin('orders', 'o', 'o.id = oi.order_id')
      .where('oi.product_id = :productId', { productId })
      .andWhere('o.buyer_id = :userId', { userId })
      .andWhere("o.status = 'Delivered'")
      .getCount();
    return count > 0;
  }
}
