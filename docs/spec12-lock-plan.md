# Spec 12 Cross-Check & Module Lock Plan

**Date:** 2026-07-24 · **Spec:** `aequilibri_Production_Build_Spec_12 (2).docx` (Version 12, 30 June 2026 — same version as previously audited; the "(2)" is a re-download, no content delta)
**Method:** 5 parallel code-verification passes against the working tree (master), one per draft module plus a locked-module drift check. All verdicts below carry file-level evidence.

Spec lock status: **Modules 1–4 LOCKED · Modules 5–8 DRAFT.** This document (A) cross-checks all 8 modules against current code, (B) designs the lock path for the four draft modules, aligned with how the platform is actually built.

---

## Part A — Cross-check matrix

### Platform architecture invariants the lock design must respect

These are the patterns everything already flows through — any lock design that bypasses them is wrong:

1. **Single write choke point** — every write goes through `writeRecord` in `src/lib/platform/recordWriter.ts`, which already hosts vocab enforcement (`enforceVocab`), role gates (`canWrite`/`canApprove`), immutable-snapshot guards, the PENDING_WRITES proposal queue, post-write reconciliation, and outbound events. New behaviors attach here, not in pages.
2. **Propose-before-write** — AI-initiated writes queue to PENDING_WRITES; human approves on the approvals page; approve-with-edits emits per-field CORRECTIONS. Deterministic system writes (reconciliation exceptions) write directly with EXECUTION_LOG audit.
3. **Read layer = `src/lib/platform/*Source.ts`** — tolerant Airtable reads (`listOptional`), TTL caches, derived values computed app-side (e.g. `budgetActuals()` derives BUDGET.Actual rather than trusting a rollup).
4. **List windows** — shared `listQuery`/FilterBar/group-by convention across all 12 list pages.
5. **Learning loop plumbing** — `emitCorrection` → `learning.ts` detect/validate/promote; rules injected into chat context; confidence maths live.
6. **Airtable is system of record**; Postgres is legacy/dev fallback (`pgOmit` for Airtable-only fields). Schema changes ship as `scripts/airtable-extend-*.mjs` run against **both templates + live customer bases** (Didi `appmDPKjRT4Kp9rvN`, Meridian Legal `appr9sReyIHgS6FXy`) plus a hand-patch to `schema.generated.ts`.
7. **Control base** (`app51Tmrgab3QYP4Z`) holds platform-level config (PLAT_TEMPLATE_REGISTRY, PLAT_JOB_CATALOG, PLAT_REPORT_CATALOG).

### Module 1 — Customer Onboarding Engine (LOCKED) — ✅ compliant, minor drift

| Spec item | State | Evidence |
|---|---|---|
| Template-registry-driven vertical selection | ✅ | `app/new/page.tsx:60` → `listTemplateRegistry()` |
| Manual-duplicate + admin-supplied base id | ✅ | `onboarding.ts:253-269` |
| Runtime table top-up | ✅ | `ensureAppRuntimeTables`, `onboarding.ts:273-288` |
| Role taxonomy owner/builder/architect/broker | ✅ | `module1Governance.ts:43-77` |
| Onboarding playbook / population sequence | ⚠️ declarative only | `ONBOARDING_LOAD_SEQUENCE` (`module1Governance.ts:34-41`) is metadata; no guided per-table loading UI |

### Module 2 — Data Ingestion (LOCKED) — ✅ compliant, two partials

| Spec item | State | Evidence |
|---|---|---|
| Propose-confirm + CORRECTIONS on delta | ✅ | `approvals/actions.ts:58-110` |
| Post-write reconciliation (re-read/diff/Data Quality CORRECTIONS + exception ISSUE) | ✅ | `reconciliation.ts`, wired `recordWriter.ts:841,975` |
| Email/attachment via n8n inbound webhook | ✅ | `api/platform/ingest-inbox/route.ts` |
| Per-field confidence in review UI | ⚠️ | only doc-level confidence shown (`documents/[id]/page.tsx:46-48`) |
| Schema-driven dynamic extraction UI | ⚠️ | extraction shape fixed (`risks/obligations/key_terms`); routing rule-based (`ingestion.ts:173-263`) |

### Module 3 — Assessment Engine (LOCKED) — ✅ architecture, ❌ one significant drift

| Spec item | State | Evidence |
|---|---|---|
| One engine + pluggable capability modules | ✅ | `module3/engine.ts:65-94` dispatching to `construction/assess.ts`, `builderTenderComparison.ts`, `architecturalScopeAssessment.ts` |
| Job catalog data-driven | ✅ | `jobCatalogSource.ts` ← control-base PLAT_JOB_CATALOG |
| **Tender comparison on canonical TRADE_PACKAGES/CONTRACTOR_BIDS/BID_LINE_ITEMS** | ❌ | still parses free-text DOCUMENTS (`builderTenderComparison.ts:37-109`); canonical tables never queried anywhere |

### Module 4 — Document Management (LOCKED) — ✅ compliant, one field-map leak

| Spec item | State | Evidence |
|---|---|---|
| DOCUMENTS registry discipline | ✅ | `documentSchema` `recordWriter.ts:202-224` |
| Versioning + auto-supersession | ✅ | `documents.ts:231-246,366` |
| Snapshot immutability + SHA-256 verify | ✅ | `documents.ts:581-588,628-649`; edit/delete blocked `recordWriter.ts:521-529` |
| Outbound PDF/DOCX/MD generation | ✅ | `generateManagedDocument`, `documentRenderer.ts` |
| Decision traceability fields on Airtable | ⚠️ | `alternatives`/`madeBy`/`sourceId` validated in Zod but **not mapped** in DECISIONS fieldMap (`fieldMaps.ts:167-180`) → silently dropped on the Airtable path |

### Module 5 — Work Intelligence Layer (DRAFT) — weakest module

| Spec item | State | Evidence |
|---|---|---|
| 7 cascading update rules | ❌ **0/7** | no cascade hook at the write choke point; `sourceCascade.ts` unrelated; `delay.ts` is AI-advisory only |
| PHASES.RAG read/write/UI | ✅ | `phasesSource.ts:116`, `setPhaseRag`, phases page inline setter |
| JOBS / engagement-level RAG | ❌ | no field, no aggregation; `healthScore` hardcoded 0 in Airtable mode |
| COMMS table (read/write/UI/nav/coordination feed) | ✅ | `commsSource.ts`, comms pages, `coordinationSource.ts:66-80` |
| ENGAGEMENT_TYPE_CONFIG | ⚠️ write-only | seeded at onboarding (`onboarding.ts:91-106`), **never read**; JOBS.Engagement_Type unmapped |
| ISSUES Issue_Type 5-value vocab | ✅ | `vocab.ts:30-33`, enforced on write, read+facet |
| RISKS P×I (+heat map) | ✅ / ⚠️ | Likelihood/Impact read+write; RAG/Category read-only by design (bases not migrated) |
| PLAN table | ❌ | schema + provisioning only; no fieldMap, no writable registry entry, no source, no page (`/project-plan` reads JOBS/PHASES/ISSUES/RISKS, not PLAN) |

### Module 6 — Learning Loop (DRAFT) — pipeline core built, governance missing

| Spec item | State | Evidence |
|---|---|---|
| Capture (4 trigger classes) | ⚠️ 3/4 | module2/module3/manual wired; **cascade-override capture absent** (no cascades exist) |
| Detect (cluster → HYPOTHESES) | ✅ | `learning.ts:170-457` (Root_Cause+Source_Module+Supplier/Phase key) |
| Validate (per-type thresholds 5/3/8/2) | ✅* | `VALIDATION_THRESHOLDS` `learning.ts:62`; *Seasonal unreachable — no Season_Year signal |
| Promote (owner-gated LEARNING_RULES draft) | ✅ | `promoteHypothesisToRule` `learning.ts:664`, tested |
| Confidence maths (85 cap / +1 max 95 / −5 / ≤60 flag / ≤50 Under Review) | ✅ | `learning.ts:73-81,907,938-966` (applications term approximated by +1-per-firing — acceptable deviation) |
| **Override_Permission 3-level ladder** | ❌ | boolean checkbox only (`cannotOverride`); no Owner_Only/Standard/Advisory, no relax/demote logic |
| **JOBS completion deltas** | ❌ | no close routine, no Completion_Date/delta fields, no CHANGE_LOG count |
| Session protocol | ⚠️ | rules loaded by priority ✅; ≥3-CORRECTIONS surfacing ❌; close prompt exists but generic; EXECUTION_LOG per-turn ✅, no distinct close entry |
| CORRECTIONS first-class fields | ⚠️ | Source_Module/Correction_Direction ride in Notes JSON, not native columns |

### Module 7 — Conversational Assistant (DRAFT) — strongest draft module

| Spec item | State | Evidence |
|---|---|---|
| Propose-before-write architectural | ✅ | executor → PENDING_WRITES → approvals cards (no "rationale" line on card) |
| Role-scoped tools + context + prompt | ✅ | `ROLE_WRITE_ALLOW`/`ROLE_QUERY_DENY` (`tools.ts:27-79`), per-role prompt block (`chat.ts:360-372`) |
| Model routing (Sonnet default / Haiku routing / Opus gated) | ✅ | `modelRouter.ts:13-25` |
| Multi-agent supervisor + 7 module specialists | ✅ | `agents/orchestrator.ts`, `agents/registry.ts` |
| Standalone /chat | ✅ | channel-via-session-title, shared pipeline |
| **Context loading strategy** | ⚠️ | rules ✅ + 10 jobs + 2 counts only; **no** phases+RAG, budget summary, issues breakdown, 10 DECISIONS, 3 EXECUTION_LOG; re-fetched every turn (no cache) |
| **send_email tool** | ❌ | absent; COMMS never exposed to assistant |
| DOMAIN_LABELS on assistant surface | ❌ | `domainLabels.ts` not imported anywhere under `assistant/*` or approvals |

### Module 8 — Reporting & Visualisation (DRAFT) — 6 of 9 taxonomy views live

| Spec view | State | Evidence |
|---|---|---|
| Issues Register (live) | ✅ (filters partial, no XLSX) | actions page; status/priority/due filters + group-by |
| Phase RAG Board (live) | ✅ | phases page, inline RAG setter |
| Risk Register (5×5 heat map) | ✅ | `risks/page.tsx:37-67` |
| Budget Dashboard (finance-gated) + CASHFLOWS | ✅ | budget + cashflow pages, `requireFinancialAccess`; Variance = Forecast−Estimated (matches spec) |
| Procurement Tracker (Expected/Actual Δ, late highlight) | ✅ | `procurement/page.tsx:93-110` |
| Tender Comparison Report (immutable PDF in DOCUMENTS) | ✅ | `builderTenderComparison.ts:169-202` |
| Coordination Dashboard | ⚠️ | priority queue of ISSUES+RISKS+COMMS+proposals (`coordinationSource.ts`) — not grouped by assignee, **no PLAN tasks** (PLAN unwired) |
| Engagement Status Snapshot | ⚠️ | report catalog `project_health` exists; Airtable path persists markdown DOCUMENTS row, **no rendered PDF** (Postgres path has it) |
| **Gantt + 4 PLAN render modes** | ❌ | no Gantt, no engagement-type mode switch (blocked on PLAN + ENGAGEMENT_TYPE_CONFIG) |
| Portfolio View | ⚠️ | dashboard lists jobs w/ completion %, **no cross-job RAG rollup** (blocked on JOBS RAG) |
| DOMAIN_LABELS on UI labels | ⚠️ | record-edit forms only, 10-min TTL cache; lists/detail/nav hardcoded; only legal demo seeds labels |
| XLSX export | ❌ | none anywhere |

**Beyond spec (shipped, spec-consistent):** predefined report catalog (9 reports, narrative + deterministic), custom AI reports with saved templates (control-base PLAT_REPORT_CATALOG), report lifecycle draft→approved→sent with `report.ready` outbound event.

---

## Part B — Lock design for Modules 5–8

"Locking" a module = closing the functional gaps **and** resolving the spec's open questions so the spec status can flip DRAFT→LOCKED. Each design below does both, using only existing platform mechanisms.

The single cross-cutting decision first, because the spec calls it the highest-priority pre-build item:

### Decision 0 — Role taxonomy alignment (joint M1/M5/M7) — RESOLVE AS-BUILT

The spec's open question is already de-facto answered in code: `module1Governance.ts` TeamRole (owner/builder/architect/broker + finance/auditor sub-roles) is enforced in Clerk org context, assistant policy, and financial gating. COMMS.Stakeholder_Role (Owner/Builder/Architect/Broker/Supplier/Regulatory/Other) is a **superset**: the first four are login roles, the last three are non-login stakeholder categories that never authenticate. **Lock decision to record:** the code taxonomy is canonical; COMMS adds non-login stakeholder values; DOMAIN_LABELS relabels both per vertical (legal: Partner/Associate/Client). No code change needed — write it into the spec and close the open question for all three modules.

### Module 5 lock design — cascade engine + PLAN + engagement profiles

M5 is the largest gap and the blocker for M8's Gantt and Portfolio views. Four workstreams:

**5.1 Deterministic cascade engine at the write choke point.**
Add a third post-write hook in `writeRecord` (alongside reconciliation and outbound events): `runCascades(ctx, table, before, after)`. Design constraints honoured:

- **Declarative rule table in code** (like `vocab.ts`/`fieldMaps.ts`): each rule = `{ id, watchTable, trigger(before,after), effects }`. No freeform engine.
- **Two effect classes**, matching the spec's own split:
  - **Write effects** (rules d, f, g — the "create/update/escalate" rules): execute as **direct system writes** through `writeRecord` (actor=system, EXECUTION_LOG entry, `Data Quality`-style audit). Rationale: the owner pre-approves the rule itself (see below), so per-firing approval would recreate the manual toil the rule exists to remove. Deterministic, idempotent (e.g. rule d upserts the CASHFLOWS record keyed on procurement id; rule g checks for an existing linked issue before creating).
    - d: PROCUREMENT → Invoiced/Paid ⇒ upsert outgoing CASHFLOWS txn (Status=Confirmed/Paid mirroring procurement status).
    - f: ISSUES → Blocker ⇒ linked PHASES RAG floored at Amber (never lowers Red).
    - g: RISKS → Materialised ⇒ create linked ISSUES (Issue_Type="Risk Materialised"). Requires adding "Materialised" to the risk status vocab + `setRiskStatus`.
  - **Advisory effects** (rules a, b, c, e — the "review X" rules): **no writes.** Emit a `cascade.review` outbound event and surface a derived advisory item in the coordination queue (`coordinationSource.ts` already merges heterogeneous sources). Persist the advisory as a lightweight EXECUTION_LOG entry so it survives across sessions; the coordination queue reads recent unacknowledged ones. This avoids flooding ISSUES with auto-created rows.
- **Rules registered as LEARNING_RULES records** (spec: "formalise cascading rules as LEARNING_RULES"). Seed the 7 records at onboarding (extend `seedLearningRules` in `onboarding.ts`) + a backfill script for Didi/legal. The engine matches rule records by a stable `Rule_Code` in Trigger_Context; a rule with Status ≠ Active doesn't fire — giving the owner the on/off switch through the existing learning UI. Each firing calls the existing `applyRules` bookkeeping (Times_Triggered, +1 confidence); each **override** (human reverses a cascade write within the same day / rejects the advisory) calls `recordRuleOverride` and `emitCorrection(sourceModule:"module5")` — closing M6's missing capture class (c).
- **Known limitation to document:** cascades fire only on app-mediated writes (Airtable-UI edits bypass, same as reconciliation). Acceptable — same posture already accepted for reconciliation.

**5.2 Wire the PLAN table end-to-end** (prerequisite for M8 Gantt):
fieldMap `plan` → PLAN (Task_Name/Phase/Job/Start_Date/End_Date/Duration_Days/Predecessor/Assigned_To/Status/RAG), `planSchema` + writable-registry entry (`pgOmit` full record — Airtable-only, like COMMS), `planSource.ts` (tolerant read, ordered by Start_Date), `/app/[org]/plan` list window #13 using the shared listConfig/FilterBar/group-by convention (group by phase/assignee/status), RecordEditor config for create/edit. Predecessor handled as link + second-pass edit (same pattern the onboarding playbook prescribes). **Open question Gap 2 resolved:** Predecessor stays in schema, empty for Short Job/Seasonal — no code branch needed, confirm in spec.

**5.3 Engagement profiles — make ENGAGEMENT_TYPE_CONFIG real.**
- Map `Engagement_Type` in the JOBS fieldMap + read it in `jobDetailSource`/`jobContextSource`.
- New `engagementProfile.ts`: reads ENGAGEMENT_TYPE_CONFIG (TTL-cached like domainLabels), returns per-type depth flags: `{ risksRegister: boolean, planMode: "gantt"|"checklist"|"workflow"|"season", cashflowGranularity, ragScope }` with the spec's four defaults (Short Job / Long Project / Ongoing Lifecycle / Seasonal Cycle) as fallback when the table is empty.
- Consumers: nav (hide Risk Register for Short Job), PLAN view mode (M8), portfolio activation flag (M8). **Open question resolved:** first template = Long Project seeded from Didi's config (already written at onboarding — now actually read).

**5.4 Engagement-level RAG (derived, not stored).**
`jobRag()` helper in the read layer: worst-of-phases with the spec's caveat that one red phase ⇒ engagement Amber unless ≥2 red or a Blocker issue open (defaults; thresholds documented as LEARNING_RULES candidates, not hardcoded policy). Surface on job detail, dashboard job list, and portfolio view. Derived-value pattern matches `budgetActuals()` — no schema change, no write path, no migration.

**Lock declaration for M5:** 7 rules live as owner-visible LEARNING_RULES + engine, PLAN operational, engagement profiles consumed, RAG at both levels → all four spec open questions answered (taxonomy = Decision 0, Predecessor-empty = confirmed, ENGAGEMENT_TYPE_CONFIG template = Didi Long Project, 7 rules = seeded pending owner approval in the learning UI).

### Module 6 lock design — governance ladder + job-close loop

**6.1 Override_Permission 3-level enum.**
Schema migration (`scripts/airtable-extend-learning-rules.mjs`): convert/add `Override_Permission` singleSelect (Owner_Only/Standard/Advisory) on LEARNING_RULES across templates + live bases; vocab entry + fieldMap; keep reading the legacy checkbox as Owner_Only fallback. Ladder logic in `learning.ts`:
- New rules (and promoted drafts) start **Owner_Only** (change `recordWriter.ts` default).
- Rolling window: store `recentApplications` (last-10 fired/overridden flags) in the rule's notes JSON — same pattern CORRECTIONS uses for Source_Module — no extra Airtable columns needed.
- ≥10 clean applications ⇒ surface "relax to Standard" suggestion in the learning UI (owner clicks, never automatic).
- >3 overrides in last 10 ⇒ auto-demote one level (Standard→Owner_Only→Advisory), never delete. EXECUTION_LOG entry on every transition.
- Enforcement point: `applyRules`/cascade engine checks level — Advisory rules surface but never auto-write; Standard rules overridable by any write-role; Owner_Only overrides require owner/admin (reuse `isAdminRole`).

**6.2 JOBS completion deltas.**
`closeJob(jobId)` service triggered when a JOBS write transitions status→closed (detect at the write choke point, like cascades): computes Budget delta (`budgetActuals()` vs Estimated_Value), Schedule delta (planned end from PHASES/PLAN vs Completion_Date=now), Scope_Changes_Count (CHANGE_LOG rows linked to job). Persist: add `Completion_Date` + the three delta fields to JOBS via extend script (spec defines them as fields — keep native, not JSON); write an INTELLIGENCE_SNAPSHOT metrics row + EXECUTION_LOG entry; feed deltas as engagement-level evidence into the hypothesis engine (new Hypothesis_Type input, reusing `emitCorrection` with `sourceModule:"module6"` for material variances).

**6.3 Session protocol completion.**
- Context builder (`chat.ts`): count CORRECTIONS created since the session's previous `Ended_At`; if ≥3, prepend a "review recent corrections" block to the system context (data already available via `learningSource`).
- Session close: extend the existing close form (`assistant/actions.ts`) to list rule codes applied this session (from per-turn EXECUTION_LOG entries) with a per-rule "applied incorrectly?" toggle → emits rule-linked CORRECTIONS. **Open question resolved:** keep it a **prompted, skippable step** (not blocking) — matches the spec's "prompt, not mandatory" default and current UX; revisit if correction volume stays low.
- `endSession` writes a distinct session-close EXECUTION_LOG entry (summary + rules applied + corrections captured).

**6.4 CORRECTIONS first-class fields.**
Extend script adds `Source_Module` (singleSelect) + `Correction_Direction` (singleSelect) native columns; `corrections.ts` writes both natively (keeps Notes JSON for backward compat on old rows); `learning.ts` prefers native, falls back to JSON. Unblocks reporting/filtering on the corrections register.

**6.5 Thresholds + Seasonal.**
Lock the coded defaults (Supplier 3 / Domain 5 / Estimation Bias 8 / Scope Creep 5) as the confirmed answer to the spec's open question. Seasonal Pattern stays declared-but-dormant until a Seasonal Cycle customer provides Season_Year data — record as an explicit activation condition, not a gap.

### Module 7 lock design — context depth + comms channel + labels

**7.1 Full context loading (spec's exact list), cached.**
Extend the chat context builder to load: active job's PHASES (status+RAG), BUDGET category summary (**only when `financeVisible(role)`**), ISSUES count by Issue_Type×Status, 10 most recent DECISIONS, 3 most recent EXECUTION_LOG entries. All of this exists in `jobContextSource.ts` / sources already — this is wiring, not new reads. Add a per-session TTL cache (the airtable-perf-layer TTL cache utility) keyed on org+job+role, invalidated on any write through `writeRecord` (hook exists) — matching the spec's "refresh only when something may have changed."

**7.2 send_email → COMMS-mediated, n8n-delivered.**
Do **not** give the assistant a raw email tool. Aligned design: new assistant tool `draft_comm` creates a COMMS record (Status=Pending, Message_Type, Stakeholder link, Topic/body) **through the proposal queue** — the approvals card is the human gate the spec demands for outbound comms. On approval, `writeRecord` emits the existing outbound event (`comm.approved`) consumed by the n8n integration layer (step-2 of its roadmap) which sends via the org's mail provider and PATCHes Status→Sent back through the inbound webhook. This simultaneously satisfies M7's send_email, M5's COMMS lifecycle, and M8's "report delivery Phase B" open question (reports already emit `report.ready`).

**7.3 Surface polish to spec:**
- **Rationale on confirmation cards:** executor already receives the model's reasoning per tool call — persist a `rationale` string into the PENDING_WRITES payload and render it on the approvals card. Small, closes the one propose-before-write deviation.
- **DOMAIN_LABELS on the assistant surface:** inject the org's label map (already TTL-cached) into the system prompt and apply `localizeEditorConfig`-style relabeling in `friendlyTableLabel` used by approvals cards. Closes the "confirmation card shows domain-labelled table name" spec line and is the first step of the broader D8 label rollout (M8.4).

**7.4 Lock declarations:** taxonomy = Decision 0; Claude Projects coexistence = accepted per spec (EXECUTION_LOG per-turn discipline already exceeds the requirement); confirmation-card design = the existing approvals card + rationale line (joint M7/M8 question answered by the shipped component).

### Module 8 lock design — PLAN views, portfolio, exports, labels

Ordered by dependency (5.2/5.3/5.4 unblock the first two):

**8.1 PLAN view component with 4 render modes.**
One `PlanView` component, mode from `engagementProfile(job).planMode`: **Gantt** (Long Project — build first; SVG timeline in the same style as the existing cashflow chart, rows=tasks grouped by phase, bars Start→End, red/amber borders from RAG, predecessor arrows v2), **checklist** (Short Job — trivial), **workflow-state** (Ongoing Lifecycle) and **season calendar** (Seasonal) stubs behind the same switch, shipped when a real customer of that type exists — the switch architecture is what the spec locks, not four finished renderers on day one. Record that sequencing in the spec (it already prescribes exactly this order).

**8.2 Coordination Dashboard v2 + inline actions.**
Add PLAN tasks (Status ∈ Not Started/In Progress by Due_Date) to `coordinationSource`; add an Assigned_To grouping using the existing group-by convention. **Inline actions (spec open question) — recommendation: allow, scoped:** ISSUES status and COMMS status only, as plain server actions with existing role gates (`canWrite`) — the `setPhaseRag` inline-setter precedent. Human-direct writes don't need the proposal queue (that gate is for AI writes); this matches the platform's existing write discipline exactly.

**8.3 Portfolio View.**
Activation flag read from ENGAGEMENT_TYPE_CONFIG via `engagementProfile` (spec's preferred trigger — explicit, not auto). Rendering: extend the dashboard jobs list with derived `jobRag()` (5.4), open-issues count, budget variance (finance-gated cell). No new page until a multi-engagement customer exists; flag + derived columns lock the architecture.

**8.4 DOMAIN_LABELS rollout to lists/details.**
Generalize `localizeEditorConfig` to a `labelFor(table, field)` helper consumed by the shared listConfig column headers and detail pages (single-point change in the shared list renderer — the 12-window convention pays off here). Seed construction/roofing DOMAIN_LABELS records in the templates (currently only legal demo has rows). This converts the spec's "no hardcoded field names in UI" from inert to real incrementally, without touching every page by hand.

**8.5 XLSX export on registers.**
One `exportListAction` shared by all list windows (the spec explicitly names Issues Register): server action renders the current `listQuery` result (respecting filters + role scoping + CLS) to XLSX, streams as download. Optional "register as snapshot" checkbox routes it through `generateManagedDocument` for an immutable DOCUMENTS record when the export supports a decision.

**8.6 Engagement Status Snapshot — rendered PDF on the Airtable path.**
On report **approve** (not draft), call `generateManagedDocument(format:"pdf")` alongside the existing DOCUMENTS markdown row — parity with the Postgres path and with the tender report. Draft iterations stay cheap markdown; the approved artifact becomes immutable + hashed, matching the live-vs-snapshot governing rule.

**Lock declarations for M8:** build sequence = confirmed as amended by reality (6 of 9 shipped; remaining order: 8.1→8.2→8.3 gated on M5); inline actions = yes, ISSUES/COMMS status via role-gated server actions; portfolio trigger = ENGAGEMENT_TYPE_CONFIG flag; report delivery = n8n outbound on `report.ready`/`comm.approved` (7.2); report titles = fixed, DOMAIN_LABELS for field labels only (as spec recommends).

---

## Part C — Locked-module drift to schedule (separate from lock work)

These don't block locking 5–8 but are spec violations in LOCKED modules — schedule independently:

1. **M3 tender comparison → canonical tables** (spec: "test canonical structure first"): read TRADE_PACKAGES/CONTRACTOR_BIDS/BID_LINE_ITEMS when populated, fall back to free-text DOCUMENTS extraction when not (`listOptional` tolerant-read pattern). The free-text path becomes the ingestion route *into* the canonical tables rather than the comparison source.
2. **VENDORS → ORGANISATIONS collapse**: repoint `vendorsSource`/vendor fieldMap to ORGANISATIONS Type=Vendor; migration script collapses Didi's VENDORS rows; keep tolerant fallback for pre-migration bases (the vendors-new notice pattern already handles missing VENDORS).
3. **DECISIONS fieldMap**: add `alternatives`/`madeBy`/`sourceId`/`sourceType` field specs (+extend script for the Airtable columns) — currently validated-then-dropped, losing spec-mandated decision traceability.
4. **Stack note**: spec says Vercel + Sonnet 4.6/Opus 4.6; platform runs Render + `claude-sonnet-4-6`/`claude-opus-4-7`. Render is an accepted standing decision; model IDs drift-tolerant via env override in `modelRouter.ts`. Record in spec errata, no action.

## Part D — L0 lock decisions record (DECIDED 2026-07-24)

These answers close every open question the spec lists for Modules 5–8. They are the platform's standing decisions unless the owner reverses them; carry them into the next spec revision (v13) to flip Modules 5–8 from DRAFT to LOCKED.

| # | Spec open question | Decision |
|---|---|---|
| D-1 | Role taxonomy alignment (joint M1/M5/M7 — "highest priority pre-build") | **Code taxonomy is canonical**: `owner / builder / architect / broker` (+ `finance / auditor` sub-roles) as implemented in `module1Governance.ts` and enforced via Clerk, assistant policy, and `requireFinancialAccess`. COMMS `Stakeholder_Role` is a **superset** — Owner/Builder/Architect/Broker are login roles; Supplier/Regulatory/Other are non-login stakeholder categories that never authenticate. DOMAIN_LABELS relabels both per vertical (legal: Partner/Associate/Client). |
| D-2 | M5 — PLAN `Predecessor` for non-Gantt engagement types | **Field stays in schema, left empty** for Short Job and Seasonal Cycle. No code branch; the render mode (not the schema) differs per engagement type. |
| D-3 | M5 — ENGAGEMENT_TYPE_CONFIG first template | **Long Project, seeded from Dulong Downs Didi** (already written at onboarding by `seedEngagementTypeConfig`; L1 makes the app read it). Spec's four engagement-type defaults are the code fallback when the table is empty. |
| D-4 | M5 — 7 cascading rules as LEARNING_RULES records | **Approved as the L2 design**: rules seeded as LEARNING_RULES with stable Rule_Codes; write-effect rules (d/f/g) execute as direct system writes, advisory rules (a/b/c/e) surface in the coordination queue; owner switches any rule off via the learning UI. Pending only the owner's per-record review when the seed lands. |
| D-5 | M6 — validation thresholds per Hypothesis_Type | **Locked at the coded defaults**: Supplier 3 · Domain 5 · Estimation Bias 8 · Scope Creep 5 · Seasonal 2 seasons (dormant until a Seasonal Cycle customer supplies Season_Year data — activation condition, not a gap). |
| D-6 | M6 — session-close correction prompt mandatory? | **Prompted, skippable** (not a blocking UI step) — matches the spec's own default and current close-form UX. Revisit only if correction volume stays low after M6 lock. |
| D-7 | M7 — Claude Projects coexistence | **Accepted per spec's coexistence approach**; per-turn EXECUTION_LOG discipline in the production surface already exceeds the per-session requirement. Production surface is the system of record. |
| D-8 | M7/M8 — confirmation card design | **The shipped approvals card is the design**: table label, field-level before→after diff, approve/reject — plus a `rationale` line (L4) and domain-labelled table names (L4). |
| D-9 | M8 — build sequence | **Confirmed as amended by reality**: 6 of 9 taxonomy views already live; remaining order = PlanView/Gantt → Coordination v2 → Portfolio columns, gated on L1. |
| D-10 | M8 — Coordination Dashboard inline actions | **Yes, scoped**: ISSUES status and COMMS status only, as plain role-gated server actions (`setPhaseRag` precedent). Human-direct writes don't route through the proposal queue; that gate is for AI writes. |
| D-11 | M8 — Portfolio View activation | **Explicit flag in ENGAGEMENT_TYPE_CONFIG** read via `engagementProfile` — never auto-activates on a second job. |
| D-12 | M8 — report delivery of generated snapshots | **Phase B = n8n outbound** on the existing `report.ready` (and future `comm.approved`) events; no delivery logic in the data path. |
| D-13 | M8 — report title configurability | **Fixed titles; DOMAIN_LABELS for field labels only** (as spec recommends). Revisit with the first non-construction production customer. |

## Part E — Suggested build order

| Phase | Contents | Unlocks |
|---|---|---|
| **L0 (decision only)** — ✅ DONE 2026-07-24 (Part D) | Decision 0 role taxonomy; M6 thresholds; M8 sequence/inline/portfolio/report-delivery answers; M5 Predecessor-empty | flips every "open question" to resolved — spec editorial, no code |
| **L1** — ✅ DONE 2026-07-24 (see note below) | 5.2 PLAN wiring · 5.3 engagement profiles · 5.4 derived RAG | M8 Gantt + portfolio become buildable |
| **L2** — ✅ DONE 2026-07-24 (see note below) | 5.1 cascade engine + 7 seeded rules · 6.1 override ladder (cascades need it) | M5 lockable; M6 capture class (c) closed |
| **L3** — ✅ DONE 2026-07-25 (see note below) | 6.2 job-close deltas · 6.3 session protocol · 6.4 CORRECTIONS columns | M6 lockable |
| **L4** — ✅ DONE 2026-07-25 (see note below) | 7.1 context+cache · 7.3 rationale+labels · 7.2 draft_comm (n8n outbound) | M7 lockable |
| **L5** — ✅ DONE 2026-07-25 (see note below) | 8.1 PlanView/Gantt · 8.2 coordination v2 · 8.5 XLSX · 8.6 PDF parity · 8.4 labels rollout · 8.3 portfolio columns | M8 lockable |
| **Parallel** | Part C drift items 1–3 | locked-module hygiene |

Every phase ships through the existing conventions: extend scripts against templates+Didi+legal, `schema.generated.ts` hand-patch, fieldMaps+vocab, writable-registry `pgOmit`, tolerant sources, shared list windows, proposal queue for AI writes, EXECUTION_LOG for system writes.

### L1 build note (2026-07-24)

- **5.2 PLAN wired**: `plan` fieldMap (`fieldMaps.ts`) + `planSchema` + registry entry (`recordWriter.ts`, Airtable-only like COMMS) + `plan` in the roles WRITE_MATRIX (owner/builder/architect per M7) + `planSource.ts` + `/app/[org]/plan` list window (FilterBar/group-by/inline status setter, RAG chips, overdue flag) + new/detail/edit pages + nav entry. Predecessor links read, not yet written (second-pass per playbook, until L5 Gantt).
- **5.3 engagement profiles**: `engagementProfile.ts` (TTL-cached ENGAGEMENT_TYPE_CONFIG read, tolerant; spec's four per-type defaults as fallback; `Portfolio_View` checkbox read tri-state per D-11). Consumed by: layout→nav (Short Job hides the full Risk Register entry), plan page (render-mode subtitle). `Engagement_Type` added to JOBS + `Portfolio_View` to ENGAGEMENT_TYPE_CONFIG in `schema.generated.ts` (RISKS-precedent hand-patch — **schema-drift migration provisions them; the job fieldMap deliberately does NOT write Engagement_Type until bases carry the field**). Reads are tolerant everywhere (jobsListSource, jobDetailSource).
- **5.4 derived RAG**: `jobRag.ts` (`computeJobRag` — worst-of-phases, 1-red⇒Amber, 2-red or red+blocker⇒Red; unit-tested) surfaced on the dashboard job list (blocker-escalated from the ISSUES read already on that page) and the project detail page (Engagement RAG metric card + per-phase RAG chips).
- **Verified**: tsc clean (src), eslint clean, vitest 181 pass + 18 in the 3 touched/new test files (3 pre-existing Postgres-env test-file failures unrelated). Routes probed on the dev server: `/plan`, `/plan/new` respond with the same Clerk 307 as sibling windows (no 500s). **Authed browser eyeball still pending** — local Clerk gate needs the owner's sign-in (same caveat as the group-by work).

### L2 build note (2026-07-24)

- **5.1 cascade engine** — [`src/lib/platform/cascade.ts`](../src/lib/platform/cascade.ts), wired as the third post-write hook in `writeRecord` AND `executeProposal` (dynamic import breaks the module cycle; cascades fire on execution, never on proposal). Airtable-mode only; system-actor writes are skipped (recursion-proof); every rule body is try/caught so a cascade failure never fails the primary write.
  - **Write effects** (direct system writes through `writeRecord`, so they get vocab/audit/reconciliation for free): **D** procurement→Invoiced/Paid upserts the outgoing CASHFLOWS txn (idempotent via a `cascade:<procId>` Notes marker); **F** Blocker issue floors the payload-linked phase's RAG at Amber (canonical ISSUES has no Phase field, so payload `phaseId` is the only source — no-op without it, documented); **G** risk status→`materialised` auto-creates the linked ISSUES row (`Issue_Type="Risk Materialised"`, idempotent on the ISSUES.RISKS link). "materialised" added to the risk status vocab (schema enum + `setRiskStatus` + risks page).
  - **Advisories** (A phase-status, B vendor, C budget, E procurement-date): persisted as EXECUTION_LOG rows (Status `Ongoing`), surfaced in the coordination queue, dismissible on `/coordination` — "Reviewed — done" (clean) or "Not relevant" (**override**: confidence decay + ladder + a `module5` CORRECTIONS record via `emitCorrection.overriddenRuleCodes` — Module 6 capture class (c) closed).
  - **Owner switchboard**: each rule = a LEARNING_RULES record (`Instance` CASCADE-A…G, `Trigger_Context` `{cascade:CODE}` so generic `applyRules` can never fire them); a rule fires only when Active. Seeded at onboarding (advisories Active, write-effects Draft per D-4) + an idempotent owner "Seed cascade rules" button on the learning-rules page for pre-existing orgs. Firings bump Times_Triggered/confidence via a targeted `markRuleApplied` (not `applyRules` — empty triggers there match everything).
- **6.1 Override_Permission ladder** — `learning.ts`: `OverrideLevel` (owner_only/standard/advisory) + rolling last-10 `Application_Window`; new/promoted rules stamped Owner_Only; >3 overrides in 10 auto-demotes one level (Standard→Owner_Only→Advisory, never deleted); 10 clean applications surfaces an owner-click "relax to standard" suggestion (never automatic). A write-effect cascade rule demoted to Advisory degrades to advisory surfacing. Ladder state lives in two schema-drift-provisioned columns (`Override_Level`, `Application_Window` — hand-patched into `schema.generated.ts` LEARNING_RULES, RISKS precedent); **all ladder writes are best-effort so unmigrated bases keep exact legacy behaviour** (legacy fallback: Override_Permission checkbox false → owner_only, else standard). Learning UI shows the governance chip + relax suggestion; `setOverrideLevelAction`/`seedCascadeRulesAction` are `requireAdmin`.
- **Verified**: tsc clean (src), eslint clean; vitest 197 pass (+16 new: cascade triggers/seed posture, ladder maths incl. window roll-off and advisory-floor); same 3 pre-existing Postgres-env test-file failures. Routes `/learning-rules`, `/coordination`, `/risks` 307 like siblings.
- **Activation checklist (ops)** — steps 1–2 ✅ RUN 2026-07-25 via `scripts/airtable-extend-spec12-lock.mjs` + `scripts/airtable-seed-cascade-rules.mjs` (note: `migrateBaseToTemplate` copies schema from the live TEMPLATE base, not schema.generated — so the columns were added to the templates first, making future drift migrations carry them): all 7 columns provisioned on Core/Roofing/Construction templates + Didi + Meridian Legal (30 added; JOBS.Engagement_Type pre-existed everywhere); CASCADE-A..G seeded on both live orgs (advisories Published, D/F/G Draft, all Owner_Only). Verified idempotent + read-back. REMAINING: (3) owner activates CASCADE-D/F/G drafts on `/learning-rules` when ready for auto-writes; (4) n8n consumers for `comms.create`/`report.ready`.

### L3 build note (2026-07-25)

- **6.2 JOBS completion deltas** — [`src/services/platform/closeJob.ts`](../src/services/platform/closeJob.ts), hooked next to the cascade engine in both `writeRecord` and `executeProposal` (job-table writes only; NOT owner-toggleable — core M6 behaviour, unlike cascade rules). When a JOBS update closes the job (status closed/complete): stamps `Date_Completed`, computes **budget delta** (Estimated_Value vs `budgetActuals()` over the job's BUDGET lines → `Actual_Value` + `Variance_Percent`), **schedule delta** (Date_Estimated/Target_Completion vs completion date), and **Scope_Changes_Count** (CHANGE_LOG links; best-effort write to the new drift-provisioned JOBS column). Human-readable close summary lands in `Actual_Summary`; `Learning_Rule_Candidate` flips on material deltas (defaults: |budget| ≥ 10%, |schedule| ≥ 7 days — documented owner-tunable); EXECUTION_LOG audit row; material deltas emit **module6 corrections** (`job.budget_total`, `job.schedule_days`) so the hypothesis engine clusters engagement-level patterns. Idempotent (Date_Completed already set → skip); Airtable-only; never fails the triggering write. Pure delta maths unit-tested (`computeJobCloseDeltas`).
- **6.3 session protocol** — (a) **session start**: `recentCorrectionsBlock` in `chat.ts` counts CORRECTIONS (`Date_Found`, now stamped by every `emitCorrection`) since the latest CHAT_SESSIONS `Ended_At`; ≥3 injects a SESSION-START PROTOCOL block into the system prompt telling the assistant to surface them before other work. (b) **session close**: the close form now lists rules whose `Last_Triggered` is today (new `RuleRow.lastTriggered`) with per-rule "applied incorrectly" checkboxes — each flag emits a rule-linked correction (`overriddenRuleCodes` → confidence decay + governance ladder, D-6 kept prompted-not-blocking); `endSession` gains a close payload that stamps the review summary onto CHAT_SESSIONS.Summary and writes a **distinct session-close EXECUTION_LOG entry** (rules flagged + correction captured).
- **6.4 CORRECTIONS first-class columns** — `Source_Module` + `Correction_Direction` singleSelects hand-patched into schema.generated (drift provisions); `emitCorrection` writes them as a separate best-effort update (unmigrated bases still get the correction; values keep riding in Notes JSON), and `airCorrection` reads native-first with Notes fallback. `CorrectionSourceModule` union extended with `module6`.
- **Verified**: tsc clean (src), eslint clean; vitest 201 pass (+4 closeJob delta tests); same 3 pre-existing Postgres-env test-file failures. All touched routes (assistant/coordination/learning-rules/plan/risks/dashboard) 307 on a fresh dev server, no compile errors in server logs.
- **Ops addition to the activation checklist**: the same schema-drift migration run now also provisions JOBS.Scope_Changes_Count and CORRECTIONS.Source_Module/Correction_Direction — one migration covers all L1–L3 columns.

### L4 build note (2026-07-25)

- **7.1 Context loading + cache** — [`src/services/platform/assistant/context.ts`](../src/services/platform/assistant/context.ts): every turn now also loads the spec's full list — the active JOBS record with linked PHASES status+RAG+completion, a BUDGET summary by category with derived actuals (**only for finance-visible roles**), open ISSUES counts by Issue_Type, the 10 most recent DECISIONS, and the 3 most recent EXECUTION_LOG entries — injected as a SESSION CONTEXT block. All reads RLS-scoped. Cached per org+job+finance-visibility (60s TTL) and **invalidated by every write through recordWriter** (both hook sites) — the spec's "refresh only when the data may have changed", enforced at the write choke point. A failed context load never blocks the turn.
- **7.2 draft_comm** — the send_email path, done safely: new assistant tool on the Project Intelligence agent creating a Pending COMMS record; classified `high_write` so it is **always** approval-gated even under auto_low_risk. On approval, `executeProposal`'s existing outbound event (`comms.create`) fires for the n8n integration layer, which owns delivery and marks the record Sent. The assistant never sends anything itself (tool description says so explicitly).
- **7.3 Rationale + domain labels** — every write tool now carries a `proposalReason` meta-field (named that, not "rationale", to avoid colliding with save_decision's real rationale record field); the executor lifts it into `WriteRequest.rationale`, recordWriter stores it as `__rationale` in the proposal payload (both stores), `executeProposal` strips it pre-write, and the approvals card renders it as an italic quote line — closing the last propose-before-write deviation (D-8). DOMAIN_LABELS now reach the assistant surface: `tableLabelFor` (convention: a `<TABLE>._TABLE` row names the table) + `labelForAppField` relabel the approvals card's table heading and field diff labels (input names untouched, so approve-with-edits is unaffected), and `domainVocabBlock` injects the org's terminology into the assistant system prompt. Empty-labels orgs are unchanged.
- **Verified**: tsc clean (src), eslint clean, vitest 201 pass (same 3 pre-existing Postgres-env failures); assistant/approvals/chat routes 307 like siblings.
- **M7 lock note**: with L4, all Module 7 build items are closed (context strategy, send_email, confirmation-card rationale + labels). Remaining M7 spec items were already resolved as lock decisions (D-1 taxonomy, D-7 coexistence, D-8 card design). The n8n delivery workflow itself (consuming `comms.create` / `report.ready`) is external ops on the n8n side, per the integration-layer roadmap.

### L5 build note (2026-07-25)

- **8.1 PlanView** — [`plan/PlanView.tsx`](../src/app/(platform)/app/[org]/plan/PlanView.tsx): ONE component, four render modes selected by `engagementProfile.planView` at render time exactly as the spec demands: **Gantt** (phase-grouped proportional timeline bars, RAG-tinted, today marker; layout maths `ganttLayout` unit-tested), **checklist**, **workflow-state board** (5 status columns), **season calendar** (month buckets). All four implemented, not stubs — each is modest by design; the Gantt is the evidenced-first mode per the spec's ordering. Rendered on `/plan` above the register table, showing the SAME filtered rows.
- **8.2 Coordination v2** — PLAN tasks join the queue (Not Started/In Progress/Blocked by end date; overdue/blocked = urgent); items carry an `assignee` and the page gains a **By priority / By assignee** toggle (spec: ISSUES by Assigned_To). **Inline actions per D-10**: "Mark done" (ISSUES) and "Mark sent" (COMMS) buttons — plain role-gated server actions through `writeRecord` (`quickResolveAction`), no proposal queue (human-direct writes).
- **8.3 Portfolio columns** — `DashJob` gains `openIssues` + `budgetVariancePct` (derived from the reads the dashboard already makes); rendered on the dashboard job list **only when `engagementProfile.portfolioView` is on** (explicit ENGAGEMENT_TYPE_CONFIG flag, D-11) and variance only for finance-visible viewers.
- **8.5 Register export** — shared [`csv.ts`](../src/lib/platform/csv.ts) + export route handlers for the Issues Register (`/actions/export`) and Plan (`/plan/export`): same listQuery filters as the current view, RLS-scoped via the same sources, ALL matching rows. **Deliberate deviation recorded**: emitted as Excel-compatible CSV (UTF-8 BOM), not literal .xlsx — the platform carries no xlsx writer dependency; revisit if a customer needs true .xlsx. "Export CSV" actions on both page headers carry the active filters.
- **8.6 PDF-on-approve parity** — `approveReport` (Airtable path) now also renders the approved report as an immutable, SHA-256-hashed PDF DOCUMENTS snapshot via `generateManagedDocument` (best-effort; drafts stay cheap markdown) — parity with the Postgres path and the tender report, per the live-vs-snapshot governing rule.
- **8.4 labels** — `/plan`'s column headers localize via `labelForAppField` (the demonstration window); approvals cards + assistant prompt were done in L4. **Plan-doc correction**: there is no shared table renderer to change once — remaining windows adopt the same 3-line pattern as they're touched, and construction/roofing DOMAIN_LABELS seed rows are an Airtable ops task.
- **Verified**: tsc clean (src), eslint clean, vitest 204 pass (+3 ganttLayout); plan/coordination/actions/dashboard/export routes all 307 behind Clerk.
- **M8 lock note**: all Module 8 build items are now closed or explicitly decided (D-9..D-13). With L0–L5 complete, **Modules 5, 6, 7 and 8 are all lockable** — the spec can flip them to LOCKED in v13 once the ops activation checklist runs.
