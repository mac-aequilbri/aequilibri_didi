// Airtable migration — per-base rate limiter.
//
// Airtable allows 5 requests/sec PER BASE. That is a rate on request STARTS,
// not a requirement that calls run one-at-a-time — so we space starts ~220ms
// apart (~4.5 req/s, a safety margin under the cap) and let responses overlap.
// Serializing on completion instead would cap throughput at
// 1/(latency + 220ms) ≈ 2 req/s and make parallel page loads run sequentially.
//
// Callers that need write-then-read ordering already get it by awaiting the
// write before issuing the read; unrelated concurrent calls have no ordering
// contract.

const MIN_INTERVAL_MS = 220;

/** Per-base timestamp of the next free start slot. */
const nextSlotAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reserve the next start slot for `baseId` and run `fn` when it arrives.
 *  Resolves/rejects with fn's own result. */
export async function throttle<T>(baseId: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt.get(baseId) ?? 0);
  nextSlotAt.set(baseId, slot + MIN_INTERVAL_MS);
  if (slot > now) await sleep(slot - now);
  return fn();
}
