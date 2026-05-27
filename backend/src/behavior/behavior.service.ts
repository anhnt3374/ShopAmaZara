import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { BehaviorEventType, UserProductEvent } from './behavior-event.entity';

export const WEIGHTS = {
  purchase: 5,
  add_to_cart: 4,
  remove_from_cart: -2,
  add_to_wishlist: 3,
  remove_wishlist: -2,
  view: 1,
} as const;

export function reviewWeight(rating: number): number {
  return rating >= 5 ? 4 : rating === 4 ? 3 : rating === 3 ? 1 : -3;
}

@Injectable()
export class BehaviorService {
  constructor(
    @InjectRepository(UserProductEvent)
    private readonly events: Repository<UserProductEvent>,
  ) {}

  private append(userId: string, productId: string, type: BehaviorEventType, weight: number): Promise<unknown> {
    return this.events.insert({ id: randomUUID(), userId, productId, type, weight });
  }

  async recordPurchase(userId: string, productIds: string[]): Promise<void> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return;
    await this.events.insert(
      unique.map((productId) => ({
        id: randomUUID(),
        userId,
        productId,
        type: 'purchase' as const,
        weight: WEIGHTS.purchase,
      })),
    );
  }

  async recordCartAdd(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'add_to_cart', WEIGHTS.add_to_cart);
  }
  async recordCartRemove(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'remove_from_cart', WEIGHTS.remove_from_cart);
  }
  async recordWishlistAdd(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'add_to_wishlist', WEIGHTS.add_to_wishlist);
  }
  async recordWishlistRemove(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'remove_wishlist', WEIGHTS.remove_wishlist);
  }

  async recordReview(userId: string, productId: string, rating: number): Promise<void> {
    const weight = reviewWeight(rating);
    const existing = await this.events.findOne({ where: { userId, productId, type: 'review' } });
    if (existing) {
      existing.weight = weight;
      await this.events.save(existing);
      return;
    }
    await this.append(userId, productId, 'review', weight);
  }

  async removeReview(userId: string, productId: string): Promise<void> {
    await this.events.delete({ userId, productId, type: 'review' });
  }

  async recordView(userId: string, productId: string): Promise<void> {
    const existing = await this.events.findOne({ where: { userId, productId, type: 'view' } });
    if (existing) return;
    await this.append(userId, productId, 'view', WEIGHTS.view);
  }
}
