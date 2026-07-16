# Governance Framework v3.0 — Implementation Plan

Source: "aequilibri Governance Framework v1.docx" (doc version 3.0, prepared from the live Dulong Downs DiDi base, 39 tables). This plan maps each framework section to the current codebase and sequences the work.

## Status — 2026-07-15

**Done (on master):**
- Authentication & User Provisioning — provisioning service, Team & access page, last-owner guard (f96df69)
- Phase 0 decision register `docs/governance-phase0-decisions.md`, D1–D9 with recommendations (4874070)
- Phase 1 tooling — retag script + full §5.5 map; dry-run validated vs Didi: HIGH 336 · MED 212 · REVIEW 111 · unknown 0 (4874070)
- Phase 2 — canonical-vocab enforcement at the write choke point + off-vocab write fixes (35a746e)

**Pending:**
| # | Item | Blocked on |
|---|---|---|
| P1 | D1–D9 sign-off (incl. the CHANGE_LOG Pending/Variation amendment in D1) | Claudia Salem |
| P2 | Retag apply — HIGH batch (`--apply`), then MED (`--med`) after sampling | D1–D4 · D3 |
| P3 | PLAN "Approved" (48 rec) + REVIEW rows resolution from the review CSV | D3 |
| P4 | TEAM population (unblocks 335+ linked fields) | D7 names |
| P5 | Manual option-list cleanup in Airtable UI (orphans, PLACEHOLDER) — §5.2 rule 5 | after P2 |
| P6 | RISKS / TEAM / COMMS / CORRECTIONS status vocabularies — not enumerated in the framework doc | Product Owner to supply |
| P7 | Clerk activation in prod (env keys, PLATFORM_ADMIN_EMAILS, restricted sign-up, self-invite first) | operator task |
| P8 | Phase 3 core built (matrix, sub-roles, CLS, approvals gating, RLS on projects list) — D5–D6 ratify | Claudia Salem |
| P8b | RLS rollout to remaining job-scoped sources + job detail; Clerk custom-role sync | P8 + D7 TEAM data |
| P9 | Phase 4 read layer + ENGAGEMENT_TYPE_CONFIG seeding built — label population | D8 samples |
| P9b | Labels on list columns/nav; full §6 questionnaire (security roles, reporting prefs) | P9 |
| P10 | Master-data linking APPLY (tool built; BUDGET dry-run done; CASHFLOWS master table missing) | P2 retag + PO master-list review |
| P10b | Reports beyond MVP; agents UI + linking tool shipped 2026-07-16 | D9 scope |
| P11 | Zod strict validation on the Airtable write path; assistant-prompt vocab note | engineering, unblocked |

## Gap summary (framework → code)

| Framework requirement | Current state | Gap |
|---|---|---|
| §1 Three-tier architecture (Core / Customer Config / Domain Extension) | Spec 12 template architecture already live (`provision.ts`, control base) | Aligned — verify `_TIER` stamping only |
| §2 RBAC: Administrator / Manager / Contributor / Viewer + sub-roles | Roles are `owner / builder / architect / broker` (`module1Governance.ts:43-75`) | **Taxonomy mismatch**; no sub-role mechanism; Approve is "any write role", not per-table matrix |
| §3 RLS (rows via TEAM→JOBS link) | Org-level isolation only; no per-user job scoping | **Missing entirely** |
| §3 CLS (finance fields hidden from Contributor/Viewer) | `requireFinancialAccess` is owner-only route gating | Partial — need field-level hiding per role |
| §3 FLS (Approve via PENDING_WRITES) | Fully implemented (`recordWriter.ts`, approvals inbox, Resolved_By, EXECUTION_LOG) | Aligned — needs role-matrix gating on who approves what |
| §4 DOMAIN_LABELS runtime | Table provisioned, never read; labels hardcoded (`nav.ts`) | **Missing read/cache layer**; table unpopulated |
| §5 Canonical vocabularies + force-to-review | Zod enums exist but **Airtable write path bypasses them** (`writeRecord` skips validation; typecast auto-creates options); fallbacks coerce (`?? "Open"`) instead of flagging | **Biggest correctness gap** — no vocab validator, no review-default quarantine |
| §5.5 Retag ~1,900 records across 15 fields | No bulk-retag tooling (scripts are schema-oriented) | New script needed |
| §5.6 Required fields on write | Zod path only (Postgres/forms); bypassed in Airtable mode | Enforce on Airtable path |
| §8 Agent vocabulary binding | Tool→table scopes already structural (`TOOL_POLICY`); values unvalidated | Bind tool writes to canonical vocab |
| §9 Reporting | Standard reports largely shipped (Spec 12 P3) | Confirm MVP scope vs §9 list |

## Phase 0 — Product Owner decisions (blocking, no code)

Decision register with recommendations + sign-off fields: `docs/governance-phase0-decisions.md`.
From §12, these block later phases; get sign-off from Claudia Salem first:
1. Final vocabularies for ISSUES.Status and PROCUREMENT.Status (incl. Ordered→Invoiced, removal of On Hold).
2. Adopt the five control rules (§5.2) as policy — enables all §5.5 mappings.
3. MED/LOW review sign-off: PLAN "Approved" (48), EXECUTION_LOG "Success" (87), LEARNING_RULES "Active" (36), plus the REVIEW rows.
4. New fields ISSUES.Category, PROCUREMENT.Priority.
5. Role taxonomy: confirm 4 main roles + Business Owner/Delivery Manager split, and the mapping from current code roles (proposal: owner→Administrator(tenant)/Business Owner, builder→Manager/Delivery Manager, architect→Contributor, broker→Viewer; platform admin = cross-tenant Administrator).
6. TEAM population order; DOMAIN_LABELS ownership; Reporting MVP scope.

## Phase 1 — Data remediation (unblocks everything else) — tooling built 2026-07-15, apply gated on D1–D4

1. **Generic retag script** `scripts/airtable-retag-vocab.mjs`: takes a mapping file (field → {current value → canonical value, confidence}), applies HIGH rows in batch, emits MED/LOW rows to a review CSV, logs every change to EXECUTION_LOG. Dry-run mode default.
2. **Mapping data**: encode the full §5.5 register as `scripts/data/governance-retag-map.json` (15 fields, incl. dimension-extraction rows that set Category/Priority + review-default status).
3. **New fields** via existing template migration path (`provision.ts` / schema-drift additive migration): ISSUES.Category (6 values), PROCUREMENT.Priority (4 values); add Critical to ISSUES.Priority; pre-define empty-table vocabularies (RISKS.Status, TEAM.Status, COMMS.Status, CORRECTIONS.Resolution_Status).
4. **Run retag** on Didi base (HIGH batch → MED after sample sign-off → REVIEW rows per Phase 0.3), then regenerate `schema.generated.ts`.
5. **TEAM population**: seed Administrator + Business Owner + delivery team (unblocks 335+ linked-record fields). Data-entry task with a small seeding script.
6. Manual Airtable step (tracked, not coded): remove orphaned options/PLACEHOLDER values from choice lists (§5.2 rule 5).

## Phase 2 — Vocabulary enforcement layer (write-path hardening) — built 2026-07-15

Implemented: `src/lib/platform/vocab.ts` (canonical sets + review-defaults per §5.3) enforced at
the single Airtable write choke point (`recordWriter.performWrite`, post-toFields) — covers human
forms, AI tools, ingestion, and approved proposals. Case variants normalize; unknowns force to the
review-default and are warn-logged. Fixed at source: EXECUTION_LOG audit writer ("executed"/
lowercase ops → Done/Create/Update/Delete), DECISION_STATUS confirmed→Approved (was off-vocab
"Made"), ACTION_STATUS done→Closed (was "Complete"), procurement create default Ordered→Selection
Required, cashflow create default Forecast→Scheduled; read maps now recognise Approved/Closed/
Blocked (live "Approved" decisions previously displayed as proposed). CHANGE_LOG keeps
Pending/Variation pending the D1 amendment. Deferred: RISKS/TEAM/COMMS/CORRECTIONS sets (not
enumerated in the doc), Zod strict-mode on the Airtable path, assistant-prompt vocab note.

1. **Canonical vocab module** `src/lib/platform/vocab.ts`: single source for every Workflow + Classification field's canonical set and its review-default (Open / Selection Required / etc.), generated-checked against `schema.generated.ts`.
2. **Enforce on the Airtable write path**: in `recordWriter.ts`, stop skipping validation in Airtable mode — validate controlled fields against vocab; unknown value → force-to-review default + flag (never guess, never auto-create options; disable typecast option-creation for controlled fields).
3. **Required fields on Airtable path** (§5.6): apply the Risk/Issue/Decision/Procurement mandatory sets in `writeRecord` regardless of backend.
4. **Replace silent coercions** in `fieldMaps.ts` (`?? "Open"` style) with review-default + surfaced flag so non-conforming inbound values are visible, not laundered.
5. **Agent binding** (§8): assistant tool write schemas in `tools.ts` use vocab enums; executor rejects/reroutes off-vocab values to review-default before proposing to PENDING_WRITES.
6. Update assistant/system prompts + learning rules to state the vocab policy (§5.6 "assistant instructions updated on finalisation").

## Phase 3 — RBAC expansion — core built 2026-07-16 (pending D5–D6 ratification)

Implemented: `src/lib/platform/roles.ts` — §2.2 permission matrix as data, sub-role mechanism
("+finance", "+auditor", "+business_owner" suffixes on the stored Role string; D5 framework-name
mapping as display layer). Enforcement: human writes matrix-checked at the recordWriter choke
point; Approve re-gated per table in the approvals actions (financial tables need Owner or
Finance Manager; learning rules Administrator-only). CLS: finance surfaces (nav, reporting
policy, assistant query tables) open to Owner/Finance Manager/Auditor via `financeVisible()`.
RLS: `rls.ts` resolves the viewer's TEAM→JOBS assignments tolerantly (unscoped until D7
populates TEAM); wired into the projects list; Administrator/Auditor/Business Owner exempt.
Still pending: RLS on the remaining job-scoped list sources + job detail (P8b), Clerk custom
roles/permissions sync, Budget/Cashflows "Manager RU" vs Spec 12 owner-only (kept stricter —
D5 note).

1. **Role taxonomy**: extend `module1Governance.ts` to the 4 main roles + sub-role mechanism (sub-role = named permission bundle on top of a main role: Finance Manager, Auditor, Business Owner, Delivery Manager). Map to Clerk custom roles/permissions; one Clerk Organization per ORGANISATIONS record (resolves the flagged COMMS.Stakeholder_Role dependency).
2. **Permission matrix** (§2.2): codify the CRUD+Approve matrix as data (table × role → rights) in one module; enforce in `getCurrentUser`/`writeRecord` (writes), approvals actions (Approve per table: Fin/Mgr vs Mgr+ vs Admin), and per-record approval flags (LEARNING_RULES.Override_Permission, HYPOTHESES.Promote_to_Rule).
3. **CLS** (§3): finance fields (BUDGET.Estimated/Forecast, CASHFLOWS.Amount, PROCUREMENT.Unit_Cost/Total_Cost) filtered out of list/detail/AI-context reads for Contributor + base Viewer — enforce in the data sources, not just UI.
4. **RLS** (§3/§7): TEAM records gain JOBS links; list sources filter to the user's assigned JOBS (Business Owner sub-role = whole tenant; Administrator/Auditor bypass). This touches every list source — reuse the shared `listQuery` layer so it lands once.

## Phase 4 — Domain labels + onboarding metadata — read layer built 2026-07-16

Implemented: `src/lib/platform/domainLabels.ts` — cached (10-min TTL), tolerant DOMAIN_LABELS
read layer keyed `${Core_Table}.${Core_Field_Label}`, vertical-matched with General fallback;
overlaid onto every record-edit window via one hook in the shared RecordEditPage (app field →
Core field translated through the write field maps; Context_Note becomes help text). Strict
no-op until D8 populates the table. Onboarding now seeds one ENGAGEMENT_TYPE_CONFIG row per
allowed engagement type (§6, canonical option names). Still pending: D8 label content
(Product Owner samples), labels on list-window columns/nav (needs the listQuery merge, plan
P9b), the full §6 questionnaire steps (security roles + reporting prefs at onboarding).

1. **DOMAIN_LABELS read layer**: load once per session, cache (existing TTL-cache layer), render `Domain_Label` for Core fields across nav/list/detail; fall back to hardcoded labels when no record.
2. **Populate** Construction/Roofing label sets (Product Owner supplies samples per §12).
3. **Onboarding questionnaire** (§6): extend `/app/new` onboarding to capture Business / Engagement Types / Security roles / Reporting / Domain Mappings → writes ENGAGEMENT_TYPE_CONFIG + DOMAIN_LABELS rows. Dulong Downs config = first template.

## Authentication & User Provisioning (framework gap — built 2026-07-15)

The framework defines authorization (§2 RBAC, §7 access levels) but not authentication or
account provisioning. Design adopted, consistent with "Airtable is the system of record":

- **Membership store is authoritative**: control-base `PLAT_TEAM` (Postgres `PlatCfgTeamMember`
  fallback) holds name/email/role/active per org. Clerk authenticates identity only; the
  signed-in email must match an active member row (`org-context.findMember`).
- **Invitation flow**: an owner invites by email on the Team & access page → member row created
  → Clerk invitation email sent (`clerkClient.invitations.createInvitation`). An email that
  already has a Clerk account gains access as soon as the row exists (no email needed).
- **Revocation**: deactivate sets `Is_Active=false`; access ends within the 60s control-cache
  TTL. Role changes take effect the same way. Last-active-owner guard prevents lockout.
- **Clerk Organizations** (doc §2.3 "one Clerk Organization per ORGANISATIONS record") is NOT
  implemented — membership lives in PLAT_TEAM instead. Whether to mirror into Clerk
  Organizations is part of the §12 Clerk-mapping decision (Phase 0 item 5); the current design
  keeps Clerk swappable and the registry queryable by the platform.
- **Operational note**: Clerk dashboard should be set to restricted sign-up (invitation-only),
  or unknown sign-ups simply land on `/app?denied=1` with no org access.

Implementation: `src/lib/platform/provisioning.ts` (invite/role/deactivate + guards),
`src/app/(platform)/app/[org]/team/` (owner-gated UI), `updateControlTeamMember`/
`listControlTeamAll` in `src/lib/airtable/control.ts`, nav entry in `nav.ts`.
Still open: sub-role provisioning (Finance Manager, Auditor — Phase 3), MFA/SSO policy
(Product Owner), TEAM-table JOBS-assignment links for RLS (Phase 3).

## Phase 5 — Deferred (per §11) — unblocked items built 2026-07-16

Implemented: **/app/[org]/agents** — §8 Agent-to-Data Authorization dashboard (admin-gated):
renders each agent's tools/tables/risk from the live registry + TOOL_POLICY (cannot drift from
enforcement), approver labels derived from the §2.2 matrix, and the one management control —
the org's AI write-authority level (updates control registry / Postgres, effective ≤60s).
**scripts/airtable-link-master-data.mjs** — generic §5.1-class-3 conversion (distinct values →
master rows → new link field → per-record links; additive, re-runnable, dry-run default,
EXECUTION_LOG audit). Didi dry-run: BUDGET.Budget_Category = 44 distinct values vs 9 REF_BUDGET
rows (incl. the PLACEHOLDER the doc flags). Not applied — P10 sequenced after the Phase 1 retag
and PO review of the master list; CASHFLOWS needs its cost-category master table created first
(REF_CATEGORIES absent from the Didi base). Reports beyond the MVP remain gated on D9.

- Convert Budget/Cashflow category fields to linked master-data records (after retag settles).
- Agent-allowlist management UI (backend already = PENDING_WRITES + TOOL_POLICY).
- Remaining §9 reports beyond the MVP scope chosen in Phase 0.
- Full DOMAIN_LABELS population for a second vertical (at onboarding time).

## Sequencing & risk notes

- Phase 1 and Phase 2 are independent of the role work and deliver the doc's "Immediate" items; Phase 2 should land **before or with** the retag going live, or new writes will re-pollute retagged fields.
- Phase 3 RLS is the largest item (touches all list sources); the shared `listQuery`/FilterBar layer (already unified across the 12 list windows) is the single integration point.
- All retagging runs against the live Didi base — dry-run + EXECUTION_LOG audit on every batch; no MED/LOW applies without Phase 0 sign-off (the doc is explicit on this).
- Table-rename migration (Spec 12, still pending) overlaps with Phase 1 field additions — sequence them together to avoid two schema passes on the same base.
