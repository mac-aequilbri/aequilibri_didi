// Source cascade manager (Platform Architecture doc utility layer): given
// providers in priority order, try each until one returns a valid result.
// Provenance (which source answered, what was attempted) is always kept.

export interface SourceProvider<T> {
  name: string;
  /** Base confidence for values from this source (0–100). */
  confidence: number;
  fetch(): Promise<T | null>;
}

export interface CascadeOutcome<T> {
  value: T | null;
  confidence: number;
  source: string;
  attempts: { source: string; ok: boolean; error?: string }[];
}

export async function resolveField<T>(
  providers: SourceProvider<T>[],
  opts: { minConfidence?: number } = {},
): Promise<CascadeOutcome<T>> {
  const attempts: CascadeOutcome<T>["attempts"] = [];
  for (const provider of providers) {
    if (opts.minConfidence != null && provider.confidence < opts.minConfidence) {
      attempts.push({ source: provider.name, ok: false, error: "below confidence threshold" });
      continue;
    }
    try {
      const value = await provider.fetch();
      if (value != null) {
        attempts.push({ source: provider.name, ok: true });
        return { value, confidence: provider.confidence, source: provider.name, attempts };
      }
      attempts.push({ source: provider.name, ok: false, error: "no result" });
    } catch (err) {
      attempts.push({
        source: provider.name,
        ok: false,
        error: String(err instanceof Error ? err.message : err).slice(0, 200),
      });
    }
  }
  return { value: null, confidence: 0, source: "none", attempts };
}
