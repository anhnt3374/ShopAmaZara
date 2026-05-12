import { NestFactory } from '@nestjs/core';
import { parse } from 'csv-parse/sync';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';
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
    // Products are inserted by Task 2. Re-running this script after Task 2
    // ships will also upsert products.
    void rows; // referenced so the parse step is verified
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
