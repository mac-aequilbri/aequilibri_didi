// Canonical action-status vocabulary + normalization.
//
// The single source of truth for what an action "status" means across the
// platform. Migrated bases often carry a messy Status vocabulary (phase names,
// legacy labels, typos) that predates the platform's four canonical statuses.
// Every reader (Action Hub, dashboard, nav counts, highlights) routes raw
// Airtable Status values through resolveActionStatus() so they agree, and any
// value that isn't recognised is flagged for the user to map — see the
// action_status_map cleanup flow in configSource + the Action Hub UI.

export const ACTION_STATUSES = ["open", "in_progress", "done", "deferred"] as const;
export type AppStatus = (typeof ACTION_STATUSES)[number];

export function isAppStatus(s: string): s is AppStatus {
  return (ACTION_STATUSES as readonly string[]).includes(s);
}

/** Ref_Type used for the per-org raw→canonical status mappings stored in
 *  PLAT_CFG_REFERENCE (the same config table onboarding seeds). */
export const STATUS_MAP_REF_TYPE = "action_status_map";

/** Normalised lookup key for a raw status value (trim + lowercase), so
 *  "In Progress", "in progress" and " IN PROGRESS " all collapse to one key. */
export function normStatusKey(raw: string): string {
  return raw.trim().toLowerCase();
}

// The canonical Airtable single-select option names the platform itself writes
// (inverse of ACTION_STATUS in fieldMaps.ts). Values matching these are "clean"
// — no mapping needed. Keyed by normalised form.
const KNOWN_AIRTABLE_STATUS: Record<string, AppStatus> = {
  open: "open",
  "in progress": "in_progress",
  complete: "done",
  deferred: "deferred",
};

// Best-effort suggestion for an unrecognised value — used ONLY to prefill the
// mapping UI. Never auto-counted. First matching rule wins, so order matters:
// the specific "not started" case precedes the generic "started" signal.
const SUGGEST_RULES: Array<{ re: RegExp; status: AppStatus }> = [
  { re: /not\s*started|to[\s-]*do|backlog/, status: "open" },
  { re: /complete|done|closed|resolved|finished|delivered|installed|\bpaid\b/, status: "done" },
  { re: /cancel|remove|defer|on\s*hold|\bhold\b|won'?t|abandon|dropped|\bn\/?a\b/, status: "deferred" },
  {
    re: /in[\s-]*progress|\bwip\b|active|ongoing|started|underway|waiting|pending|review|follow[\s-]*up|require|decision|\blive\b|procurement|construction|selection|design|order|security|smart/,
    status: "in_progress",
  },
  { re: /new|raised|logged|planned|\bopen\b/, status: "open" },
];

/** A sensible canonical guess for a raw value, or null when nothing matches.
 *  For UI prefill only — the user confirms it via the mapping panel. */
export function suggestStatus(raw: string): AppStatus | null {
  const key = normStatusKey(raw);
  if (!key) return null;
  if (KNOWN_AIRTABLE_STATUS[key]) return KNOWN_AIRTABLE_STATUS[key];
  for (const rule of SUGGEST_RULES) if (rule.re.test(key)) return rule.status;
  return null;
}

export interface StatusResolution {
  raw: string;
  /** The canonical status, or null when the value isn't recognised/mapped. */
  canonical: AppStatus | null;
  /** True when canonical came from a known option or an explicit org mapping
   *  (i.e. NOT a guess) — only clean rows feed the open/overdue metrics. */
  clean: boolean;
}

/** Resolve a raw Airtable Status against the built-in vocabulary and the org's
 *  own mappings. Known option → clean; org-mapped → clean; anything else →
 *  unmapped (flagged, not counted). */
export function resolveActionStatus(raw: string, orgMap: Map<string, AppStatus>): StatusResolution {
  const key = normStatusKey(raw);
  if (!key) return { raw, canonical: null, clean: false };
  const known = KNOWN_AIRTABLE_STATUS[key];
  if (known) return { raw, canonical: known, clean: true };
  const mapped = orgMap.get(key);
  if (mapped) return { raw, canonical: mapped, clean: true };
  return { raw, canonical: null, clean: false };
}
