import { NestFactory } from '@nestjs/core';
import { parse } from 'csv-parse/sync';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/user.entity';
import { Store } from '../src/stores/store.entity';
import { UserAddress } from '../src/addresses/address.entity';
import { Order } from '../src/orders/order.entity';
import { OrderItem } from '../src/orders/order-item.entity';
import { Review } from '../src/reviews/review.entity';

const CSV_PATH = path.resolve(__dirname, '..', '..', 'products.enriched.csv');
const SAMPLE_PATH = path.resolve(__dirname, '..', '1200_sample_review.json');
const BATCH = 500;

interface CsvRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  store_id: string;
  sku: string;
  model: string;
  price: string;
  sale_price: string;
  discount: string;
  stock: string;
  track_inventory: string;
  is_published: string;
  image_count: string;
  image_first: string;
  images: string;
  short_description: string;
  long_description: string;
  highlights: string;
  color: string;
  available_colors: string;
  available_sizes: string;
  material: string;
  target_gender: string;
  target_age_group: string;
  tags: string;
}

interface SampleRow {
  label: number;
  review: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeJson(value: string): unknown {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function mapRowToProduct(r: CsvRow, overrideStoreId: string) {
  if (!r.id || !r.name || !r.store_id) return null;
  const price = Number(r.price);
  if (isNaN(price) || price <= 0) return null;
  const discount = Math.max(0, Math.min(100, Math.round(Number(r.discount) || 0)));
  const stock = Math.max(0, Math.round(Number(r.stock) || 0));
  const allowedGenders = new Set(['men', 'women', 'unisex', 'kids']);
  const gender = allowedGenders.has(r.target_gender)
    ? (r.target_gender as 'men' | 'women' | 'unisex' | 'kids')
    : null;
  const salePrice = r.sale_price ? Number(r.sale_price) : null;
  return {
    id: r.id,
    name: r.name,
    brand: r.brand || 'Unbranded',
    category: r.category || 'Other',
    storeId: overrideStoreId,
    sku: r.sku || null,
    model: r.model || null,
    price: price.toFixed(2),
    salePrice: salePrice && !isNaN(salePrice) ? salePrice.toFixed(2) : null,
    discount,
    stock,
    trackInventory: r.track_inventory === 'true' || r.track_inventory === '1',
    isPublished: r.is_published !== 'false' && r.is_published !== '0',
    imageFirst: r.image_first || '',
    images: safeJson(r.images),
    shortDescription: r.short_description || null,
    longDescription: r.long_description || null,
    highlights: safeJson(r.highlights),
    color: safeJson(r.color),
    availableColors: safeJson(r.available_colors),
    availableSizes: safeJson(r.available_sizes),
    material: r.material || null,
    targetGender: gender,
    targetAgeGroup: r.target_age_group || null,
    tags: safeJson(r.tags),
  };
}

async function main() {
  const startTime = Date.now();

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}`);
  }
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`Sample file not found at ${SAMPLE_PATH}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const ds = app.get(DataSource);

    // ─────────────────────────────────────────────
    // Step 1: Wipe
    // ─────────────────────────────────────────────
    console.log('[seed] Wiping tables...');
    await ds.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'reviews',
      'order_items',
      'orders',
      'cart_items',
      'wishlist_items',
      'user_addresses',
      'products',
      'stores',
      'messages',
      'conversations',
      'users',
    ]) {
      try {
        await ds.query(`TRUNCATE TABLE \`${table}\``);
      } catch {
        // table may not exist in all environments – skip silently
      }
    }
    await ds.query('SET FOREIGN_KEY_CHECKS = 1');

    // ─────────────────────────────────────────────
    // Step 2: Users (100)
    // ─────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password123', 4);
    const usersRepo = ds.getRepository(User);

    const sellers: User[] = [];
    for (let i = 1; i <= 20; i++) {
      const padded = String(i).padStart(2, '0');
      sellers.push(
        usersRepo.create({
          email: `seller${padded}@amazara.local`,
          passwordHash,
          fullName: `Seller ${padded}`,
          role: 'seller',
        }),
      );
    }
    const savedSellers = await usersRepo.save(sellers);

    const buyers: User[] = [];
    for (let i = 1; i <= 80; i++) {
      const padded = String(i).padStart(2, '0');
      buyers.push(
        usersRepo.create({
          email: `buyer${padded}@amazara.local`,
          passwordHash,
          fullName: `Buyer ${padded}`,
          role: 'buyer',
        }),
      );
    }
    const savedBuyers = await usersRepo.save(buyers);

    console.log(`[seed] Users: ${savedSellers.length + savedBuyers.length} created (${savedSellers.length} sellers + ${savedBuyers.length} buyers)`);

    // ─────────────────────────────────────────────
    // Step 3: Stores (20)
    // ─────────────────────────────────────────────
    const storesRepo = ds.getRepository(Store);
    const stores: Store[] = [];
    for (let i = 0; i < 20; i++) {
      const padded = String(i + 1).padStart(2, '0');
      stores.push(
        storesRepo.create({
          id: randomUUID(),
          name: `Store ${padded}`,
          slug: `store-${padded}`,
          ownerId: savedSellers[i].id,
        }),
      );
    }
    const savedStores = await storesRepo.save(stores);
    console.log(`[seed] Stores: ${savedStores.length} created`);

    // ─────────────────────────────────────────────
    // Step 4: Products
    // ─────────────────────────────────────────────
    const raw = fs.readFileSync(CSV_PATH, 'utf-8');
    const rows = parse(raw, { columns: true, skip_empty_lines: true }) as CsvRow[];

    const productsRepo = ds.getRepository(
      (await import('../src/products/product.entity')).Product,
    );

    const mappedById = new Map<string, NonNullable<ReturnType<typeof mapRowToProduct>>>();
    let rowIdx = 0;
    for (const r of rows) {
      const storeId = savedStores[rowIdx % 20].id;
      const p = mapRowToProduct(r, storeId);
      if (p) {
        mappedById.set(p.id, p);
        rowIdx++;
      }
    }
    const allProducts = Array.from(mappedById.values());

    let productsInserted = 0;
    for (let i = 0; i < allProducts.length; i += BATCH) {
      const batch = allProducts.slice(i, i + BATCH);
      await productsRepo.save(batch);
      productsInserted += batch.length;
    }
    const avgPerStore = Math.round(productsInserted / 20);
    console.log(`[seed] Products: ${productsInserted} / ${allProducts.length} (${avgPerStore} per store avg)`);

    // ─────────────────────────────────────────────
    // Step 5: Addresses (~120)
    // ─────────────────────────────────────────────
    const cities = ['Hanoi', 'Saigon', 'Da Nang', 'Hai Phong', 'Can Tho', 'Hue', 'Nha Trang', 'Vinh'];
    const regions = ['Hanoi', 'Ho Chi Minh', 'Da Nang', 'Hai Phong', 'Can Tho', 'Thua Thien Hue', 'Khanh Hoa', 'Nghe An'];
    const streets = ['Tran Hung Dao', 'Nguyen Hue', 'Le Loi', 'Pham Ngu Lao', 'Hai Ba Trung', 'Dinh Tien Hoang', 'Ba Trieu', 'Ly Thuong Kiet'];
    const postalCodes = ['100000', '700000', '550000', '180000', '900000', '530000', '650000', '460000'];

    const addressRepo = ds.getRepository(UserAddress);

    // Randomly select 40 buyers to get a second address
    const shuffledBuyers = shuffle([...savedBuyers]);
    const secondAddressBuyers = new Set(shuffledBuyers.slice(0, 40).map((b) => b.id));

    const addressesToSave: UserAddress[] = [];
    for (const buyer of savedBuyers) {
      const cityIdx = Math.floor(Math.random() * cities.length);
      const streetNo = Math.floor(Math.random() * 200) + 1;
      const phone = '09' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');

      addressesToSave.push(
        addressRepo.create({
          userId: buyer.id,
          label: 'Home',
          recipientName: buyer.fullName,
          phone,
          line1: `${streetNo} ${streets[cityIdx % streets.length]} St`,
          line2: null,
          city: cities[cityIdx],
          region: regions[cityIdx],
          postalCode: postalCodes[cityIdx],
          country: 'Vietnam',
          isDefault: true,
        }),
      );
    }
    for (const buyer of savedBuyers) {
      if (!secondAddressBuyers.has(buyer.id)) continue;
      const cityIdx = Math.floor(Math.random() * cities.length);
      const streetNo = Math.floor(Math.random() * 200) + 1;
      const phone = '09' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');

      addressesToSave.push(
        addressRepo.create({
          userId: buyer.id,
          label: 'Work',
          recipientName: buyer.fullName,
          phone,
          line1: `${streetNo} ${streets[cityIdx % streets.length]} St`,
          line2: null,
          city: cities[cityIdx],
          region: regions[cityIdx],
          postalCode: postalCodes[cityIdx],
          country: 'Vietnam',
          isDefault: false,
        }),
      );
    }
    await addressRepo.save(addressesToSave);
    console.log(`[seed] Addresses: ${addressesToSave.length} created`);

    // Build a map of buyerId -> addresses for order shipping snapshots
    const savedAddresses = await addressRepo.find();
    const buyerAddressMap = new Map<string, UserAddress[]>();
    for (const addr of savedAddresses) {
      const list = buyerAddressMap.get(addr.userId) ?? [];
      list.push(addr);
      buyerAddressMap.set(addr.userId, list);
    }

    // ─────────────────────────────────────────────
    // Step 6: Orders (~300)
    // ─────────────────────────────────────────────
    const ordersRepo = ds.getRepository(Order);
    const orderItemsRepo = ds.getRepository(OrderItem);

    const statusDist: Array<{ status: 'Paid' | 'Shipped' | 'Delivered' | 'Cancelled'; count: number }> = [
      { status: 'Delivered', count: 150 },
      { status: 'Paid', count: 60 },
      { status: 'Shipped', count: 45 },
      { status: 'Cancelled', count: 45 },
    ];

    const paymentMethods: Array<'card' | 'ewallet' | 'bank' | 'cod'> = ['card', 'ewallet', 'bank', 'cod'];
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    function randomDaysAgo(maxDays: number): Date {
      return new Date(now - Math.random() * maxDays * DAY_MS);
    }
    function addHours(d: Date, hours: number): Date {
      return new Date(d.getTime() + hours * 3600 * 1000);
    }

    let totalOrderItems = 0;
    const statusCounts: Record<string, number> = { Delivered: 0, Paid: 0, Shipped: 0, Cancelled: 0 };

    for (const { status, count } of statusDist) {
      for (let o = 0; o < count; o++) {
        const buyer = pick(savedBuyers);
        const buyerAddrs = buyerAddressMap.get(buyer.id) ?? [];
        if (!buyerAddrs.length) continue; // safety – all buyers have at least 1
        const addr = pick(buyerAddrs);

        // Pick 1–3 products from a random store
        const storeIdx = Math.floor(Math.random() * savedStores.length);
        const storeProducts = allProducts.filter((p) => p.storeId === savedStores[storeIdx].id);
        const productPool = storeProducts.length >= 3 ? storeProducts : allProducts;
        const numItems = Math.floor(Math.random() * 3) + 1;
        const chosenProducts = shuffle(productPool).slice(0, numItems);

        // Subtotal
        let subtotal = 0;
        const itemDefs: Array<{ product: typeof allProducts[number]; qty: number }> = [];
        for (const prod of chosenProducts) {
          const qty = Math.floor(Math.random() * 3) + 1;
          subtotal += Number(prod.price) * qty;
          itemDefs.push({ product: prod, qty });
        }
        const isExpress = Math.random() < 0.3;
        const shippingVal = isExpress ? 15.0 : 5.0;
        const tax = Math.round(subtotal * 0.08 * 100) / 100;
        const total = subtotal + shippingVal + tax;

        const payMethod = pick(paymentMethods);
        const payLast4 = payMethod === 'card' ? '4242' : null;
        const payTxnId = randomUUID();

        // Timestamps
        let paidAt: Date | null = null;
        let shippedAt: Date | null = null;
        let deliveredAt: Date | null = null;
        let cancelledAt: Date | null = null;

        if (status === 'Paid') {
          paidAt = randomDaysAgo(30);
        } else if (status === 'Shipped') {
          paidAt = randomDaysAgo(30);
          shippedAt = addHours(paidAt, (Math.floor(Math.random() * 3) + 1) * 24);
        } else if (status === 'Delivered') {
          paidAt = randomDaysAgo(30);
          shippedAt = addHours(paidAt, (Math.floor(Math.random() * 3) + 1) * 24);
          deliveredAt = addHours(paidAt, (Math.floor(Math.random() * 6) + 5) * 24);
        } else if (status === 'Cancelled') {
          paidAt = randomDaysAgo(30);
          cancelledAt = addHours(paidAt, Math.random() * 24);
        }

        const order = await ordersRepo.save(
          ordersRepo.create({
            buyerId: buyer.id,
            subtotal: subtotal.toFixed(2),
            shipping: shippingVal.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
            status,
            shippingMethod: isExpress ? 'Express' : 'Standard',
            shippingRecipient: addr.recipientName,
            shippingPhone: addr.phone,
            shippingLine1: addr.line1,
            shippingLine2: addr.line2,
            shippingCity: addr.city,
            shippingRegion: addr.region,
            shippingPostal: addr.postalCode,
            shippingCountry: addr.country,
            paymentMethod: payMethod,
            paymentLast4: payLast4,
            paymentTxnId: payTxnId,
            paidAt,
            shippedAt,
            deliveredAt,
            cancelledAt,
          }),
        );

        const items = itemDefs.map(({ product, qty }) =>
          orderItemsRepo.create({
            orderId: order.id,
            productId: product.id,
            storeId: product.storeId,
            nameSnapshot: product.name,
            priceSnapshot: product.price,
            quantity: qty,
          }),
        );
        await orderItemsRepo.save(items);
        totalOrderItems += items.length;
        statusCounts[status]++;
      }
    }

    const totalOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    console.log(
      `[seed] Orders: ${totalOrders} created (${statusCounts.Delivered} Delivered, ${statusCounts.Paid} Paid, ${statusCounts.Shipped} Shipped, ${statusCounts.Cancelled} Cancelled)`,
    );
    console.log(`[seed]   Order items: ${totalOrderItems} total`);

    // ─────────────────────────────────────────────
    // Step 7: Reviews
    // ─────────────────────────────────────────────
    const samples = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf-8')) as SampleRow[];

    const eligibleRaw = await ds.query(`
      SELECT DISTINCT o.buyer_id AS user_id, oi.product_id AS product_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = 'Delivered'
    `);
    const eligiblePairs = eligibleRaw as { user_id: string; product_id: string }[];

    const shuffledSamples = shuffle([...samples]);
    const shuffledPairs = shuffle([...eligiblePairs]);
    const take = Math.min(shuffledPairs.length, shuffledSamples.length);

    if (shuffledSamples.length < shuffledPairs.length) {
      console.warn(`[seed] WARNING: only ${shuffledSamples.length} samples for ${shuffledPairs.length} eligible pairs`);
    }

    const reviewsRepo = ds.getRepository(Review);
    const reviewsToInsert: Review[] = [];
    for (let i = 0; i < take; i++) {
      const pair = shuffledPairs[i];
      const s = shuffledSamples[i];
      reviewsToInsert.push(
        reviewsRepo.create({
          id: randomUUID(),
          productId: pair.product_id,
          userId: String(pair.user_id),
          rating: s.label,
          comment: s.review,
        }),
      );
    }

    const REVIEW_BATCH = 200;
    for (let i = 0; i < reviewsToInsert.length; i += REVIEW_BATCH) {
      await reviewsRepo.insert(reviewsToInsert.slice(i, i + REVIEW_BATCH));
    }
    console.log(`[seed] Reviews: ${reviewsToInsert.length} created (${eligiblePairs.length} eligible pairs)`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[seed] Done in ${elapsed}s`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
