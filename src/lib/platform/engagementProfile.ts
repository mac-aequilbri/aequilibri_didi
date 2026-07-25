// Engagement profiles — the read layer that finally makes ENGAGEMENT_TYPE_CONFIG
// real (Spec 12 Tier 3 / Module 5; docs/spec12-lock-plan.md §5.3). The table has
// been seeded at onboarding since spec-12 provisioning but was never consumed;
// this module resolves an engagement type to the construct-depth flags the spec
// defines per type (which PLAN rendering mode applies, whether the full RISKS
// register is active, cashflow granularity, portfolio activation).
//
// Resolution order: an Active ENGAGEMENT_TYPE_CONFIG row for the type wins;
// otherwise the spec's four engagement-type defaults apply — so an org whose
// base predates the table (or left it empty) behaves exactly as before.
// Reads are TTL-cached per org (domainLabels pattern) and tolerant of the
// table being absent on older bases.

import { airtableEnabled, core } from "@/lib/airtable";
import { TtlCache } from "@/lib/airtable/ttlCache";
import type { EngagementType, OrgCtx } from "./types";

/** PLAN rendering mode — Spec 12 Module 8's four modes of one view component. */
export type PlanViewMode = "gantt" | "checklist" | "workflow" | "season";

export interface EngagementProfile {
  engagementType: EngagementType;
  planView: PlanViewMode;
  /** Full RISKS register active (false = risk flags ride inline on ISSUES). */
  fullRiskRegister: boolean;
  /** Cashflow period granularity label (free text, e.g. "monthly"). */
  cashflowPeriod: string;
  /** Portfolio View activation (Spec 12 Module 8 — explicit flag, never
   *  auto-on; lock decision D-11). True when any Active config row opts in. */
  portfolioView: boolean;
}

/** Spec 12 Module 5 "Engagement type configuration" defaults, applied when no
 *  Active ENGAGEMENT_TYPE_CONFIG row overrides them. */
export function defaultProfileFor(type: EngagementType): EngagementProfile {
  switch (type) {
    case "short_job":
      return { engagementType: type, planView: "checklist", fullRiskRegister: false, cashflowPeriod: "deposit/final", portfolioView: false };
    case "ongoing":
      return { engagementType: type, planView: "workflow", fullRiskRegister: true, cashflowPeriod: "monthly", portfolioView: false };
    case "seasonal":
      return { engagementType: type, planView: "season", fullRiskRegister: true, cashflowPeriod: "seasonal", portfolioView: false };
    case "long_project":
      return { engagementType: type, planView: "gantt", fullRiskRegister: true, cashflowPeriod: "monthly", portfolioView: false };
    default:
      // "general" and anything unrecognised: safest shallow rendering, full registers.
      return { engagementType: type, planView: "checklist", fullRiskRegister: true, cashflowPeriod: "monthly", portfolioView: false };
  }
}

/** App engagement-type key from a stored cell ("Long Project" ↔ long_project). */
export function normalizeEngagementType(v: unknown): EngagementType | "" {
  const s = (typeof v === "string" ? v : "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "short_job" || s === "long_project" || s === "ongoing" || s === "seasonal" || s === "general") return s;
  if (s === "ongoing_lifecycle") return "ongoing";
  if (s === "seasonal_cycle") return "seasonal";
  return "";
}

function planViewFrom(v: unknown): PlanViewMode | "" {
  const s = (typeof v === "string" ? v : "").trim().toLowerCase();
  if (s.startsWith("gantt")) return "gantt";
  if (s.startsWith("check")) return "checklist";
  if (s.startsWith("workflow") || s.startsWith("state")) return "workflow";
  if (s.startsWith("season") || s.startsWith("calendar")) return "season";
  return "";
}

interface ConfigRow {
  engagementType: EngagementType | "";
  active: boolean;
  planView: PlanViewMode | "";
  fullRiskRegister: boolean | null;
  cashflowPeriod: string;
  portfolioView: boolean;
}

/** Pure overlay half (unit-testable): defaults for the type, overridden by its
 *  Active config row where the row actually says something. Portfolio View is
 *  org-level — any Active row opting in activates it. */
export function resolveProfile(type: EngagementType, rows: readonly ConfigRow[]): EngagementProfile {
  const base = defaultProfileFor(type);
  const row = rows.find((r) => r.active && r.engagementType === type);
  const portfolioView = rows.some((r) => r.active && r.portfolioView);
  if (!row) return { ...base, portfolioView };
  return {
    engagementType: type,
    planView: row.planView || base.planView,
    fullRiskRegister: row.fullRiskRegister ?? base.fullRiskRegister,
    cashflowPeriod: row.cashflowPeriod || base.cashflowPeriod,
    portfolioView,
  };
}

const cache = new TtlCache<ConfigRow[]>(10 * 60_000);
const S = (v: unknown): string => (typeof v === "string" ? v : "");

async function loadConfigRows(ctx: OrgCtx): Promise<ConfigRow[]> {
  if (!airtableEnabled()) return [];
  return cache.get(ctx.orgSlug, async () => {
    try {
      const rows = await core.list(ctx.orgSlug, "ENGAGEMENT_TYPE_CONFIG", { maxRecords: 50 });
      return rows.map((r) => ({
        engagementType: normalizeEngagementType(r["Engagement_Type"]),
        active: r["Active"] === true,
        planView: planViewFrom(r["Plan_View"]),
        // tri-state: absent column ≠ explicitly unchecked — only a real boolean overrides
        fullRiskRegister: typeof r["Full_Risk_Register"] === "boolean" ? r["Full_Risk_Register"] : null,
        cashflowPeriod: S(r["Cashflow_Period"]).trim(),
        portfolioView: r["Portfolio_View"] === true,
      }));
    } catch {
      return []; // table absent on a pre-spec-12 base — defaults apply
    }
  });
}

/** Resolve the profile for an engagement type (default: the org's default
 *  type). Per-job callers pass the job's own type once JOBS.Engagement_Type is
 *  provisioned; until then the org default governs. */
export async function getEngagementProfile(
  ctx: OrgCtx,
  engagementType?: EngagementType | "",
): Promise<EngagementProfile> {
  const type = engagementType || ctx.defaultEngagementType;
  return resolveProfile(type, await loadConfigRows(ctx));
}

/** Invalidate after ENGAGEMENT_TYPE_CONFIG writes (onboarding, admin edits). */
export function invalidateEngagementProfiles(orgSlug: string): void {
  cache.delete(orgSlug);
}
