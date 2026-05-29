import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import {
  ProductSummary,
  toProductSummary,
} from '../products/dto/product-views';
import { CartItem } from './cart-item.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { BehaviorService } from '../behavior/behavior.service';

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  product: ProductSummary;
  lineTotal: number;
}

@Injectable()
export class CartService {
  private readonly behaviorLog = new Logger('CartService:behavior');

  constructor(
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
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

  private hydrateRow(row: CartItem, product: Product): CartItemView {
    const summary = toProductSummary(product);
    const lineTotal = Math.round(summary.price * row.quantity * 100) / 100;
    return {
      id: row.id,
      productId: row.productId,
      quantity: row.quantity,
      product: summary,
      lineTotal,
    };
  }

  async list(userId: string): Promise<{ items: CartItemView[]; subtotal: number }> {
    const rows = await this.items.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0) return { items: [], subtotal: 0 };
    const products = await this.products.find({
      where: { id: In(rows.map((r) => r.productId)) },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: CartItemView[] = [];
    let subtotal = 0;
    for (const r of rows) {
      const p = byId.get(r.productId);
      if (!p) continue;
      const view = this.hydrateRow(r, p);
      subtotal += view.lineTotal;
      items.push(view);
    }
    return { items, subtotal: Math.round(subtotal * 100) / 100 };
  }

  async add(
    userId: string,
    dto: AddCartItemDto,
  ): Promise<{ item: CartItemView }> {
    const product = await this.products.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    const existing = await this.items.findOne({
      where: { userId, productId: dto.productId },
    });
    const nextQty = (existing?.quantity ?? 0) + dto.quantity;
    if (nextQty > product.stock)
      throw new BadRequestException('Requested quantity exceeds stock');
    if (existing) {
      existing.quantity = nextQty;
      const saved = await this.items.save(existing);
      return { item: this.hydrateRow(saved, product) };
    }
    const created = this.items.create({
      userId,
      productId: dto.productId,
      quantity: dto.quantity,
    });
    const saved = await this.items.save(created);
    this.fireBehavior(() => this.behavior!.recordCartAdd(userId, dto.productId));
    return { item: this.hydrateRow(saved, product) };
  }

  async update(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartItemView | null> {
    const row = await this.items.findOne({ where: { userId, productId } });
    if (!row) throw new NotFoundException('Cart row not found');
    if (dto.quantity === 0) {
      await this.items.delete({ userId, productId });
      this.fireBehavior(() => this.behavior!.recordCartRemove(userId, productId));
      return null;
    }
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (dto.quantity > product.stock)
      throw new BadRequestException('Requested quantity exceeds stock');
    row.quantity = dto.quantity;
    const saved = await this.items.save(row);
    return this.hydrateRow(saved, product);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
    this.fireBehavior(() => this.behavior!.recordCartRemove(userId, productId));
  }

  async clear(userId: string): Promise<void> {
    await this.items.delete({ userId });
  }
}
