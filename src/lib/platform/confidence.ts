// Confidence calculator (Platform Architecture doc utility layer).
// Scores are 0–100 integers throughout the platform.

export interface ConfidenceSignal {
  /** Where this signal came from (provenance, kept for reporting). */
  source: string;
  /** Relative weight; weights are normalised, so any positive scale works. */
  weight: number;
  /** 0–100. */
  score: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Weighted aggregate of individual signal confidences. */
export function calcConfidence(signals: ConfidenceSignal[]): number {
  const total = signals.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return 0;
  return clamp(signals.reduce((s, x) => s + Math.max(0, x.weight) * x.score, 0) / total);
}

/** Combine a source confidence with a rule confidence (both must hold). */
export function combine(a: number, b: number): number {
  return clamp((a * b) / 100);
}

export function confidenceBand(n: number): "low" | "medium" | "high" {
  if (n >= 80) return "high";
  if (n >= 50) return "medium";
  return "low";
}
