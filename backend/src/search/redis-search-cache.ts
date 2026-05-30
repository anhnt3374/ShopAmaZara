import { Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { RankedHit } from './search.service';
import type { SearchCacheStore } from './search-cache';

/**
 * Redis-backed search cache. All operations are best-effort: any connection or
 * parse error is swallowed (logged once at warn) so the search path degrades to
 * "no cache" rather than failing. Keys are namespaced and expire via Redis PX.
 */
export class RedisSearchCache implements SearchCacheStore, OnModuleDestroy {
  private readonly log = new Logger('SearchCache');
  private readonly prefix = 'search:';

  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<RankedHit[] | null> {
    try {
      const raw = await this.redis.get(this.prefix + key);
      return raw ? (JSON.parse(raw) as RankedHit[]) : null;
    } catch (err) {
      this.log.warn(`get failed (serving uncached): ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, hits: RankedHit[], ttlMs: number): Promise<void> {
    try {
      await this.redis.set(this.prefix + key, JSON.stringify(hits), 'PX', ttlMs);
    } catch (err) {
      this.log.warn(`set failed (skipping cache write): ${(err as Error).message}`);
    }
  }

  // Close the persistent ioredis connection on app shutdown so it doesn't keep
  // the event loop alive (and so the server shuts down gracefully). quit() drains
  // pending commands; if it can't (e.g. already offline), force-disconnect.
  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
