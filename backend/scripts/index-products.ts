import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.entity';
import { QdrantService } from '../src/search/qdrant.service';
import { ProductIndexerService, ProductStats } from '../src/search/product-indexer.service';

const BATCH = 64;

async function main() {
  const start = Date.now();
  // Background embedding warmup is for the long-running API server, not a
  // one-shot script; disable it so it doesn't run alongside the indexing pass.
  process.env.EMBED_WARMUP_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);
    const qdrant = app.get(QdrantService);
    const indexer = app.get(ProductIndexerService);

    await qdrant.ensureCollection();

    const statsRows: Array<{ product_id: string; avg: string; cnt: string }> = await ds.query(
      'SELECT product_id, AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews GROUP BY product_id',
    );
    const statsMap = new Map<string, ProductStats>();
    for (const r of statsRows) {
      statsMap.set(r.product_id, {
        rating: r.avg ? Math.round(Number(r.avg) * 10) / 10 : 0,
        reviewCount: Number(r.cnt),
      });
    }

    const repo = ds.getRepository(Product);
    const total = await repo.count();
    let done = 0;
    let failures = 0;
    for (let offset = 0; offset < total; offset += BATCH) {
      const batch = await repo.find({ order: { id: 'ASC' }, skip: offset, take: BATCH });
      try {
        await indexer.indexProducts(batch, statsMap);
      } catch (err) {
        failures += batch.length;
        console.error(`[index] batch at ${offset} failed: ${(err as Error).message}`);
      }
      done += batch.length;
      console.log(`[index] ${done}/${total}`);
    }
    console.log(
      `[index] done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${done} processed, ${failures} failed`,
    );
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
