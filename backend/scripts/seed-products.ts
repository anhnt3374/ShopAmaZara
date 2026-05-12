import { NestFactory } from '@nestjs/core';
import { parse } from 'csv-parse/sync';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/user.entity';
import { Store } from '../src/stores/store.entity';

const CSV_PATH = path.resolve(__dirname, '..', '..', 'products.enriched.csv');
const SELLER_PASSWORD = 'seller123';
const BCRYPT_ROUNDS = 12;

interface CsvRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  store_id: string;
  price: string;
  discount: string;
  stock: string;
  image_count: string;
  image_first: string;
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

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}`);
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as CsvRow[];
  console.log(`Parsed ${rows.length} CSV rows`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const ds = app.get(DataSource);
    const users = ds.getRepository(User);
    const stores = ds.getRepository(Store);
    const passwordHash = await bcrypt.hash(SELLER_PASSWORD, BCRYPT_ROUNDS);

    const distinctStoreIds = Array.from(new Set(rows.map((r) => r.store_id)));
    console.log(`Found ${distinctStoreIds.length} distinct store IDs`);

    let sellersCreated = 0;
    let storesCreated = 0;
    const printedSellers: string[] = [];

    for (const storeId of distinctStoreIds) {
      const short5 = storeId.slice(0, 5);
      const short8 = storeId.slice(0, 8);
      const email = `seller-${short8}@amazara.local`;

      let seller = await users.findOne({ where: { email } });
      if (!seller) {
        seller = await users.save(
          users.create({
            email,
            passwordHash,
            fullName: `Seller ${short5}`,
            role: 'seller',
          }),
        );
        sellersCreated += 1;
        if (printedSellers.length < 3) printedSellers.push(email);
      }

      const existingStore = await stores.findOne({ where: { id: storeId } });
      if (!existingStore) {
        await stores.save(
          stores.create({
            id: storeId,
            name: `Store ${short5}`,
            slug: `store-${short5}`,
            ownerId: seller.id,
          }),
        );
        storesCreated += 1;
      }
    }

    console.log(`Seeded ${sellersCreated} new sellers, ${storesCreated} new stores`);
    if (printedSellers.length) {
      console.log('Example seller logins (password "seller123"):');
      for (const e of printedSellers) console.log(`  ${e}`);
    }

    const productsRepo = ds.getRepository(
      (await import('../src/products/product.entity')).Product,
    );

    // De-duplicate by id across the whole CSV (last occurrence wins) so we
    // don't trigger duplicate-key errors on intra-batch duplicates. The CSV
    // contains a few repeated ids.
    const mappedById = new Map<string, NonNullable<ReturnType<typeof mapRowToProduct>>>();
    for (const r of rows) {
      const p = mapRowToProduct(r);
      if (p) mappedById.set(p.id, p);
    }
    const allEntities = Array.from(mappedById.values());

    let productsInserted = 0;
    let productsUpdated = 0;
    const BATCH = 500;
    for (let i = 0; i < allEntities.length; i += BATCH) {
      const entities = allEntities.slice(i, i + BATCH);
      const existing = await productsRepo
        .createQueryBuilder('p')
        .select('p.id')
        .where('p.id IN (:...ids)', { ids: entities.map((e) => e.id) })
        .getMany();
      const existingIds = new Set(existing.map((e) => e.id));
      await productsRepo.save(entities);
      for (const e of entities) {
        if (existingIds.has(e.id)) productsUpdated += 1;
        else productsInserted += 1;
      }
      console.log(`Products: ${i + entities.length} / ${allEntities.length}`);
    }
    console.log(`Seeded ${productsInserted} new products, updated ${productsUpdated}`);
  } finally {
    await app.close();
  }
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

function mapRowToProduct(r: CsvRow):
  | {
      id: string;
      name: string;
      brand: string;
      category: string;
      storeId: string;
      price: string;
      discount: number;
      stock: number;
      imageFirst: string;
      shortDescription: string | null;
      longDescription: string | null;
      highlights: unknown;
      color: unknown;
      availableColors: unknown;
      availableSizes: unknown;
      material: string | null;
      targetGender: 'men' | 'women' | 'unisex' | 'kids' | null;
      targetAgeGroup: string | null;
      tags: unknown;
    }
  | null {
  if (!r.id || !r.name || !r.store_id) return null;
  const price = Number(r.price);
  const discount = Math.max(0, Math.min(100, Math.round(Number(r.discount) || 0)));
  const stock = Math.max(0, Math.round(Number(r.stock) || 0));
  const allowedGenders = new Set(['men', 'women', 'unisex', 'kids']);
  const gender = allowedGenders.has(r.target_gender)
    ? (r.target_gender as 'men' | 'women' | 'unisex' | 'kids')
    : null;
  return {
    id: r.id,
    name: r.name,
    brand: r.brand || 'Unbranded',
    category: r.category || 'Other',
    storeId: r.store_id,
    price: price.toFixed(2),
    discount,
    stock,
    imageFirst: r.image_first || '',
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
