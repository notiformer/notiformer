interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/**
 * Simple in-memory TTL cache for gate values.
 * Reduces API calls when gate() is called frequently.
 */
export class GateCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): boolean | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: boolean, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
