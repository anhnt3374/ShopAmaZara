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
import { customAlphabet } from 'nanoid';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { UserAddress } from '../addresses/address.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

export type PreorderItemInput = { productId: string; qty: number };

export type PreorderDraft = {
  preorderId: string;
  items: {
    productId: string;
    storeId: string;
    qty: number;
    unitPrice: string;
    name: string;
  }[];
  addressId: string;
  shipping: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: 'card' | 'ewallet' | 'bank' | 'cod';
  total: string;
  expiresAt: number;
};

const PREORDER_TTL_MS = 10 * 60 * 1000;
const makePreorderId = () => `PRE-${customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6)()}`;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(UserAddress) private readonly addresses: Repository<UserAddress>,
  ) {}

  async buildPreorder(
    userId: string,
    items: PreorderItemInput[],
    addressId?: string,
    paymentMethod: 'card' | 'ewallet' | 'bank' | 'cod' = 'cod',
  ): Promise<PreorderDraft> {
    if (items.length === 0) throw new BadRequestException('items must not be empty');

    let resolvedAddr: UserAddress;
    if (!addressId) {
      const defaultAddr = await this.addresses.findOne({
        where: { userId, isDefault: true },
      });
      if (!defaultAddr) {
        throw new BadRequestException('No default address; please provide addressId');
      }
      resolvedAddr = defaultAddr;
    } else {
      const addr = await this.addresses.findOne({ where: { id: addressId } });
      if (!addr) throw new NotFoundException('Address not found');
      if (addr.userId !== userId) throw new ForbiddenException('Not your address');
      resolvedAddr = addr;
    }

    const lines: PreorderDraft['items'] = [];
    let total = 0;
    for (const it of items) {
      const p = await this.products.findOne({ where: { id: it.productId } });
      if (!p) throw new NotFoundException(`Product ${it.productId} not found`);
      if (p.stock < it.qty) throw new BadRequestException(`Insufficient stock for ${p.name}`);
      const unit = Number(p.price);
      total += unit * it.qty;
      lines.push({ productId: p.id, storeId: p.storeId, qty: it.qty, unitPrice: p.price, name: p.name });
    }

    return {
      preorderId: makePreorderId(),
      items: lines,
      addressId: resolvedAddr.id,
      shipping: {
        recipientName: resolvedAddr.recipientName,
        phone: resolvedAddr.phone,
        line1: resolvedAddr.line1,
        line2: resolvedAddr.line2,
        city: resolvedAddr.city,
        region: resolvedAddr.region,
        postalCode: resolvedAddr.postalCode,
        country: resolvedAddr.country,
      },
      paymentMethod,
      total: total.toFixed(2),
      expiresAt: Date.now() + PREORDER_TTL_MS,
    };
  }

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

  async createFromPreorder(
    userId: string,
    draft: PreorderDraft,
  ): Promise<{ orderId: string; total: string; status: 'Paid' }> {
    if (Date.now() > draft.expiresAt) {
      throw new BadRequestException('Preorder expired');
    }
    return this.dataSource.transaction(async (manager) => {
      for (const it of draft.items) {
        const res = await manager.query(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [it.qty, it.productId, it.qty],
        );
        const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
        if (affected !== 1) {
          throw new ConflictException(`Insufficient stock for ${it.name}`);
        }
      }
      const orderEntity = manager.create(Order, {
        buyerId: userId,
        subtotal: draft.total,
        shipping: '0.00',
        tax: '0.00',
        total: draft.total,
        status: 'Paid',
        paymentMethod: draft.paymentMethod,
        paidAt: new Date(),
        shippingRecipient: draft.shipping.recipientName,
        shippingPhone: draft.shipping.phone,
        shippingLine1: draft.shipping.line1,
        shippingLine2: draft.shipping.line2,
        shippingCity: draft.shipping.city,
        shippingRegion: draft.shipping.region,
        shippingPostal: draft.shipping.postalCode,
        shippingCountry: draft.shipping.country,
      });
      const savedOrder = await manager.save(orderEntity);
      const itemEntities = draft.items.map((it) =>
        manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: it.productId,
          storeId: it.storeId,
          nameSnapshot: it.name,
          priceSnapshot: it.unitPrice,
          quantity: it.qty,
        }),
      );
      await manager.save(itemEntities);
      return { orderId: String(savedOrder.id), total: draft.total, status: 'Paid' as const };
    });
  }

  async listForBuyer(buyerId: string, status?: string) {
    const where: any = { buyerId };
    if (status && ['Paid', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
      where.status = status;
    }
    const orders = await this.orders.find({
      where,
      order: { createdAt: 'DESC' },
      relations: { items: true },
    });
    return {
      items: orders.map((o) => this.toBuyerListView(o)),
    };
  }

  async findOneForBuyer(buyerId: string, id: string) {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    return this.toBuyerDetailView(order);
  }

  private toBuyerListView(o: Order) {
    return {
      id: String(o.id),
      subtotal: Number(o.subtotal),
      shipping: Number(o.shipping),
      tax: Number(o.tax),
      total: Number(o.total),
      status: o.status,
      shippingMethod: o.shippingMethod,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      deliveredAt: o.deliveredAt,
      cancelledAt: o.cancelledAt,
      items: (o.items ?? []).map((it) => ({
        id: String(it.id),
        productId: it.productId,
        name: it.nameSnapshot,
        price: Number(it.priceSnapshot),
        quantity: it.quantity,
      })),
    };
  }

  private toBuyerDetailView(o: Order) {
    return {
      ...this.toBuyerListView(o),
      shipping_address: {
        recipientName: o.shippingRecipient,
        phone: o.shippingPhone,
        line1: o.shippingLine1,
        line2: o.shippingLine2,
        city: o.shippingCity,
        region: o.shippingRegion,
        postalCode: o.shippingPostal,
        country: o.shippingCountry,
      },
      payment: {
        method: o.paymentMethod,
        last4: o.paymentLast4,
        txnId: o.paymentTxnId,
      },
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
    status: 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled',
  ) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      const hasItemFromStore = order.items?.some((i) => i.storeId === storeId);
      if (!hasItemFromStore) throw new ForbiddenException('Not your order');

      if (status === 'Cancelled' && order.status !== 'Cancelled') {
        for (const it of order.items ?? []) {
          await manager.query(
            'UPDATE products SET stock = stock + ? WHERE id = ?',
            [it.quantity, it.productId],
          );
        }
      }
      const now = new Date();
      order.status = status;
      if (status === 'Shipped' && !order.shippedAt) order.shippedAt = now;
      if (status === 'Delivered' && !order.deliveredAt) order.deliveredAt = now;
      if (status === 'Cancelled' && !order.cancelledAt) order.cancelledAt = now;
      await manager.save(order);
      return { order: { id: String(order.id), status: order.status } };
    });
  }

  async cancelForBuyer(buyerId: string, id: string): Promise<{ id: string; status: 'Cancelled' }> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id },
        relations: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
      if (order.status !== 'Paid') throw new ConflictException(`Cannot cancel an order with status ${order.status}`);
      for (const it of order.items ?? []) {
        await manager.query(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [it.quantity, it.productId],
        );
      }
      order.status = 'Cancelled';
      order.cancelledAt = new Date();
      await manager.save(order);
      return { id: String(order.id), status: 'Cancelled' };
    });
  }
}
