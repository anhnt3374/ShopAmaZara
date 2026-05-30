import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Review } from '../reviews/review.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ProductIndexerService } from './product-indexer.service';
import { QDRANT_CLIENT, QdrantService } from './qdrant.service';
import { SEARCH_CACHE, SearchCacheStore } from './search-cache';
import { SearchService } from './search.service';

@Module({
  imports: [EmbeddingsModule, TypeOrmModule.forFeature([Review])],
  providers: [
    {
      provide: QDRANT_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new QdrantClient({ url: config.get<string>('QDRANT_URL', 'http://qdrant:6333') }),
    },
    {
      // Redis-backed query cache. Disabled (null) when REDIS_URL is unset or the
      // TTL is 0; ioredis is required lazily so non-Redis envs never load it.
      provide: SEARCH_CACHE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SearchCacheStore | null => {
        const url = config.get<string>('REDIS_URL');
        const ttl = Number(config.get<string>('SEARCH_CACHE_TTL_MS', '60000'));
        if (!url || !(ttl > 0)) return null;
        const log = new Logger('SearchCache');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Redis = require('ioredis');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { RedisSearchCache } = require('./redis-search-cache');
        const client = new Redis(url, {
          // Fail commands fast when Redis is down so search degrades instead of
          // hanging; keep retrying the connection in the background.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        client.on('error', (err: Error) => log.warn(`redis: ${err.message}`));
        log.log(`query cache enabled (redis ${url}, ttl ${ttl}ms)`);
        return new RedisSearchCache(client);
      },
    },
    QdrantService,
    ProductIndexerService,
    SearchService,
  ],
  exports: [QdrantService, ProductIndexerService, SearchService],
})
export class SearchModule {}
