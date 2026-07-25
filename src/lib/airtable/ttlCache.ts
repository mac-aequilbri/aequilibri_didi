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
  private insertsSinceSweep = 0;

  constructor(
    private readonly ttlMs: number,
    /** Hard bound on live entries. Long-lived processes accumulate one-off
     *  keys (per-record gets, per-filter lists) that are never re-requested,
     *  so expiry alone never frees them — the sweep + bound below do. */
    private readonly maxEntries = 5_000,
  ) {}

  /** Return the cached value for `key`, or run `load` and cache its promise.
   *  A rejected load is evicted immediately so errors are never cached. */
  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.map.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = load();
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.maybeSweep();
    value.catch(() => {
      if (this.map.get(key)?.value === value) this.map.delete(key);
    });
    return value;
  }

  /** Every 100 inserts, drop expired entries; if still over the bound, drop
   *  the oldest-inserted entries (Map preserves insertion order). Keeps memory
   *  flat without a timer, so serverless/short-lived processes pay nothing. */
  private maybeSweep(): void {
    if (++this.insertsSinceSweep < 100 && this.map.size <= this.maxEntries) return;
    this.insertsSinceSweep = 0;
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
    if (this.map.size > this.maxEntries) {
      const excess = this.map.size - this.maxEntries;
      let dropped = 0;
      for (const key of this.map.keys()) {
        if (dropped++ >= excess) break;
        this.map.delete(key);
      }
    }
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
