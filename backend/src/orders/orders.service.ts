import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async checkout(buyerId: string, dto: CheckoutDto): Promise<{ orderId: string; total: number }> {
    return this.dataSource.transaction(async (manager) => {
      const cartRows = await manager.find(CartItem, {
        where: { userId: buyerId, productId: In(dto.productIds) },
      });
      if (cartRows.length === 0) {
        throw new BadRequestException('No matching cart items');
      }
      const productIds = cartRows.map((r) => r.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      let subtotal = 0;
      const orderItemDrafts: Array<{
        productId: string;
        storeId: string;
        nameSnapshot: string;
        priceSnapshot: string;
        quantity: number;
      }> = [];

      for (const row of cartRows) {
        const product = byId.get(row.productId);
        if (!product) throw new NotFoundException(`Product ${row.productId} missing`);
        const res = await manager.query(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [row.quantity, row.productId, row.quantity],
        );
        const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
        if (affected !== 1) {
          throw new ConflictException(`Insufficient stock for ${product.name}`);
        }
        const line = Math.round(Number(product.price) * row.quantity * 100) / 100;
        subtotal += line;
        orderItemDrafts.push({
          productId: row.productId,
          storeId: product.storeId,
          nameSnapshot: product.name,
          priceSnapshot: product.price,
          quantity: row.quantity,
        });
      }

      const subtotalRounded = Math.round(subtotal * 100) / 100;
      const shipping = subtotalRounded > 0 ? 12.5 : 0;
      const tax = Math.round(subtotalRounded * 0.08 * 100) / 100;
      const total = Math.round((subtotalRounded + shipping + tax) * 100) / 100;

      const orderEntity = manager.create(Order, {
        buyerId,
        subtotal: subtotalRounded.toFixed(2),
        shipping: shipping.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        status: 'Processing',
      });
      const savedOrder = await manager.save(orderEntity);

      const itemEntities = orderItemDrafts.map((d) =>
        manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: d.productId,
          storeId: d.storeId,
          nameSnapshot: d.nameSnapshot,
          priceSnapshot: d.priceSnapshot,
          quantity: d.quantity,
        }),
      );
      await manager.save(itemEntities);

      await manager.delete(CartItem, {
        userId: buyerId,
        productId: In(productIds),
      });

      return { orderId: String(savedOrder.id), total };
    });
  }

  async listForBuyer(buyerId: string) {
    const orders = await this.orders.find({
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
    return {
      items: orders.map((o) => ({
        id: String(o.id),
        subtotal: Number(o.subtotal),
        shipping: Number(o.shipping),
        tax: Number(o.tax),
        total: Number(o.total),
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  }

  async findOneForBuyer(buyerId: string, id: string) {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    return {
      id: String(order.id),
      buyerId: order.buyerId,
      subtotal: Number(order.subtotal),
      shipping: Number(order.shipping),
      tax: Number(order.tax),
      total: Number(order.total),
      status: order.status,
      createdAt: order.createdAt,
      items: (order.items ?? []).map((it) => ({
        id: String(it.id),
        productId: it.productId,
        storeId: it.storeId,
        name: it.nameSnapshot,
        price: Number(it.priceSnapshot),
        quantity: it.quantity,
        lineTotal: Math.round(Number(it.priceSnapshot) * it.quantity * 100) / 100,
      })),
    };
  }
}
