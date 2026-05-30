import type { RankedHit } from './search.service';

/** DI token for the optional search query cache (a Redis-backed store, or null). */
export const SEARCH_CACHE = Symbol('SEARCH_CACHE');

/**
 * Stores ranked search hits keyed by a normalized query+filters+personalization
 * string. Implementations must be best-effort: a backend (Redis) failure must
 * never throw into the search path — get returns null, set is a no-op.
 */
export interface SearchCacheStore {
  get(key: string): Promise<RankedHit[] | null>;
  set(key: string, hits: RankedHit[], ttlMs: number): Promise<void>;
}
