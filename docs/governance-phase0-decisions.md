# Governance Phase 0 — Decision Register

Source: Governance Framework v3.0 §12 + implementation plan Phase 0.
Approving authority: Claudia Salem (Product Owner). Fill **Decision** per item
(approve / amend as noted); engineering items are co-signed. Nothing in
Phases 1–5 that touches live data proceeds until its blocking decision here is signed.

Status legend: ☐ open · ☑ decided

## D1 — Final workflow vocabularies ☐

Adopt §5.3 as canonical, notably:
- ISSUES.Status = Open · In Progress · Blocked · Deferred · Closed
- PROCUREMENT.Status = Selection Required · Selected · Quoted · Invoiced · Paid · Delivered · Cancelled
  — Ordered+Invoiced merge into **Invoiced**; **On Hold / New / Confirmed removed**.

**Recommendation:** approve as written, with one amendment engineering requires: CHANGE_LOG gains
**Status = Pending** and **Change_Type = Variation** — Spec 12 stores variation orders in CHANGE_LOG
and uses those two values for its draft→submitted→approved flow; retagging them would break the app.
**Decision:** _______  **Date:** _______

## D2 — Adopt the five control rules (§5.2) as policy ☐

One canonical vocabulary per field · confidence-tiered application (HIGH batch / MED sampled / LOW reviewed) · force-to-review, never guess · dimension extraction · manual option-list cleanup.

**Recommendation:** approve — this is the governing decision; all §5.5 mappings and the Phase 2 write-path enforcement derive from it.
**Decision:** _______  **Date:** _______

## D3 — MED/REVIEW mapping sign-off ☐

The three large non-HIGH batches (HIGH rows execute under D1+D2 without further sign-off):

| Values | Count | Proposed | Recommendation |
|---|---|---|---|
| EXECUTION_LOG "Success" | 87 | Done | Approve — "Success" is a completed execution |
| LEARNING_RULES "Active" | 36 | Published | Approve — "Active" rules are in force |
| PLAN "Approved" | 48 | review | **Needs your call** — pick what "Approved" meant: (a) approved-to-proceed, not begun → Not Started; (b) in delivery → In Progress. Sampling 5–10 records against known project state settles it. |

Plus the small REVIEW rows in §5.5 (ISSUES category extractions, PROCUREMENT "Updated"/"On Hold", DECISIONS "Design Decision", DOCUMENTS "classified") — reviewed one-by-one at retag time, per rule 3.

**Decision:** _______  **Date:** _______

## D4 — New fields ☐

ISSUES.Category (Construction · Procurement · Smart Home/KNX · Security · Design · General) and PROCUREMENT.Priority (Critical · High · Medium · Low); add Critical to ISSUES.Priority.

**Recommendation:** approve — required by the dimension-extraction rows in §5.5.
**Owner:** Product Owner + Engineering.  **Decision:** _______  **Date:** _______

## D5 — Role taxonomy + code mapping ☐

Confirm the 4 main roles (Administrator / Manager / Contributor / Viewer) with the Business Owner / Delivery Manager split as Manager sub-roles, and the mapping from the platform's current roles:

| Code role (today) | Framework role |
|---|---|
| owner | Administrator (tenant-scoped) / Business Owner |
| builder | Manager (Delivery Manager) |
| architect | Contributor |
| broker | Viewer |
| PLATFORM_ADMIN_EMAILS | Administrator (cross-tenant) |

**Recommendation:** approve the mapping; renames + sub-role mechanism land in Phase 3 without breaking existing members (legacy names already normalize).
**Decision:** _______  **Date:** _______

## D6 — Clerk Organizations ☐

§2.3 proposes one Clerk Organization per tenant. Built alternative (live since 2026-07-15): PLAT_TEAM is the authoritative membership store; Clerk authenticates identity only; invitations via Clerk email.

**Recommendation:** keep PLAT_TEAM authoritative (Airtable is the system of record; keeps Clerk swappable). Revisit Clerk Organizations only if Clerk-native org billing/SSO-per-tenant becomes a requirement.
**Decision:** _______  **Date:** _______

## D7 — TEAM population order ☐

Blocks 335+ linked-record fields in the Didi base.

**Recommendation:** enter in this order — 1 Administrator (delivery team), 1 Business Owner (client executive), then the Dulong Downs delivery team; each linked to their JOBS. Names/emails to be supplied by Product Owner.
**Decision:** _______  **Date:** _______

## D8 — DOMAIN_LABELS ownership ☐

**Recommendation:** Administrator owns population and schema hygiene; Domain SME (sub-role, Phase 3) authors label content. Product Owner supplies the agreed sample sets for Construction/Roofing.
**Decision:** _______  **Date:** _______

## D9 — Reporting MVP scope (§9) ☐

**Recommendation:** ship first — Budget vs. Actual (builder-invoice reconciliation is the existing analog), Open Issues, Risk Heatmap; already closest to shipped Spec 12 surfaces. Defer Decision Register and the AI-generated set to the next cycle.
**Decision:** _______  **Date:** _______

---
When all nine are signed: D1–D4 unblock Phase 1 (retag + new fields), D5–D6 unblock Phase 3 (RBAC), D7–D8 unblock TEAM/label population, D9 scopes Phase 4/5 reporting.
