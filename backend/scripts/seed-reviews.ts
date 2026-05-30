import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Review } from '../src/reviews/review.entity';

interface SampleRow {
  label: number;
  review: string;
}

const SAMPLE_PATH = path.resolve(__dirname, '..', '1200_sample_review.json');
const BATCH = 200;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`Sample file not found: ${SAMPLE_PATH}`);
  }
  const samples = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf-8')) as SampleRow[];
  console.log(`Loaded ${samples.length} sample reviews`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);

    const eligibleRaw = await ds.query(`
      SELECT DISTINCT o.buyer_id AS user_id, oi.product_id AS product_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN reviews r ON r.product_id = oi.product_id AND r.user_id = o.buyer_id
      WHERE o.status = 'Delivered' AND r.id IS NULL
    `);
    const eligiblePairs = eligibleRaw as { user_id: string; product_id: string }[];
    console.log(`Found ${eligiblePairs.length} eligible (buyer, product) pairs without review`);

    const eligible = shuffle([...eligiblePairs]);
    const shuffledSamples = shuffle([...samples]);

    const reviewsRepo = ds.getRepository(Review);
    const toInsert: Review[] = [];
    const take = Math.min(eligible.length, shuffledSamples.length);

    for (let i = 0; i < take; i++) {
      const pair = eligible[i];
      const s = shuffledSamples[i];
      toInsert.push(reviewsRepo.create({
        id: randomUUID(),
        productId: pair.product_id,
        userId: String(pair.user_id),
        rating: s.label,
        comment: s.review,
      }));
    }

    for (let i = 0; i < toInsert.length; i += BATCH) {
      await reviewsRepo.insert(toInsert.slice(i, i + BATCH));
    }
    console.log(`Inserted ${toInsert.length} reviews`);
    if (shuffledSamples.length > take) {
      console.warn(`Skipped ${shuffledSamples.length - take} samples (not enough eligible pairs)`);
    }
  } finally {
    await app.close();
  }
}

// Exit explicitly: AppModule opens handles (e.g. the ioredis query-cache client)
// that aren't all closed by app.close(), which would otherwise hang the process.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
