import {
  BadRequestException,
  Injectable,
  NotFoundException,
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

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  product: ProductSummary;
  lineTotal: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

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
      const summary = toProductSummary(p);
      const line = Math.round(summary.price * r.quantity * 100) / 100;
      subtotal += line;
      items.push({
        id: r.id,
        productId: r.productId,
        quantity: r.quantity,
        product: summary,
        lineTotal: line,
      });
    }
    return { items, subtotal: Math.round(subtotal * 100) / 100 };
  }

  async add(
    userId: string,
    dto: AddCartItemDto,
  ): Promise<{ item: CartItem }> {
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
      return { item: saved };
    }
    const created = this.items.create({
      userId,
      productId: dto.productId,
      quantity: dto.quantity,
    });
    return { item: await this.items.save(created) };
  }

  async update(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartItem | null> {
    const row = await this.items.findOne({ where: { userId, productId } });
    if (!row) throw new NotFoundException('Cart row not found');
    if (dto.quantity === 0) {
      await this.items.delete({ userId, productId });
      return null;
    }
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (dto.quantity > product.stock)
      throw new BadRequestException('Requested quantity exceeds stock');
    row.quantity = dto.quantity;
    return this.items.save(row);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
  }

  async clear(userId: string): Promise<void> {
    await this.items.delete({ userId });
  }
}
