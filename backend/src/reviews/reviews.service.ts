import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, QueryFailedError, Repository } from 'typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { User } from '../users/user.entity';
import { ProductIndexerService } from '../search/product-indexer.service';
import { BehaviorService } from '../behavior/behavior.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { MyReviewResult, ReviewItem, ReviewListResult, ReviewSummary, toReviewItem } from './dto/review-views';
import { Review } from './review.entity';

@Injectable()
export class ReviewsService {
  private readonly indexLog = new Logger('ReviewsService:index');
  private readonly behaviorLog = new Logger('ReviewsService:behavior');

  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Optional() private readonly indexer?: ProductIndexerService,
    @Optional() private readonly behavior?: BehaviorService,
  ) {}

  private fireBehavior(fn: () => Promise<void>): void {
    if (!this.behavior) return;
    Promise.resolve()
      .then(fn)
      .catch((err) =>
        this.behaviorLog.warn(`behavior hook failed: ${err instanceof Error ? err.message : String(err)}`),
      );
  }

  private fireRefresh(productId: string): void {
    if (!this.indexer) return;
    const indexer = this.indexer;
    // Promise.resolve().then(...) so a synchronous throw is also caught — fully
    // fire-and-forget, never escapes into the request.
    Promise.resolve()
      .then(() => indexer.refreshStats(productId))
      .catch((err) =>
        this.indexLog.warn(`refreshStats failed: ${err instanceof Error ? err.message : String(err)}`),
      );
  }

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
      this.fireRefresh(productId);
      this.fireBehavior(() => this.behavior!.recordReview(userId, productId, saved.rating));
      return toReviewItem(saved, { id: user.id, fullName: user.fullName });
    } catch (err) {
      const code = (err as any)?.code ?? (err instanceof QueryFailedError ? (err.driverError as any)?.code : undefined);
      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw err;
    }
  }

  async update(id: string, userId: string, dto: UpdateReviewDto): Promise<ReviewItem> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (String(review.userId) !== String(userId)) {
      throw new ForbiddenException('You can only edit your own review');
    }
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment?.trim() || null;

    const saved = await this.reviews.save(review);
    this.fireRefresh(review.productId);
    this.fireBehavior(() => this.behavior!.recordReview(userId, review.productId, saved.rating));
    const user = await this.users.findOne({ where: { id: userId } });
    return toReviewItem(saved, { id: user!.id, fullName: user!.fullName });
  }

  async remove(id: string, userId: string): Promise<void> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (String(review.userId) !== String(userId)) {
      throw new ForbiddenException('You can only delete your own review');
    }
    await this.reviews.remove(review);
    this.fireRefresh(review.productId);
    this.fireBehavior(() => this.behavior!.removeReview(userId, review.productId));
  }

  async listForProduct(productId: string, dto: ListReviewsDto): Promise<ReviewListResult> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 10, 50);

    const qb = this.reviews.createQueryBuilder('r').andWhere('r.product_id = :productId', { productId });
    if (dto.rating !== undefined) qb.andWhere('r.rating = :rating', { rating: dto.rating });
    switch (dto.sort) {
      case 'highest':
        qb.orderBy('r.rating', 'DESC').addOrderBy('r.created_at', 'DESC');
        break;
      case 'lowest':
        qb.orderBy('r.rating', 'ASC').addOrderBy('r.created_at', 'DESC');
        break;
      default:
        qb.orderBy('r.created_at', 'DESC');
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();

    // Summary is always product-wide (not affected by dto.rating filter)
    // so the UI can show overall rating alongside a filtered list.
    const summary = await this.summaryForProduct(productId);

    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const usersList = userIds.length
      ? await this.users.find({ where: { id: In(userIds) } })
      : [];
    const userById = new Map(usersList.map((u) => [String(u.id), u]));

    const items = rows.map((r) => {
      const u = userById.get(String(r.userId));
      return toReviewItem(r, { id: u?.id ?? r.userId, fullName: u?.fullName ?? 'Unknown' });
    });

    return { items, total, page, limit, summary };
  }

  async myReviewForProduct(userId: string, productId: string): Promise<MyReviewResult> {
    const existing = await this.reviews.findOne({ where: { productId, userId } });
    if (existing) {
      const user = await this.users.findOne({ where: { id: userId } });
      return {
        review: toReviewItem(existing, {
          id: user?.id ?? existing.userId,
          fullName: user?.fullName ?? 'Unknown',
        }),
        canReview: false,
      };
    }
    const eligible = await this.canUserReview(userId, productId);
    return { review: null, canReview: eligible };
  }

  private async summaryForProduct(productId: string): Promise<ReviewSummary> {
    const rows = await this.reviews
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.product_id = :productId', { productId })
      .groupBy('r.rating')
      .getRawMany<{ rating: string | number; cnt: string }>();

    const breakdown: ReviewSummary['breakdown'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const r = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const c = Number(row.cnt);
      breakdown[String(r) as '1'] = c;
      total += c;
      weighted += r * c;
    }
    return {
      average: total ? Math.round((weighted / total) * 10) / 10 : 0,
      count: total,
      breakdown,
    };
  }
}
