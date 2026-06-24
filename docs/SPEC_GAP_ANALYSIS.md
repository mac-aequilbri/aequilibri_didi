# Spec Gap Analysis — Production Build Specification v5 (Manila Build Brief)

Assessment of the `aequilibri-next` codebase against *aequilibri Production Build Specification — Manila Build Brief* (Build Spec 5).
Date: 2026-06-24. Branch assessed: `master`.

## How to read this

- **Spec status** = the tag the client put on the module (LOCKED = requirement is firm; DRAFT = first-pass, not evidence-tested).
- **Alignment %** = our estimate of how much of the *locked/drafted requirement* is actually built and wired, not how much code exists. It is judgment, not a metric.
- **Build state** = what genuinely exists in the repo today.
- A high % against a DRAFT module means we are *ahead of* a loosely-specified requirement; it does not mean the module is "done" in a production sense.

## Summary table

| # | Module | Spec status | Alignment | Build state (1 line) | Headline gap |
|---|--------|-------------|-----------|----------------------|--------------|
| 1 | Customer Onboarding Engine | LOCKED | **~85%** | Onboarding service + programmatic base provisioning + runbook + governance/versioning + RBAC + control-base registry | New clients inherit schema automatically (provisioner clones the live template, which is current); only legacy-base back-fill is manual — a non-issue in a test env with no real clients. Forward risk = `PLATFORM_TABLES` allowlist coupling for future *new tables* |
| 2 | Data Ingestion & Source Mgmt | LOCKED | **~70%** | Full ingestion pipeline wired (extract → canonical-name → DOCUMENTS → route to CASHFLOW/PROCUREMENT/DECISION/ACTION as proposals); Drive + trades catalog | **Live mailbox adapter + n8n event-trigger pending** — `email.ts` is a `DemoEmailReader` fixture behind a real `EmailReader` interface; routing logic itself is built |
| 3 | Assessment Engine | LOCKED (arch) | **~70%** | One-engine/pluggable architecture built; roofing capability COMPLETE (UC1); tender comparison + architectural scope built | Tender comparison & architectural scope are heuristic text parsers, **not evidence-tested against real Peak / contract data** |
| 4 | Document Management | LOCKED | **~70%** | DOCUMENTS registry + outbound generator (pdf/docx/md) + versioning/supersession + decision traceability fields | Renderer is a minimal in-house writer, not the full branded `pptxgenjs/docx` template system; supersession + traceability not fully automated |
| 5 | Project Intelligence Layer | DRAFT | **~65%** | Risk/critical-path banding rules + cascading-update logic + coordination view ("what needs my attention") | Cascading rules not yet formalised **as `LEARNING_RULES` records**; `ongoing`/`seasonal` engagement types incomplete |
| 6 | Learning Loop | DRAFT (blocked on M1) | **~60%** | CORRECTIONS/JOBS tables added; corrections→hypotheses→rule-promotion pipeline + LEARNING_RULES lifecycle on Airtable | Unblocked structurally, but **not exercised with real correction volume**; confidence calibration still "by feel"; no session-close capture prompt |
| 7 | Conversational Assistant | DRAFT (lightly scoped) | **~70%** | Chat + executor + role-scoped tool policy + propose-before-write + approval queue | Production multi-user/role-scoped surface vs single-user Claude Projects unresolved; voice not built; tail of assistant reads still Postgres |
| 8 | Reporting & Visualisation | DRAFT (lightly scoped) | **~60%** | Audience-scoped reporting policy (owner/builder/broker) + live-vs-snapshot rule + report pages + print views | No live dashboards templated from live Airtable data; charts/visualisation thin; bespoke not yet fully templated |

**Cross-cutting (applies to all modules):** Airtable-as-system-of-record migration is **~done behind the `AIRTABLE_MIGRATION` flag but not fully live-verified**, with a tail of Postgres-only reads (AI assistant, a few feature/display pages). Tech stack matches the spec: Next.js 15 / React 19 / Clerk / shadcn; model routing matches (Haiku=classify, Sonnet=default, Opus=gated). **n8n is not deployed at all.**

---

## Module-by-module detail

### Module 1 — Customer Onboarding Engine — LOCKED — ~85%

**Built**
- `src/services/platform/onboarding.ts` — `provisionOrganisation`, control-base path (`nextOrgId`, registry write) and legacy Postgres path.
- Programmatic base provisioning: `src/lib/airtable/provision.ts` (+ `scripts/airtable-provision-base.mjs`) clones the template base structure (Airtable has no clone API) incl. the reverse-link rename fix.
- `src/lib/platform/module1Governance.ts` — Core/Domain schema versions, `MODULE1_REQUIRED_CORE_TABLES` (CORRECTIONS/JOBS/ORGANISATIONS/INTELLIGENCE_SNAPSHOT), `ONBOARDING_LOAD_SEQUENCE`, role normalisation.
- `docs/module1-onboarding-runbook.md` — the manual runbook the spec asks for (Phase A).
- RBAC: owner/builder/architect/broker enforced (`authConfig.ts`, `reportingPolicy.ts`, `isolation.test.ts`).
- Control base registry (`src/lib/airtable/control.ts`) — org registry + team membership without Postgres.
- Diagnostics page + propagation-tracking scripts (`airtable-module1-propagation-status.mjs`).
- **Schema-drift dashboard (the +1%, delivered 2026-06-24)** — `src/lib/platform/schemaDriftSource.ts` + admin page `/app/[org]/schema-drift` (linked from `/diagnostics`). Compares every org's base against the template's *provisionable* schema (`expectedPlatformSchema` in `provision.ts` — excludes computed fields + never-cloned TEAM/PRICING links so a correct clone reads in-sync) and reports missing tables/fields per base. tsc + eslint clean; template read live-verified with the local PAT (31 platform tables incl. ASSESSMENTS + the two links). Surfaces the spec's hardest acknowledged problem (drift across cloned bases) as a controllable view; one-click "migrate this base" remains as the next increment.

**Gaps vs spec**
- **Schema propagation to NEW clients is automatic** — `provisionClientBase` clones the template's live schema at onboarding, and the template base (`AIRTABLE_TEMPLATE_BASE_ID` = demo base `appharWaojouHgMeW`) already has all 3 changes (ASSESSMENTS table + CORRECTIONS.Hypothesis + DECISIONS.Job links, all in the `PLATFORM_TABLES` copy set). So the 3 scripts only needed running once, on the template. Back-filling *legacy* bases is the only manual bit — a non-issue in a test environment with no real clients. Forward risks: (a) keep `AIRTABLE_TEMPLATE_BASE_ID` pointed at the complete base, NOT the incomplete `appIf959oh38fgKYp` Master Template; (b) any future *new* table must be added to `PLATFORM_TABLES` (provision.ts:24) + the script twin to be cloned.
- Customer-Configuration separation (domain-standard vs customer values) exists in code intent but isn't enforced as a checklist gate.
- Access provisioning is "specify, not implement" per spec — we have implemented it, so this is ahead.

### Module 2 — Data Ingestion & Source Management — LOCKED — ~70%

> Revised up from an earlier ~50%. The email/attachment *pipeline* is in fact built and wired end-to-end; only the live mailbox source connector and the n8n trigger are missing. The earlier score wrongly treated the stubbed data source as if the whole module were absent.

**Built**
- **Full inbound extraction pipeline, wired end-to-end:** `ingestUnreadEmails` (`src/services/platform/documents.ts:605`) → fetch unread → extract each attachment → canonical-name → write DOCUMENTS record → infer route suggestions → push operational writes (CASHFLOW/PROCUREMENT/DECISION/ACTION) as proposals → `markProcessed`. Exposed via `ingestInboxAction` on the documents page. The same routing also runs on manual uploads (`ingestDocumentFile`).
- File-naming taxonomy + canonical-naming + versioning logic: `src/lib/platform/ingestion.ts` (`CanonicalNameResult`, lineage keys, version suffixes) — matches the locked `topic_yyyy-mm-dd_version` convention.
- Route-to-table suggestion (cashflow/procurement/decision/action) — the spec's "judgment" step — built and producing proposals.
- Google Drive integration: `src/lib/platform/gdrive.ts`, `storage.ts`.
- DOCUMENTS registry (shared with Module 4).
- Trades/categories reference: `src/lib/platform/jobCatalog.ts` + `loadTradeOptions` (the spec's "trades/categories/items" foundational table — present).

**Gaps vs spec**
- **Live mailbox adapter not built.** `src/lib/platform/email.ts` is a `DemoEmailReader` returning fixtures; the comment notes "a real IMAP/Graph adapter slots in behind the same interface." The interface and consumer exist — only the real connector is missing.
- **n8n is not deployed** — no workflow exists; the event-triggered email PoC (the explicit n8n proof-of-concept) is absent. Triggering today is manual (button) / scheduler, not event-driven.
- Architectural-document → ROOM_MATRIX foundational intake is heuristic only (see Module 3).
- WhatsApp/Otter and full document-intelligence extraction are explicitly deferred in the spec — correctly absent.

### Module 3 — Assessment Engine — LOCKED (architecture) — ~70%

**Built**
- One-engine/pluggable-modules architecture exactly as specified: `src/services/platform/module3/engine.ts` orchestrates capability modules, validates output, logs to EXECUTION_LOG/CORRECTIONS.
- **Roofing Estimation — COMPLETE** as the reference implementation (UC1: Geoscape → CV → Claude Vision pipeline, `(uc1)` routes + `uc1Source.ts`).
- Builder Tender Comparison (`builderTenderComparison.ts`) — tender normalisation, gap/inclusion, firm-vs-provisional flagging scaffolded.
- Architectural Scope Assessment (`architecturalScopeAssessment.ts`) — room recognition → ROOM_MATRIX, trade inference.

**Gaps vs spec**
- Tender comparison & architectural scope use **regex/heuristic text parsing**, not real document AI or CV; the money/room extraction is brittle.
- **Not evidence-tested against real Peak tender data or the real Master Building Contract** — the spec flags this as the key open validation and we have not closed it.
- Negotiation-step scope (open question in spec) — not addressed.

### Module 4 — Document Management — LOCKED — ~70%

**Built**
- DOCUMENTS registry source (`documentsSource.ts`, `docs.ts`) — inbound + outbound records.
- Outbound generation: `src/services/platform/documents.ts` (`generateManagedDocument`) + `documentRenderer.ts` (pdf/docx/md), consumed by Module 3 outputs.
- Versioning/supersession logic and document-to-decision traceability fields.
- Snapshot-vs-live distinction is encoded in `reportingPolicy.ts`.

**Gaps vs spec**
- The renderer is a **minimal hand-rolled PDF/DOCX writer**, not the full branded `pptxgenjs/docx` template system the spec names; customer-branded variants (NOMENCLATURE_OVERRIDES) are thin.
- Automatic supersession on "matching topic + later date" is specified; current logic is partial/not fully automated.
- Decision→document traceability link is modelled but not consistently populated.

### Module 5 — Project Intelligence Layer — DRAFT — ~65%

**Built**
- Risk/critical-path classification rules: `projectIntelligence.ts` (`priorityBandForRiskScore`, `priorityBandForActionDueDate`, banding CRITICAL→LOW).
- Cascading-update logic: `sourceCascade.ts` (+ tests), `delay-cascade` route.
- Coordination view ("what needs my attention now"): `coordinationSource.ts` + `/coordination` route — the spec's single most-used feature.

**Gaps vs spec**
- Cascading rules live **in code, not as `LEARNING_RULES` records** with Trigger_Context/Operational_Directive — the spec's draft deliverable is to formalise them as data.
- Risk classification is a fixed heuristic, not yet a learned rule.
- Engagement types: `ongoing`/`seasonal` behaviours incomplete (per prior build notes); Dulong Downs' type not confirmed.

### Module 6 — Learning Loop — DRAFT (blocked on M1) — ~60%

**Built**
- The M1 blockers are cleared: CORRECTIONS + JOBS tables exist.
- Full loop on Airtable: `corrections.ts` (emitCorrection), hypothesis engine (cluster → create/update HYPOTHESES), `promoteHypothesisToRule`, LEARNING_RULES lifecycle (canonical schema, counters, status).
- INTELLIGENCE_SNAPSHOT writes.

**Gaps vs spec**
- Structurally complete but **not exercised with real correction volume** — the spec's "production grade = actually run with real corrections" bar is unmet.
- CORRECTIONS/JOBS *capture discipline* (what triggers a record, mandatory Root_Cause) not enforced.
- Confidence_Level calibration is still assigned "by feel"; Override_Permission evolution undefined.
- No structured session-close prompt to surface corrections (spec open question).

### Module 7 — Conversational Assistant Layer — DRAFT (lightly scoped) — ~70%

**Built**
- Assistant: `assistant/chat.ts`, `executor.ts`, `tools.ts` (fixed-table tools, the model never names tables), `policy.test.ts`.
- Role-scoped tool access (`roleCanUseTool`) + propose-before-write via the approval queue (`PlatPendingWrite`).
- Session/EXECUTION_LOG protocol present.

**Gaps vs spec**
- Production multi-user surface vs single-user Claude Projects is unresolved (spec's main open question) — our assistant is in-app, which is ahead, but multi-party/role-differentiated behaviour is thin.
- Voice input not built.
- A tail of assistant reads still hit Postgres (not yet Airtable-native).

### Module 8 — Reporting & Visualisation Layer — DRAFT (lightly scoped) — ~60%

**Built**
- Audience-specific views: `reportingPolicy.ts` (owner = full financials; builder/architect = scope/schedule; broker = portfolio).
- Live-vs-snapshot rule encoded; report pages + print variants (`reports/[id]`, `quotes/[id]/print`).
- Report detail source + generation via Module 4.

**Gaps vs spec**
- No **live dashboards templated from live Airtable data** — reporting is largely snapshot/document generation.
- Visualisation/charts are thin (Gantt/critical-path views from the XLSX exports not reproduced live).
- Templated-from-live-data generation (vs bespoke) only partial.
- Spec itself questions whether this module is needed before 5+ customers — so under-build here is arguably *on-strategy*.

---

## Cross-cutting items (not a numbered module but spec-mandated)

| Item | Spec requirement | State |
|------|------------------|-------|
| Airtable = system of record | Non-negotiable; one base per customer cloned from Master Template; 1:1 Postgres mapping | Migration ~complete behind `AIRTABLE_MIGRATION` flag; per-customer provisioning works; **not fully live-verified**; tail of Postgres reads remain |
| Next.js 15 / React 19 / Clerk / shadcn | Confirmed stack | ✅ Matches |
| Claude model routing | Sonnet default, Haiku classify, Opus gated | ✅ `modelRouter.ts` matches (Opus pinned to 4.7 vs spec's 4.6 — newer) |
| Five tool functions | get_records · create_record · update_record · send_email · log_execution | ✅ Present via recordWriter + assistant tools |
| n8n event-triggered automation | Module 2 email PoC is the primary n8n target | ❌ Not deployed |
| Google Drive storage | URLs only in Airtable | ✅ `gdrive.ts` |
| Master Template completeness | Template must hold Core + both Domain Extensions | ⚠️ Template historically missing the full Residential Project Delivery + roofing extension tables; demo base is the de-facto canonical one |

## The three things that move the needle most

1. **Finish + live-verify the Airtable-native migration** (kill the Postgres read tail, run the schema scripts on all client bases, confirm on Render with a valid PAT). Almost nothing is live-verified; this de-risks every module at once and is the real meaning behind both this analysis and Copilot's "needs real environment validation."
2. **Connect Module 2 to a real mailbox + the n8n trigger.** The extraction/naming/routing pipeline is built — the remaining work is the live IMAP/Graph adapter behind the existing `EmailReader` interface and the event-triggered n8n workflow. Smaller than it first appears.
3. **Evidence-test Module 3 tender comparison against real Peak / Dulong Downs contract data.** Architecture is right; the validation the spec demands is missing.

## Reconciliation note (vs GitHub Copilot's assessment)

Copilot rated the modules High / Medium-High. After re-tracing the code, we substantively agree on 7 of 8 — its listed gaps match this document's almost verbatim (real-data testing, end-to-end runtime verification, engagement-type mapping, usage validation, report templating). The one genuine divergence was **Module 2**, where Copilot was closer to correct: the pipeline is built and only the live source + n8n are pending, so this doc has been revised from ~50% to ~70%. The remaining difference in tone is definitional — Copilot scores *code-present*, this doc scored *evidence-tested*. Both agree the dominant caveat is that the build is **code-complete against spec intent but not yet live-verified.**
