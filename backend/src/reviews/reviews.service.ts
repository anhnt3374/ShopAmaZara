import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { User } from '../users/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewItem, toReviewItem } from './dto/review-views';
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

  async create(userId: string, productId: string, dto: CreateReviewDto): Promise<ReviewItem> {
    const eligible = await this.canUserReview(userId, productId);
    if (!eligible) {
      throw new ForbiddenException('You can only review products from a delivered order');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const entity = this.reviews.create({
      id: randomUUID(),
      productId,
      userId,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
    });

    try {
      const saved = await this.reviews.save(entity);
      return toReviewItem(saved, { id: user.id, fullName: user.fullName });
    } catch (err) {
      const code = (err as any)?.code ?? (err instanceof QueryFailedError ? (err.driverError as any)?.code : undefined);
      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw err;
    }
  }
}
