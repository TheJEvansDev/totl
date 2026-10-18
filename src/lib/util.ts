// Small shared helpers: deterministic randomness, caching and concurrency.

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic number in [0, 1) for a key. */
export function rand(key: string): number {
  // Murmur3 finaliser so similar keys give unrelated numbers.
  let h = hash(key);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function round(n: number): number {
  return Math.round(n);
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

/**
 * In-memory TTL cache. On Vercel each server instance has its own copy, so
 * it's a cheap first layer; fetches also use Next's data cache.
 */
export class TtlCache<T> {
  private store = new Map<string, CacheEntry<Promise<T>>>();
  constructor(private ttlMs: number, private maxEntries = 2000) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return hit.value;
    const value = load();
    this.store.set(key, { value, expires: now + this.ttlMs });
    // Don't cache failures.
    value.catch(() => this.store.delete(key));
    if (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    return value;
  }
}

/** Run async tasks with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
