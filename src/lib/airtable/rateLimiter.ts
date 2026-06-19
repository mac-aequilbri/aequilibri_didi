// Airtable migration — per-base rate limiter.
//
// Airtable allows 5 requests/sec PER BASE. We serialize calls per base and
// space them ~220ms apart (~4.5 req/s, a safety margin under the cap). One
// failing call must not break the chain for the next, so the stored tail
// swallows settlement.

const MIN_INTERVAL_MS = 220;

const lastRunAt = new Map<string, number>();
const tail = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Queue `fn` behind any in-flight calls for `baseId`, spaced to respect the
 *  per-base rate limit. Resolves/rejects with fn's own result. */
export function throttle<T>(baseId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tail.get(baseId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - (lastRunAt.get(baseId) ?? 0));
    if (wait > 0) await sleep(wait);
    lastRunAt.set(baseId, Date.now());
    return fn();
  });
  tail.set(
    baseId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
