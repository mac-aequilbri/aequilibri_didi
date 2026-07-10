// Airtable control plane — tiny in-process TTL cache.
//
// Control-plane lookups (org registry, team membership) sit on EVERY page and
// data call, but their contents change on the order of days. Caching them for
// a short TTL removes an entire Airtable round-trip from each data-layer call
// without a meaningful staleness cost. Write paths invalidate their slug
// explicitly, so the TTL only bounds staleness from edits made outside the app
// (e.g. directly in the Airtable UI) or from other server instances.
//
// The cache stores the in-flight promise, not the settled value, so concurrent
// callers for the same key share one request instead of stampeding.

interface Entry<V> {
  value: Promise<V>;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly map = new Map<string, Entry<V>>();

  constructor(private readonly ttlMs: number) {}

  /** Return the cached value for `key`, or run `load` and cache its promise.
   *  A rejected load is evicted immediately so errors are never cached. */
  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.map.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = load();
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    value.catch(() => {
      if (this.map.get(key)?.value === value) this.map.delete(key);
    });
    return value;
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Evict every key starting with `prefix` (e.g. all cached reads of one
   *  base+table after a write to it). */
  deletePrefix(prefix: string): void {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
