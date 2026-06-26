# Spec 10 Gap Analysis — Production Build Specification (Manila Build Brief)

Assessment of the `aequilibri-next` codebase against *aequilibri Production Build Specification — Manila Build Brief* (**Build Spec 10**).
Date: 2026-06-26. Branch assessed: `feat/uc3-proposal-gate` (over `master`).
Supersedes `docs/SPEC_GAP_ANALYSIS.md` (Spec 5, 2026-06-24).

## What changed Spec 5 → Spec 10

The per-module *functional* alignment from the Spec 5 analysis still holds. Spec 10's new material is almost entirely **architectural / schema**, dated "confirmed 25 June 2026":

1. **Core grew 12 → 21 tables.** Promoted to Core: `PHASES · RISKS · COMMS · CHANGE_LOG · PLAN · CASHFLOWS · BUDGET · PROCUREMENT · DOMAIN_LABELS`. These were Domain-Extension before; they are now identical-schema-in-every-base Core.
2. **Three Core renames** (manual per base, not API-able): `ACTION_HUB → ISSUES` (+ new `Issue_Type` field), `PROJECT_PLAN → PLAN`, `PROJECT_PHASES → PHASES`.
3. **`COMMS` is a brand-new Core table** — "not currently built in any base." Full field spec provided.
4. **`DOMAIN_LABELS`** formalised as the Core nomenclature layer (Core schema, records are Domain-Extension content).
5. **Engagement-type machinery**: `Phase_Type` (Linear/Cyclical/Parallel), `Loop_Permitted`, `Season_Year` on PHASES; four types (Short Job / Long Project / Ongoing Lifecycle / Seasonal Cycle) with construct-depth profiles; `Engagement_Type` on JOBS (not the customer).
6. **Cascading logic must become 7 explicit `LEARNING_RULES` records** (listed verbatim in Module 5).
7. **Module 6** now gives concrete numbers: detect threshold (5 corrections same Root_Cause+Source+Supplier/Phase), per-type validation thresholds (5/3/8/2-seasons), confidence formula (cap 85 → +1/apply → max 95, −5/override).
8. **Role taxonomy** is a single joint M1/M5/M7 dependency: COMMS `Stakeholder_Role` must equal the Clerk role list.
9. **Master Template `appIf959oh38fgKYp`** declared out-of-sync: needs the 9 new tables + 3 renames before any new customer is cloned.

> Stack note: Spec says **Vercel**; we run **Render** (`render.yaml`, no `vercel.json`). Functionally equivalent, but the spec lists Vercel as "confirmed, non-negotiable." Flag for sign-off. Everything else in the stack matches (Next.js 15 / React 19 / Clerk / shadcn; model routing Haiku-classify / Sonnet-default / Opus-gated — Opus pinned to 4.7, newer than spec's 4.6).

## Summary table (Spec 10)

| # | Module | Spec status | Alignment | Headline gap vs Spec 10 |
|---|--------|-------------|-----------|--------------------------|
| 1 | Customer Onboarding Engine | LOCKED | **~80%** ▼ | Provisioning/runbook/RBAC/registry solid, but the **21-table Core re-classification + 3 renames + COMMS/DOMAIN_LABELS** are not reflected in `schema.generated.ts` / `provision.ts`; Master Template still incomplete |
| 2 | Data Ingestion & Source Mgmt | LOCKED | **~70%** = | Pipeline wired; **live mailbox + n8n event trigger** still missing |
| 3 | Assessment Engine | LOCKED (arch) | **~70%** = | Tender comparison & architectural scope **not evidence-tested against real Peak / contract data**; still heuristic parsers |
| 4 | Document Management | LOCKED | **~70%** = | Renderer is minimal, not branded `pptxgenjs/docx`; auto-supersession + decision traceability partial |
| 5 | Work Intelligence Layer | DRAFT | **~55%** ▼ | **COMMS table absent**; cascading logic in code not as 7 LEARNING_RULES; `Phase_Type`/`Loop_Permitted`/`Season_Year` fields absent → ongoing/seasonal incomplete; `ISSUES`/`Issue_Type` not modelled |
| 6 | Learning Loop | DRAFT | **~60%** = | Loop wired but **not run with real volume**; Spec 10's concrete thresholds/confidence formula not implemented; no session-close capture prompt |
| 7 | Conversational Assistant | DRAFT | **~70%** = | Production role-scoped surface vs Claude Projects unresolved; **role taxonomy not reconciled** with COMMS/Clerk; voice absent; Postgres read tail |
| 8 | Reporting & Visualisation | DRAFT | **~55%** ▼ | No **live dashboards from live Airtable data**; four PLAN render modes (Gantt/workflow/season/checklist) not built; depends on COMMS + PROCUREMENT views |

▼ = revised down because Spec 10 added concrete requirements we don't yet meet. = = unchanged from Spec 5.

---

## The headline new gap: 21-table Core architecture

Current platform tables in `src/lib/airtable/schema.generated.ts` mapped to Spec 10's 21 Core tables:

| Spec 10 Core table | In our schema? | Notes / gap |
|--------------------|----------------|-------------|
| DECISIONS | ✅ DECISIONS | |
| WORKSTREAMS | ✅ WORKSTREAMS | |
| HYPOTHESES | ✅ HYPOTHESES | |
| CONTACTS | ✅ CONTACTS | |
| ORGANISATIONS | ✅ ORGANISATIONS | |
| LEARNING_RULES | ✅ LEARNING_RULES | |
| EXECUTION_LOG | ✅ EXECUTION_LOG | |
| CORRECTIONS | ✅ CORRECTIONS | |
| JOBS | ✅ JOBS | |
| DOCUMENTS | ✅ DOCUMENTS | |
| INTELLIGENCE_SNAPSHOT | ✅ INTELLIGENCE_SNAPSHOT | |
| **ISSUES** | ⚠️ ACTION_HUB | **Rename pending**; no `Issue_Type` field (Open Action / Blocker / Risk Materialised / Decision Required / Scope Change Trigger); no `Phase`/`Linked_Risk` links |
| PHASES | ⚠️ PHASES | Exists, but **missing `Phase_Type`, `Loop_Permitted`, `RAG`, `Sequence`, `Predecessor_Phase`, `Season_Year`** (has `Sort_Order`, `Completion_Pct`) |
| RISKS | ✅ RISKS | Verify `Linked_Issue` + auto-create-ISSUES-on-Materialised cascade |
| **COMMS** | ❌ — | **Missing entirely.** New Core table; full field spec in Spec 10 §Module 5 |
| **CHANGE_LOG** | ⚠️ VARIATIONS | We have construction VARIATIONS (variation orders); Spec 10 wants a Core, domain-generic CHANGE_LOG |
| **PLAN** | ⚠️ WORKSTREAMS + `project-plan` page | Naming/shape mismatch; Spec 10 PLAN is task-level (`Task_Name·Phase·Job·Predecessor·RAG`), distinct from WORKSTREAMS |
| CASHFLOWS | ⚠️ CASHFLOW | Singular vs plural — trivial rename |
| BUDGET | ✅ BUDGET | Verify `Actual` is calculated from confirmed PROCUREMENT, not entered |
| PROCUREMENT | ✅ PROCUREMENT | Verify Status→CASHFLOWS cascade + Expected/Actual→CORRECTIONS |
| **DOMAIN_LABELS** | ⚠️ PLAT_CFG_NOMENCLATURE | Nomenclature mechanism exists but as **Config tier**, not the Core `DOMAIN_LABELS` table the spec defines |

**Net:** 11 of 21 Core tables match cleanly; 7 need fields/renames; **COMMS is genuinely new**; DOMAIN_LABELS + CHANGE_LOG + PLAN are present-in-spirit but not in the spec's Core shape.

---

## Full gap list (grouped)

### A. Schema / architecture (the Spec 10 delta — highest priority)
1. **Build COMMS** as a Core table (Job·Stakeholder·Stakeholder_Role·Message_Type·Topic·Due_Date·Status·Phase·Linked_Issue·Linked_Decision·Sent_By) in the template + provisioner + `schema.generated.ts` + a fieldMap + a coordination surface.
2. **Rename ACTION_HUB → ISSUES** and add `Issue_Type`, `Phase`, `Linked_Risk` links. Touches schema, fieldMaps, routes (`/actions`), ingestion routing, assistant tools.
3. **Add engagement fields to PHASES**: `Phase_Type`, `Loop_Permitted`, `RAG`, `Sequence`, `Predecessor_Phase`, `Season_Year`.
4. **Promote DOMAIN_LABELS to a Core table** (or formally document PLAT_CFG_NOMENCLATURE as the accepted equivalent and get sign-off).
5. **CHANGE_LOG** as Core (decide: generalise VARIATIONS or add a separate Core table; the spec treats them as distinct).
6. **PLAN** naming/shape reconciliation vs WORKSTREAMS + `project-plan`.
7. **CASHFLOW → CASHFLOWS** rename (trivial).
8. **Re-sync the Master Template `appIf959oh38fgKYp`**: add the 9 tables + 3 renames so it can clone a Spec-10-compliant base. (Today the provisioner clones the demo base `appharWaojouHgMeW`; decide which becomes canonical.)
9. Add the 7 new/changed tables to `PLATFORM_TABLES` (`provision.ts:24`) + the script twin so clones include them.

### B. Module 5 — Work Intelligence
10. Write the **7 cascading rules as LEARNING_RULES records** (Trigger_Context + Operational_Directive), replacing the code-only `sourceCascade.ts` logic — or make the code emit/read them.
11. Implement **RISKS.Status→Materialised ⇒ auto-create ISSUES**, **PROCUREMENT.Status→Invoiced/Paid ⇒ CASHFLOWS**, **PROCUREMENT.Expected_Date change ⇒ review PLAN task** cascades.
12. **Ongoing / Seasonal engagement behaviours** (workflow-state vs season-calendar; `Loop_Permitted`, `Season_Year`).
13. **BUDGET.Actual derived from confirmed PROCUREMENT** (never manual) — verify/enforce.

### C. Module 6 — Learning Loop (implement the concrete numbers)
14. Detect threshold (5 corrections; same Root_Cause + Source_Module + Supplier|Phase) → HYPOTHESES with `Source_Corrections`, `Evidence_Count`, `Hypothesis_Type`.
15. Per-type validation thresholds (Domain 5 / Supplier 3 / Estimation 8 / Seasonal 2-seasons).
16. **Confidence formula** (cap 85 at promotion, +1/clean apply to 95, −5/override; ≤60 review, ≤50 auto Under-Review) + `Override_Permission` governance ladder.
17. Mandatory **Root_Cause** capture + session-start (≥3 new corrections surfaced) and **session-close correction prompt**.

### D. Module 1 / 5 / 7 — role taxonomy (single joint dependency)
18. Reconcile **one role list** across Clerk access (M1), COMMS `Stakeholder_Role` (M5), and assistant system-prompt scoping (M7): Owner/Builder/Architect/Broker (+ Supplier/Regulatory for COMMS). Spec calls this the highest-priority pre-build resolution.

### E. Module 2 / cross-cutting (carried from Spec 5, still open)
19. **Live mailbox adapter** behind the existing `EmailReader` interface (today `DemoEmailReader`).
20. **n8n event-triggered email workflow** — not deployed at all (the explicit n8n PoC).
21. **Finish + live-verify the Airtable-native migration** — kill the Postgres read tail, run the 3 add-* scripts on every existing client base, verify on Render with a valid PAT.

### F. Module 3 / 4 (carried, still open)
22. Evidence-test tender comparison against **real Peak tender / Master Building Contract** data.
23. Branded `pptxgenjs/docx` template system; automatic supersession on matching-topic+later-date; decision→document traceability consistently populated.

### G. Module 8 (revised down by Spec 10)
24. **Live dashboards from live Airtable data**: Issues Register → Phase RAG Board → Gantt → Engagement Status Snapshot → Budget Dashboard → Tender Comparison → Coordination Dashboard → Procurement Tracker → Portfolio (the spec's proposed sequence).
25. **Four PLAN render modes** (Gantt / workflow-state / season-calendar / checklist) selected by `JOBS.Engagement_Type`.
26. Coordination Dashboard **inline actions** with the M7 confirmation-card pattern embedded (joint M5/M8 design).

---

## Proposed plan

Sequenced by dependency. Phase 0 unblocks Modules 5/6/8; nothing in 5/8 builds correctly until the schema is Spec-10-shaped.

### Phase 0 — Schema to Spec-10 Core (foundational, ~5–8 days)
- Decide canonical template (demo base vs re-synced `appIf959oh38fgKYp`); make it hold all 21 Core tables + both Domain Extensions.
- Rename ACTION_HUB→ISSUES (+ `Issue_Type`), CASHFLOW→CASHFLOWS; add PHASES engagement fields; add COMMS; resolve CHANGE_LOG + PLAN + DOMAIN_LABELS classification.
- Update `schema.generated.ts`, `fieldMaps.ts`, `provision.ts` `PLATFORM_TABLES`, and the add-* scripts; run on the template + all existing bases; regenerate schema.
- Resolve the **role taxonomy** (gap #18) here — it gates COMMS, RBAC, and assistant scoping.
- *Exit:* a freshly onboarded org clones a Spec-10-compliant base; `tsc`/eslint/fieldMaps tests green; schema-drift dashboard shows in-sync.

### Phase 1 — Module 5 Work Intelligence on the new schema (~4–6 days)
- COMMS coordination surface; ISSUES with Issue_Type wired through routes + ingestion routing + assistant tools.
- 7 cascading rules as LEARNING_RULES records; implement the 3 auto-cascades (gaps #10–11).
- Ongoing/Seasonal behaviours (#12); BUDGET.Actual ⇐ PROCUREMENT (#13).

### Phase 2 — Module 6 Learning Loop to spec numbers (~3–4 days)
- Detect/validate thresholds + confidence formula + Override_Permission ladder (#14–16); Root_Cause enforcement + session prompts (#17).

### Phase 3 — Module 8 live dashboards (~5–8 days)
- Build the spec's sequence (#24) and the four PLAN render modes (#25); inline coordination actions (#26).

### Phase 4 — Cross-cutting hardening (parallelisable)
- Live mailbox + n8n event trigger (#19–20); finish/live-verify Airtable migration, kill Postgres tail (#21).
- Evidence-test Module 3 with real Peak data (#22); branded doc templates + supersession (#23).
- Vercel-vs-Render sign-off.

**Critical path:** Phase 0 → Phase 1 → (Phase 2 ∥ Phase 3). Phase 4 runs alongside throughout. Role-taxonomy resolution (#18) and the canonical-template decision (#8) are the two judgment calls that should be made before any Phase 0 code lands.

## Decisions settled (2026-06-26)

1. **Canonical template = the real Master Template `appIf959oh38fgKYp`** (not the demo base). Re-sync it to all 21 Core tables + both Domain Extensions + 3 renames, then point `AIRTABLE_TEMPLATE_BASE_ID` (local + Render) at it and retire the demo base as de-facto template. The demo base stays as a dev/test fixture only.
2. **Role taxonomy approved** = Owner / Builder / Architect / Broker, plus Supplier / Regulatory / Other as COMMS-only `Stakeholder_Role` values. This single list is canonical across Clerk access (M1), COMMS `Stakeholder_Role` (M5), and assistant system-prompt scoping (M7).

## Phase 0 progress (2026-06-26)

**Done & verified (additive schema — breaks nothing, applied to the current template base `appharWaojouHgMeW`):**
- `scripts/airtable-spec10-core-schema.mjs` — idempotent migration; run on the template base, idempotency confirmed.
- **COMMS** Core table created: `Topic` (primary) · `Message_Type` · `Stakeholder_Role` (Owner/Builder/Architect/Broker/Supplier/Regulatory/Other — matches the approved taxonomy) · `Due_Date` · `Status` · `Sent_By` · `Notes` + links `Job`/`Stakeholder`/`Phase`/`Linked_Issue`/`Linked_Decision` (reverses named `COMMS`).
- **PHASES** engagement fields added: `Phase_Type` (Linear/Cyclical/Parallel) · `Loop_Permitted` · `RAG` · `Sequence` · `Season_Year` · `Predecessor_Phase` (self-link, reverse `Successor_Phases`).
- **ISSUES capability** added to ACTION_HUB: `Issue_Type` (Open Action/Blocker/Risk Materialised/Decision Required/Scope Change Trigger) · `Phase` link · `Linked_Risk` link.
- Registered COMMS in `gen-schema.mjs`, `provision.ts` `PLATFORM_TABLES`, and `airtable-provision-base.mjs` → new client bases clone it.
- `schema.generated.ts` regenerated. **typecheck / eslint / fieldMaps tests all green.**

**Classification calls (recommendations — no code churn, confirm before any rename):**
- **DOMAIN_LABELS** → realised by the existing `PLAT_CFG_NOMENCLATURE` table (+ `NOMENCLATURE_OVERRIDES` in the demo base). Recommend keeping it as the DOMAIN_LABELS implementation and documenting the equivalence rather than renaming + migrating data.
- **PLAN** (task-level schedule) → we have `WORKSTREAMS` (workstream-level) + a `project-plan` page; a distinct task-level PLAN table is a Phase 1/3 build (Gantt depends on it). Left open.
- **CHANGE_LOG** → realised for construction by `VARIATIONS`; a generic Core CHANGE_LOG can be added when a second vertical needs it.

**Remaining Phase 0 (deliberate migrations — held):**
- **ACTION_HUB → ISSUES** table rename + **CASHFLOW → CASHFLOWS** rename: wide blast radius (table name is the Airtable wire key, so all code refs + every base rename in lockstep). Pairs with the real-master re-sync: rename the canonical template once, re-clone. **Blocked on PAT access to the real master `appIf959oh38fgKYp` (currently 403).**
- Run `airtable-spec10-core-schema.mjs` on the real master + every existing client base once master access is granted.
