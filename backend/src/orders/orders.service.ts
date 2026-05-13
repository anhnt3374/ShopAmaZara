import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { UserAddress } from '../addresses/address.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async checkout(buyerId: string, dto: CheckoutDto): Promise<{ orderId: string; total: number; status: 'Paid' }> {
    return this.dataSource.transaction(async (manager) => {
      // 1. cart rows
      const cartRows = await manager.find(CartItem, {
        where: { userId: buyerId, productId: In(dto.productIds) },
      });
      if (cartRows.length === 0) throw new BadRequestException('No matching cart items');

      // 2. products
      const productIds = cartRows.map((r) => r.productId);
      const products = await manager.find(Product, { where: { id: In(productIds) } });
      const byId = new Map(products.map((p) => [p.id, p]));

      // 3. shipping address — owned by buyer
      const addr = await manager.findOne(UserAddress, { where: { id: dto.addressId } });
      if (!addr) throw new NotFoundException('Address not found');
      if (addr.userId !== buyerId) throw new ForbiddenException('Not your address');

      // 4. decrement stock + build draft items
      let subtotal = 0;
      const drafts: Array<{
        productId: string; storeId: string; nameSnapshot: string;
        priceSnapshot: string; quantity: number;
      }> = [];
      for (const row of cartRows) {
        const product = byId.get(row.productId);
        if (!product) throw new NotFoundException(`Product ${row.productId} missing`);
        const res = await manager.query(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [row.quantity, row.productId, row.quantity],
        );
        const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
        if (affected !== 1) throw new ConflictException(`Insufficient stock for ${product.name}`);
        const line = Math.round(Number(product.price) * row.quantity * 100) / 100;
        subtotal += line;
        drafts.push({
          productId: row.productId,
          storeId: product.storeId,
          nameSnapshot: product.name,
          priceSnapshot: product.price,
          quantity: row.quantity,
        });
      }

      // 5. totals
      const subtotalRounded = Math.round(subtotal * 100) / 100;
      const shippingCost = dto.shippingMethod === 'Express' ? 15 : 5;
      const tax = Math.round(subtotalRounded * 0.08 * 100) / 100;
      const total = Math.round((subtotalRounded + shippingCost + tax) * 100) / 100;

      // 6. order row
      const now = new Date();
      const orderEntity = manager.create(Order, {
        buyerId,
        subtotal: subtotalRounded.toFixed(2),
        shipping: shippingCost.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        status: 'Paid',
        shippingMethod: dto.shippingMethod,
        shippingRecipient: addr.recipientName,
        shippingPhone: addr.phone,
        shippingLine1: addr.line1,
        shippingLine2: addr.line2,
        shippingCity: addr.city,
        shippingRegion: addr.region,
        shippingPostal: addr.postalCode,
        shippingCountry: addr.country,
        paymentMethod: dto.payment.method,
        paymentLast4: dto.payment.method === 'card' ? dto.payment.cardLast4 ?? null : null,
        paymentTxnId: `MOCK-${randomUUID()}`,
        paidAt: now,
      });
      const savedOrder = await manager.save(orderEntity);

      // 7. items
      const itemEntities = drafts.map((d) =>
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

      // 8. clear cart rows
      await manager.delete(CartItem, { userId: buyerId, productId: In(productIds) });

      return { orderId: String(savedOrder.id), total, status: 'Paid' };
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

  async listForStore(
    storeId: string,
    opts: { status?: string; q?: string },
  ) {
    const qb = this.orders
      .createQueryBuilder('o')
      .innerJoin('order_items', 'oi', 'oi.order_id = o.id')
      .innerJoin('users', 'u', 'u.id = o.buyer_id')
      .where('oi.store_id = :storeId', { storeId })
      .groupBy('o.id')
      .addGroupBy('u.email')
      .addGroupBy('u.full_name')
      .addSelect('u.email', 'buyer_email')
      .addSelect('u.full_name', 'buyer_name')
      .addSelect(
        'SUM(oi.price_snapshot * oi.quantity)',
        'store_total',
      )
      .addSelect('SUM(oi.quantity)', 'store_qty');
    if (opts.status) qb.andWhere('o.status = :status', { status: opts.status });
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.email) LIKE :like OR LOWER(u.full_name) LIKE :like OR CAST(o.id AS CHAR) LIKE :like)',
        { like },
      );
    }
    qb.orderBy('o.created_at', 'DESC');
    const rows = await qb.getRawAndEntities<{
      buyer_email: string;
      buyer_name: string;
      store_total: string;
      store_qty: string;
    }>();
    const items = rows.entities.map((order, i) => {
      const r = rows.raw[i];
      return {
        id: String(order.id),
        customer: r.buyer_name,
        email: r.buyer_email,
        date: order.createdAt.toISOString().slice(0, 10),
        status: order.status,
        items: Number(r.store_qty),
        total: Number(r.store_total),
      };
    });
    return { items };
  }

  async updateStatusForStore(
    storeId: string,
    orderId: string,
    status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled',
  ) {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const hasItemFromStore = order.items?.some((i) => i.storeId === storeId);
    if (!hasItemFromStore) throw new ForbiddenException('Not your order');
    order.status = status;
    await this.orders.save(order);
    return {
      order: {
        id: String(order.id),
        status: order.status,
      },
    };
  }
}
