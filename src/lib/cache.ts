// High-Performance In-Memory Server Cache with TTL & Tag Invalidation

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

class ServerMemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxEntries = 500;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number = 60, tags: string[] = []): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest 20%
      const keys = Array.from(this.store.keys());
      for (let i = 0; i < Math.floor(this.maxEntries * 0.2); i++) {
        this.store.delete(keys[i]);
      }
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      tags,
    });
  }

  invalidateTags(tags: string[]): void {
    const tagSet = new Set(tags);
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.some((t) => tagSet.has(t))) {
        this.store.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

// Global singleton for warm serverless execution
declare global {
  // eslint-disable-next-line no-var
  var __server_cache__: ServerMemoryCache | undefined;
}

export const serverCache = global.__server_cache__ || new ServerMemoryCache();
if (process.env.NODE_ENV !== 'production') {
  global.__server_cache__ = serverCache;
}

export default serverCache;
