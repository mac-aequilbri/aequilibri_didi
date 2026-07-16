// Governance Phase 3 — role taxonomy, sub-roles, and the §2.2 permission
// matrix as data.
//
// D5 mapping (code role → framework role): owner→Administrator (tenant) /
// Business Owner · builder→Manager (Delivery Manager) · architect→Contributor ·
// broker→Viewer. The code names stay the stored values (no data migration);
// framework names are the display/mapping layer.
//
// Sub-roles (§2.1) ride on the stored Role string as "+"-suffixes on the base
// role — "builder+finance", "broker+auditor" — so no schema change is needed:
//   finance  → Finance Manager: finance-field visibility (CLS) + Approve on
//              Procurement/Budget/Cashflows.
//   auditor  → Auditor: whole-tenant read including finance fields; no writes.
//   business_owner → Business Owner: whole-tenant row scope (RLS bypass).
// normalizeTeamRole() strips the suffix, so every existing base-role check
// (isWriteRole/isAdminRole) keeps working on composite strings.
//
// Matrix notes: Delete is Administrator-only on every governed table. Budget/
// Cashflows stay Owner-write-only (Spec 12 Module 8) — stricter than the doc's
// "Manager RU"; flagged under D5. Tables outside the §2.2 matrix keep the
// platform's pre-existing rule (any write role).

import { isWriteRole, normalizeTeamRole, type TeamRole } from "./module1Governance";

export const SUB_ROLES = ["finance", "auditor", "business_owner", "delivery"] as const;
export type SubRole = (typeof SUB_ROLES)[number];

export interface ParsedRole {
  base: TeamRole;
  subs: ReadonlySet<SubRole>;
  /** Canonical storage form, e.g. "builder+finance". */
  canonical: string;
}

export function parseRole(raw: string): ParsedRole {
  const parts = raw.trim().toLowerCase().split("+").map((p) => p.trim());
  const base = normalizeTeamRole(parts[0] ?? "");
  const subs = new Set(parts.slice(1).filter((p): p is SubRole => (SUB_ROLES as readonly string[]).includes(p)));
  return { base, subs, canonical: [base, ...subs].join("+") };
}

/** Canonical composite string ("builder+finance") — use where the role is
 *  stored or displayed; normalizeTeamRole() where only the base matters. */
export function normalizeRoleString(raw: string): string {
  return parseRole(raw).canonical;
}

/** Framework (governance doc) name for a role, for display. */
export function frameworkRoleLabel(raw: string): string {
  const { base, subs } = parseRole(raw);
  if (subs.has("auditor")) return "Auditor";
  if (subs.has("finance")) return "Finance Manager";
  if (subs.has("business_owner")) return "Business Owner";
  return { owner: "Administrator", builder: "Manager", architect: "Contributor", broker: "Viewer" }[base];
}

// ── §2.2 permission matrix ───────────────────────────────────────────────────
// Per recordWriter table key: which base roles may create/update. Delete is
// owner-only; unlisted tables fall back to isWriteRole (pre-existing rule).
const WRITE_MATRIX: Record<string, ReadonlySet<TeamRole>> = {
  action: new Set(["owner", "builder", "architect"]),
  risk: new Set(["owner", "builder", "architect"]),
  decision: new Set(["owner", "builder", "architect"]),
  procurement: new Set(["owner", "builder", "architect"]),
  document: new Set(["owner", "builder", "architect"]),
  variation_order: new Set(["owner", "builder", "architect"]),
  budget_line: new Set(["owner"]),
  cashflow: new Set(["owner"]),
  learning_rule: new Set(["owner"]),
  job: new Set(["owner", "builder"]), // Contributor: R only (§2.2 Jobs row)
};

/** May this role perform the op on the table (human write path)? */
export function canWrite(roleRaw: string, table: string, op: "create" | "update" | "delete"): boolean {
  const { base } = parseRole(roleRaw);
  const governed = WRITE_MATRIX[table];
  if (op === "delete") {
    // Administrator-only on governed tables; unlisted tables keep the old rule.
    return governed ? base === "owner" : isWriteRole(base);
  }
  if (governed) return governed.has(base);
  return isWriteRole(base);
}

// Approve (§2.2 rightmost column): resolving PENDING_WRITES for the table.
// Mgr+ → owner or builder; Fin/Mgr → owner, or builder with +finance;
// Learning_Rules → Administrator only. Unlisted tables: Mgr+.
const FINANCE_APPROVE = new Set(["procurement", "budget_line", "cashflow"]);

export function canApprove(roleRaw: string, table: string): boolean {
  const { base, subs } = parseRole(roleRaw);
  if (base === "owner") return true;
  if (base !== "builder") return false; // Contributor/Viewer never approve
  if (table === "learning_rule") return false;
  if (FINANCE_APPROVE.has(table)) return subs.has("finance");
  return true;
}

/** CLS (§3): finance fields visible to Administrator, Finance Manager, and
 *  Auditor. Owner keeps full visibility as today. */
export function financeVisible(roleRaw: string): boolean {
  const { base, subs } = parseRole(roleRaw);
  return base === "owner" || subs.has("finance") || subs.has("auditor");
}

/** RLS (§3/§7): whole-tenant row scope — Administrator, Auditor, and the
 *  Business Owner sub-role bypass job-assignment scoping. */
export function rlsExempt(roleRaw: string): boolean {
  const { base, subs } = parseRole(roleRaw);
  return base === "owner" || subs.has("auditor") || subs.has("business_owner");
}
