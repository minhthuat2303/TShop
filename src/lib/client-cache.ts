'use client';

// Lightweight Client In-Memory & Session Storage Cache (Stale-While-Revalidate)
const memoryCache = new Map<string, { data: any; timestamp: number }>();

export function getClientCached<T = any>(key: string, maxAgeMs: number = 300000): T | null {
  // 1. Check RAM memory cache
  const mem = memoryCache.get(key);
  if (mem && (Date.now() - mem.timestamp) < maxAgeMs) {
    return mem.data as T;
  }

  // 2. Check SessionStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`tshop_cache_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < maxAgeMs) {
          memoryCache.set(key, parsed);
          return parsed.data as T;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function setClientCached<T = any>(key: string, data: T): void {
  const payload = { data, timestamp: Date.now() };
  memoryCache.set(key, payload);

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`tshop_cache_${key}`, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
}

export function clearClientCache(prefix?: string): void {
  if (prefix) {
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(prefix)) memoryCache.delete(k);
    }
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(`tshop_cache_${prefix}`)) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {}
    }
  } else {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('tshop_cache_')) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => sessionStorage.removeItem(k));
      } catch {}
    }
  }
}

export async function fetchWithInstantCache<T = any>(
  url: string,
  onCached?: (data: T) => void
): Promise<T> {
  // 1. Instant Cache Hit (0ms)
  const cached = getClientCached<T>(url);
  if (cached && onCached) {
    onCached(cached);
  }

  // 2. Background Revalidation
  const res = await fetch(url);
  const json = await res.json();
  if (json.success) {
    setClientCached(url, json.data);
    return json.data as T;
  }
  throw new Error(json.error?.message || 'Lỗi tải dữ liệu');
}
