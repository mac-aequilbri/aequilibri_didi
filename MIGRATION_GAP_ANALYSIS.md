# æquilibri — Django → Next.js Migration Gap Analysis

> **Question answered:** Will all functionality (UC1, UC2, UC3) be migrated? Where are the gaps?
> **Method:** Feature-by-feature comparison of the Django source (`aequilibri_poc/`) against the Next.js port (`aequilibri-next/`), verified by reading routes, server actions, services, the Prisma schema, and the original Django views/models.
> **Date:** 2026-06-08 · Evidence: `path` references are relative to `aequilibri-next/` unless noted.

---

## 1. Verdict

The migration is **well advanced and architecturally sound** — not a stub. The hard parts are done: the deterministic pricing engine, the Claude Vision roof pipeline, all 10 UC1 JSON APIs, the full Prisma data layer (**73 models**, exceeding Django's ~59), and *real* Claude integrations across all three apps. Several Django bugs were fixed in transit, and a new "Memory Architecture" layer was added to UC1.

**But it is not yet at functional parity.** There is a concrete punch-list of **missing pages, missing mutations, and two missing workflows** that must be built before cut-over. Estimated completeness:

| App | Completeness | Headline gap |
|-----|--------------|--------------|
| **UC1 Roofing** | ~80% | 5 missing pages/APIs + no PO-create + no condition-report create/detail/print |
| **UC2 Didi** | ~90% | Rule-code format divergence; overdue auto-mark dropped |
| **UC3 MSME** | ~92% | **Phase approval workflow missing**; **Decision CRUD missing** |
| **Data layer** | 100%+ | All models present; one-off import script exists (`scripts/migrate-uc1.mjs`) |

**Bottom line:** *Most* functionality is migrated, but **"all functionality" is not yet guaranteed** — the items in §5 are confirmed absent and would silently disappear at cut-over if not addressed.

---

## 2. What's been done well (parity or better)

- **Shared libs** (`src/lib/`): `claude.ts` (Opus 4.7 + demo fallback), `geometry.ts`, `money.ts` (decimal.js), `cache.ts`, `format.ts`, `db.ts`, `uc3-tenant.ts`. `[CONFIRMED]`
- **UC1 services fully ported with tests** (`src/services/uc1/`): `pricing.ts` (all three mechanisms — cost-plus, tapered bands, Good/Better/Best packages — plus travel zones, scope-of-works, GST), `roofVision.ts`, `solar.ts`, `geoscape.ts`, `footprints.ts`, `lidar.ts`, `correctionMemory.ts`, `roofQuality.ts`, `staticMap.ts`. Includes `pricing.test.ts` + `correctionMemory.test.ts` (Vitest) — UC1 has **more** test coverage than Django. `[CONFIRMED]`
- **All 10 UC1 JSON APIs ported** under `src/app/api/uc1/*` (+ a new `session-init`). Roof-drawing is a real Claude Vision call with caching and a quality score. `[CONFIRMED]`
- **UC3 AI features are real, not stubs** — chat, document analysis, report generation, meeting-minutes extraction, variation drafting, and delay-cascade all call Claude with tenant/project-scoped context and write `Uc3ExecutionLog` audit rows. `[CONFIRMED]`
- **Django bugs fixed in the port:** UC2 decision-create now logs to ChangeLog and learning-rules are size-capped; UC3 portal-expiry off-by-one fixed, meeting-minutes bulk-create wrapped in `db.$transaction()`, weekly-report context expanded to include open VOs + cashflows, document-analyze truncation now warns. `[CONFIRMED]`
- **New value-add (UC1 "Memory Architecture"):** `intelligence`, `team`, `regions`, `workstreams`, `action-hub` pages + a `documents` page in UC2 — features Django never had. `[CONFIRMED]`

---

## 3. UC1 — Roofing (gap detail)

| Django feature | Next.js | Status |
|----------------|---------|--------|
| Dashboard, roof-inspector | present | ✅ |
| Quotes: list/new/detail/print/delete + reprice + line-item add/delete | `quotes/*` + `quotes/[id]/actions.ts` | ✅ |
| Rate cards (list/create/delete/toggle) | `rate-cards` + actions | ✅ |
| Contacts, exec-log | present | ✅ |
| Guttering rates (CRUD) | `guttering-rates` + actions | ✅ |
| Solar partners + solar bundle (Google Solar) | `solar-partners`, `quotes/[id]/solar` | ✅ |
| Finance providers + quote finance | present | ✅ |
| Storm dashboard | `storm` | ✅ |
| Condition-report **list** | `condition-reports` | ✅ |
| Pricing engine (3 mechanisms) | `services/uc1/pricing.ts` | ✅ |
| 10 JSON APIs | `api/uc1/*` | ✅ |
| **Measurement history page** (`/measurement-history/`) | — | ❌ MISSING |
| **Price-check log page** (`/price-check-log/`) | — | ❌ MISSING |
| **Storm detail** (`/storm/<pk>/`) | — | ❌ MISSING |
| **Condition-report create** (from quote) | — | ❌ MISSING |
| **Condition-report detail + print** | — | ❌ MISSING |
| **`measurement-snapshot` API** | — | ❌ MISSING (verified: no `api/uc1/measurement-snapshot/`) |
| **Purchase-order create** (from quote) | only list + `[po_id]` detail exist; no create action | ❌ MISSING |
| **Purchase-order print** | — | 🟡 PARTIAL (detail only) |
| **Auto-add guttering** endpoint (`/quotes/<pk>/auto-guttering/`) | gutter LM is a manual wizard field; no auto-calc | 🟡 PARTIAL |

> Verified by direct filesystem checks — the five `❌ MISSING` directories/routes do not exist, and there is no `createPurchaseOrder`/condition-report/auto-guttering action anywhere in `src/`.

---

## 4. UC2 — Didi (gap detail)

All 18 models migrated (`Uc2*` in `prisma/schema.prisma`); all 15 Django pages present; chat loop ported into server actions (`src/app/(uc2)/uc2/actions.ts`, `.../learning-rules/actions.ts`).

| Item | Status | Note |
|------|--------|------|
| Chat send (system prompt + learning rules + Claude + demo) | ✅ | Top-20 rules injected; cookie hardened (httpOnly/Secure/SameSite) |
| Proposal detect, hypothesis auto-gen, ExecutionLog | ✅ | Heuristic now keys on AI response (Django keyed on user input) |
| Confirm / **reject** proposal | ✅ (reject behaviour improved vs Django) | |
| All read-only pages (budget/phases/vendors/cashflow/room-matrix/project-plan/change-log) | ✅ | |
| Decision + procurement create with ChangeLog | ✅ (fixed vs Django) | |
| **Hypothesis → rule promotion code format** | 🟡 DIVERGENCE | Emits `HYP-<id>-<timestamp>` (`learning-rules/actions.ts:20`), not Django's sequential `LRN-####`. Works, but breaks the convention the system prompt itself references; `reviewedBy` hardcoded `"system"`. |
| **Dashboard overdue auto-mark** | 🟡 DROPPED | Django flips stale actions to `overdue` on load; Next only *counts* them. Behavioural drift. |
| Confirmed proposals actually execute the DB write | ❌ (parity) | Sets a flag + logs only — **same as Django**. Still not implemented in either. |

---

## 5. UC3 — MSME (gap detail)

35+ server actions in one `src/app/(uc3)/uc3/actions.ts`; all major AI flows real. Multi-tenant isolation is cookie-based (`uc3_tenant_id` via `lib/uc3-tenant.ts`) and queries filter by `tenantId`.

| Item | Status | Note |
|------|--------|------|
| Projects, actions, risks, budget, cashflow, vendors CRUD | ✅ | |
| Variation orders (create/AI-draft/approve/reject, `VO-###-###`) | ✅ | |
| AI chat (tenant/project scoped, approval marker) | ✅ | |
| Document analyze, weekly reports (draft→approve→send), delay cascade | ✅ | |
| Meeting minutes (Claude extraction + **atomic** bulk action create) | ✅ (fixed vs Django) | |
| Risk escalation (score = L×I, ≥15 HIGH) | ✅ | |
| Client portal (token mint, public read-only view, **expiry fixed**, view counter) | ✅ | |
| Accounting sync (Xero/MYOB/QBO simulated) | ✅ (stub, as in Django; plaintext token TODO) | |
| **Phase approval / review workflow** (`/phases/<pk>/review/`, `/phases/approvals/`) | ❌ MISSING | No routes, no `approvePhase`/`rejectPhase` actions — although `Uc3Phase.isAiDraft`/`approvedBy` exist in the schema. AI-drafted phases cannot be reviewed/approved. |
| **Decision CRUD** | ❌ MISSING | `Uc3Decision` model exists and the chat policy references it, but there are no pages/actions to create/confirm/supersede decisions. |
| **Cashflow planner** (scenario view) | 🟡 PARTIAL | Django `cashflow-planner` → Next has only the `cashflow` list/CRUD; dedicated scenario planner not found. |
| Confirmed AI chat actions execute the DB write | ❌ (parity) | `approveMessage` sets flags only — same limitation as UC2/Django. |
| Tenant fallback edge case | 🟡 | `risk-escalation` & `delay-cascade` pages inline a `findFirst({isActive:true})` fallback before redirecting — tidy up to use the shared helper. |

---

## 6. Cross-cutting items

- **Authentication:** No evidence of an auth layer in the Next.js app (no auth middleware/provider observed); UC3 relies on a cookie-set tenant id with no user identity. This mirrors the Django app's #1 risk (no `@login_required`) and the migration plan's "Clerk later" note. **Carry the auth gap forward as a known item — do not assume the migration closed it.** `[INFERRED — verify]`
- **Write-execution gap (UC2 + UC3):** In both apps the "confirm/approve" path records intent but never mutates the target table. This is a faithful port of a Django limitation, not a regression — but it means the AI-write feature is still cosmetic in both stacks.
- **Eval harness not ported:** Django's `evals/roof_eval/` (runner/metrics/report + ground-truth addresses) has no Next.js equivalent. Dev tooling only — low priority, but the roof-accuracy regression net is currently absent in the new stack.
- **Tests:** Next has 2 Vitest suites (pricing, correction memory) — better than Django for UC1, still nothing for UC2/UC3.
- **Data migration:** `scripts/migrate-uc1.mjs` copies core UC1 tables from the Django SQLite into Prisma (skips the 1.4 GB footprint table). One-off, clears target first. No equivalent import script seen for UC2/UC3 operational data `[INFERRED]`.

---

## 7. Punch list to reach full parity (prioritized)

**P1 — Missing workflows (functional loss at cut-over)**
1. UC3 **Phase approval/review** — add `/uc3/phases/approvals/` + `/uc3/phases/[id]/review/` pages and `approvePhase`/`rejectPhase` actions (schema already supports it).
2. UC3 **Decision CRUD** — list/create/detail pages + draft/confirm/supersede actions.
3. UC1 **Purchase-order create** — action to raise a PO from a quote (currently POs are read-only/imported).
4. UC1 **Condition-report create + detail + print** — three routes + a create action (only the list exists).

**P2 — Missing pages/APIs (data exists, no UI)**
5. UC1 **measurement-history** page + **`measurement-snapshot` API route** (so measurements persist as in Django).
6. UC1 **price-check-log** page.
7. UC1 **storm detail** page (`/storm/[id]`).
8. UC1 **purchase-order print** + **auto-guttering** action.
9. UC3 **cashflow-planner** scenario page (if the scenario view is required, not just the list).

**P3 — Fidelity / behavioural drift**
10. UC2 rule-code generation → restore sequential `LRN-####` and record the real promoter in `reviewedBy`.
11. UC2 dashboard → restore overdue auto-mark (or make it an explicit action).
12. UC3 → route the two fallback pages through the shared tenant helper.

**P4 — Parity decisions (affect both stacks)**
13. Decide whether "confirm/approve" should **execute** the AI-proposed write (UC2 + UC3) or stay advisory — and document it.
14. Decide on the **authentication** story before any public exposure (matches the Django report's top risk).
15. Port the **roof eval harness** if roof-accuracy regression testing matters post-migration.

---

## 8. Answer to "will all functionality be migrated?"

**Not as it stands today.** UC1 is ~80%, UC2 ~90%, UC3 ~92% complete. The data layer and the difficult engineering (pricing, vision, AI services, multi-tenant scoping) are fully migrated and in several places improved. However, **four workflows/pages would be lost entirely at cut-over** (UC3 phase approvals, UC3 decisions, UC1 PO-create, UC1 condition-report create/detail/print) plus several smaller pages and one API. Completing the §7 P1–P2 punch list closes the functional gap; P3–P4 restore fidelity and resolve the shared design decisions.
