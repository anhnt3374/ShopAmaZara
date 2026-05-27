import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { toProductSummary } from '../products/dto/product-views';
import { WishlistItem } from './wishlist-item.entity';
import { BehaviorService } from '../behavior/behavior.service';

@Injectable()
export class WishlistService {
  private readonly behaviorLog = new Logger('WishlistService:behavior');

  constructor(
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
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

  async list(userId: string) {
    const rows = await this.items.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return { items: [] };
    const products = await this.products.find({
      where: { id: In(rows.map((r) => r.productId)) },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = rows
      .map((r) => byId.get(r.productId))
      .filter((p): p is Product => p !== undefined)
      .map(toProductSummary);
    return { items };
  }

  async add(userId: string, productId: string) {
    const existing = await this.items.findOne({ where: { userId, productId } });
    if (existing) return { item: existing, created: false };
    const entity = this.items.create({ userId, productId });
    const saved = await this.items.save(entity);
    this.fireBehavior(() => this.behavior!.recordWishlistAdd(userId, productId));
    return { item: saved, created: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
    this.fireBehavior(() => this.behavior!.recordWishlistRemove(userId, productId));
  }
}
