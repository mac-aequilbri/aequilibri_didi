// Engagement-level RAG — derived at read time, never stored (Spec 12 Module 5
// §7 "RAG Status"). Same posture as budgetActuals(): the app computes the
// signal from underlying rows instead of trusting a stored rollup, so no
// schema change or base migration is needed and the value can never go stale.
//
// Aggregation rule (docs/spec12-lock-plan.md §5.4): worst-of-phases, with the
// spec's caveat that "a single phase moving to Red does not automatically make
// the whole engagement Red". Defaults, documented as LEARNING_RULES candidates
// (thresholds are meant to become owner-tunable per vertical, not policy
// hardcoded forever):
//   · 2+ Red phases                        → Red
//   · 1 Red phase AND an open Blocker      → Red
//   · 1 Red phase, or any Amber, or any open Blocker → Amber
//   · phases reporting, all Green          → Green
//   · no phase carries a RAG value         → "" (no signal — render nothing)

/** Derive the engagement (job) RAG from its phases' RAG values plus the count
 *  of open Blocker-type issues. `phaseRags` accepts raw cell values; anything
 *  that isn't Red/Amber/Green (any case) is ignored as "unset". */
export function computeJobRag(phaseRags: readonly string[], openBlockers = 0): string {
  let reds = 0;
  let ambers = 0;
  let greens = 0;
  for (const raw of phaseRags) {
    const s = (raw ?? "").trim().toLowerCase();
    if (s.startsWith("r")) reds++;
    else if (s.startsWith("a")) ambers++;
    else if (s.startsWith("g")) greens++;
  }
  if (reds >= 2 || (reds >= 1 && openBlockers > 0)) return "Red";
  if (reds === 1 || ambers >= 1 || openBlockers > 0) return "Amber";
  if (greens >= 1) return "Green";
  return "";
}
