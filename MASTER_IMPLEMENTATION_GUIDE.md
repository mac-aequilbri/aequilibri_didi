# aequilibri-next — Master Implementation Guide

> **Consolidated:** 2026-07-28. This document consolidates the repository's 26 substantive Markdown documents into a single authoritative implementation reference. Where source documents conflicted, the most recent verified state wins and the supersession is noted. Full source traceability is in the [Appendix](#appendix--source-document-mapping).
>
> **Living companions (not absorbed, still authoritative for their open items):** `docs/airtable-postgres-switch-audit.md` (backend-switch debt register), `docs/enterprise-audit-2026-07-26.md` (P0–P3 action register), `docs/production-readiness-audit.md` (runbook/DR detail), `docs/spec12-lock-plan.md` (spec-lock record), `docs/governance-phase0-decisions.md` (unsigned D1–D9), `docs/project-rls-activation.md`, `docs/n8n-automation-plan.md`, `docs/module1-onboarding-runbook.md`, `docs/design-system.md`.

---

# Executive Summary

aequilibri-next is a multi-tenant, AI-assisted operations platform for project-based businesses (construction, roofing, legal verticals). Next.js 16 App Router + TypeScript, **Airtable as the system of record** (one base per client org + a shared control base), Clerk authentication, Anthropic-powered assistant/agents, deployed on Render (single instance, Singapore).

Current state (2026-07-28):

- **Production posture:** Enterprise audit (2026-07-26) scored **63/100 — GO WITH CONDITIONS** for the platform surface (`/app`, portal, webhooks) on a single always-on instance; **NO GO** for the legacy UC1 public surface (since gated behind Clerk) and for horizontal scaling (>1 instance). Production-readiness self-audit (2026-07-25): 66/100. The dominant pattern in both: "built but not operational" — remediation is mostly activation, not construction.
- **Spec compliance:** Build Spec 12 Modules 1–4 LOCKED; Modules 5–8 built to lockable state via phases L0–L5 (completed 2026-07-24/25, pushed to master); spec v13 can flip them to LOCKED once the small ops-activation tail runs.
- **Backend:** the Airtable/Postgres switch evolved from a one-way global lever (`AIRTABLE_MIGRATION`) into a per-org selector (`data_backend_postgres` feature flag) with an ID bridge (`airtableRecordId` on all 37 platform models) and bidirectional data movers (`scripts/migration/`), all completed 2026-07-28 (phases A–D).
- **Security:** Clerk live in production (2026-07-28); project-level RLS feature-complete but **fail-open** until the per-org `PROJECT_RLS_ENFORCE` flag is flipped; two late RLS read leaks found and fixed 2026-07-28 (commit 5fc63f3).

---

# Solution Overview

## The 8-module platform model

Five value-chain modules in sequence plus three enabling layers (adopted over the original brief's "seven modules"; two promotions — Data Ingestion and Document Management — justified the count):

| # | Module | Role |
|---|--------|------|
| 1 | Customer Onboarding Engine | Instance setup (base clone, Clerk, org registry) + domain knowledge initialisation |
| 2 | Data Ingestion & Source Management | All external sources in, write-back out (email, files, APIs) |
| 3 | Assessment Engine | Intake → data cascade → AI/vision analysis → judgment (LEARNING_RULES) → structured output |
| 4 | Document Management | Storage refs (Drive URLs), versioning, classification, document intelligence |
| 5 | Work Intelligence Layer (Project Intelligence) | Engagement-typed delivery: phases, budget, cashflow, variations, risk, portal, COMMS, PLAN |
| 6 | Learning Loop | CORRECTIONS → HYPOTHESES → LEARNING_RULES with human gates and confidence maths |
| 7 | Conversational Assistant Layer | In-context LLM at every stage; propose-before-write |
| 8 | Reporting & Visualisation Layer | Registers, dashboards, RAG boards, reports, portfolio view |

Flow: Onboard → Ingest → Assess → (Document) → Run the engagement → Learning Loop captures corrections → next assessment improves → intelligence compounds.

## Engagement types

`JOBS.Engagement_Type` (not the customer) selects a capability profile over the *same* shared tables:

- **Short job** (repair): scheduling, materials, crew, invoice; checklist plan view; no risk register.
- **Long project** (residential/commercial build): phases, budget vs actual, cashflow, variations, risk, portal; Gantt plan view.
- **Ongoing lifecycle** (insurance/facilities): workflow-state plan view.
- **Seasonal cycle** (farming): season-calendar plan view.

Per-type depth flags are read from `ENGAGEMENT_TYPE_CONFIG` via `engagementProfile.ts` (TTL-cached; spec's four defaults as code fallback). The first config template is Long Project, seeded from Dulong Downs Didi.

## History: UC1/UC2/UC3 convergence

The platform began as three silos: **UC1** (Port City Roofing — roofing measurement/quote, the mature Assessment Engine), **UC2** (Didi — single-project AI construction coordinator for Dulong Downs), **UC3** (multi-tenant MSME construction PM). UC2 and UC3 were recognised as the same engagement type implemented twice; both converged onto a shared Project Intelligence core at `(platform)/app/[org]/…` with the `engagementType` discriminator (UC3's multi-tenant schema as base). The standalone UC2 module and `Uc2*` tables are gone; "Dulong Downs / Didi" is now the `dulong-downs-didi` organisation. UC1 remains a flag-gated legacy stack (~8.5k LOC under `(uc1)`), Postgres-only, now auth-gated with the platform.

## Live organisations

Seven live client bases: `dulong-downs-didi` (construction, base `appmDPKjRT4Kp9rvN`, first real-data client), `meridian-legal` (first `legal` vertical, base `appr9sReyIHgS6FXy`, ~3,000 synthetic matters), `ataro-com`, `sunridge`, `port-city-roofing`, `rhins`, `builders-co`.

---

# Business Requirements

- **Source specs:** *aequilibri Production Build Specification* — Spec 5 (Manila Build Brief) → Spec 10 (2026-06) → **Spec 12 (Version 12, 30 June 2026)**, the current authority. Spec 12 defines the 8 modules, the 21-table Core, engagement types, the 7 cascading rules, Module-6 thresholds/confidence formula, and the role taxonomy.
- **Governance Framework v3.0** (derived from the live Didi base, 39 tables): RBAC/RLS/CLS/FLS requirements, canonical vocabularies (§5), DOMAIN_LABELS nomenclature layer (§4), agent-to-data authorization (§8), reporting MVP (§9). Nine blocking Product-Owner decisions (D1–D9) are captured in `docs/governance-phase0-decisions.md` — **all still unsigned** (approving authority: Claudia Salem, Product Owner).
- **Multi-tenancy requirement:** one Airtable base per customer (privacy/auditability model) + one shared control base for platform config; org-level isolation structural, project-level isolation via assignment-scoped RLS.
- **Human-in-the-loop requirement:** every AI-initiated write is proposed, reviewed, and approved before execution ("propose-before-write"); approvals with edits emit CORRECTIONS that feed the learning loop.

---

# Architecture

## High Level Design

```
UI (server components, src/components)
  → server actions / API routes (src/app)
    → data-source layer (src/lib/platform/*Source.ts   ~40 view-model builders)
      → Airtable client w/ per-base rate limiter + TTL caches (src/lib/airtable)
      ⇄ Prisma/Postgres (legacy dual path, per-org selectable)
```

- **All writes funnel through one chokepoint:** `src/lib/platform/recordWriter.ts` (~1,227 LOC). Pipeline: Zod validation → vocabulary enforcement (`enforceVocab`) → role gates (`canWrite`/`canApprove`) → RLS gate → immutable-snapshot guards → PENDING_WRITES proposal queue (AI writes) → `performWrite()` (Airtable field maps OR Prisma delegate) → append-only EXECUTION_LOG → post-write reconciliation (`reconciliation.ts`) → cascade hooks (`cascade.ts`, `closeJob.ts`) → outbound events.
- **Reads** use per-page `*Source.ts` modules with `fromPostgres`/`fromAirtable` branches behind `airtableEnabled(ctx)` and uniform backend-neutral `*View` interfaces. Components have **zero** direct data-access imports (verified).
- **List windows** (12+) share `listQuery.ts` + `FilterBar` + `SortableTh` + `GroupHeader`: URL-driven search/enum/range filters, sort, pagination, and categorical group-by (`?group=<field>`), all as pure post-fetch operations (zero extra Airtable reads).
- **Auth:** Clerk enforced in `src/proxy.ts`, fail-closed (503) if half-configured; `ALLOW_DEMO_MODE` escape hatch removed from prod. Membership/roles live in the control base `PLAT_TEAM` (Clerk authenticates identity only — see ADR "D6").
- **Scale shape:** single Render instance by construction (per-process rate limiter 4.5 req/s/base vs Airtable's 5 req/s cap, in-process caches, proposal claim, scheduler lock). `numInstances: 1` pinned in render.yaml. Do **not** scale >1 until a shared (Redis) limiter/cache exists.

## Component Design

| Path | What |
|---|---|
| `src/app/(platform)` | Multi-tenant platform (`/app/[org]/…` — dashboards, approvals, cashflow, plan, coordination, reports, assistant) |
| `src/app/(uc1)` | Legacy roofing app (flag `UC1_ENABLED`, auth-gated) |
| `src/app/(public)` | Landing + client portal (`/portal/[token]`, noindex) |
| `src/lib/airtable` | Name-addressed client (retry/backoff, 30s timeouts, 10-record write batches), rate limiter, TTL caches, control-base registry, `schema.generated.ts`, `fieldMaps.ts`, `provision.ts` |
| `src/lib/platform` | org-context, roles/RLS/CLS, recordWriter, vocab, sources, listQuery, crypto, logger, money, csv |
| `src/services` | Domain services (assistant/agents, documents/ingestion, scheduler, construction, learning, closeJob, cascade) |
| `scripts/` | Airtable schema/seed/migration ops (`airtable-*.mjs`, `scripts/migration/`, `scripts/legal-demo/`) |

Key platform invariants (Spec-12 cross-check):

1. Single write chokepoint (`writeRecord`) — new behaviors attach here, not in pages.
2. Propose-before-write for AI; deterministic system writes go direct with EXECUTION_LOG audit.
3. Tolerant Airtable reads (`listOptional`), derived values computed app-side (e.g. `budgetActuals()` derives BUDGET.Actual — never trust/enter the rollup manually).
4. Schema changes ship as additive `scripts/airtable-extend-*.mjs` runs against templates + live bases, plus a hand-patch to `schema.generated.ts`.
5. Learning-loop plumbing live end-to-end (`emitCorrection` → detect → validate → promote → inject into chat context).

### Assistant / agents (Module 7)

- Multi-agent: supervisor + 7 module specialists (`agents/orchestrator.ts`, `agents/registry.ts`); model routing Haiku=classify / Sonnet=default / Opus=gated (`modelRouter.ts`, env-overridable via `ANTHROPIC_MODEL`).
- Role-scoped fixed-table tools (`ROLE_WRITE_ALLOW`/`ROLE_QUERY_DENY` in `tools.ts`) — the model never names tables. High-risk writes (`draft_comm`) always approval-gated, even under `auto_low_risk` org policy.
- Per-turn SESSION CONTEXT (L4): active job PHASES status+RAG, BUDGET summary (finance-visible roles only), open ISSUES by type, 10 recent DECISIONS, 3 recent EXECUTION_LOG entries; 60s TTL cache invalidated on every write.
- Every write tool carries a `proposalReason` → rendered as a rationale line on approvals cards.
- Standalone `/chat` = the full assistant repackaged behind its own feature flag (channel-via-session-title).

### Cascade engine (Module 5, L2)

Deterministic post-write hook `runCascades()` in both `writeRecord` and `executeProposal` (Airtable-mode only, system-actor writes skipped, every rule try/caught). Seven rules seeded as LEARNING_RULES records `CASCADE-A..G` (owner can switch off; fires only when Status=Active):

- **Write effects:** D — PROCUREMENT → Invoiced/Paid upserts an outgoing CASHFLOWS txn (idempotent via `cascade:<procId>` marker); F — Blocker ISSUE floors linked phase RAG at Amber (needs payload `phaseId`; no-op without); G — RISK status → `materialised` auto-creates a linked ISSUES row (`Issue_Type="Risk Materialised"`).
- **Advisories:** A (phase status), B (vendor), C (budget), E (procurement date) — EXECUTION_LOG rows surfaced in the coordination queue, dismissible ("Not relevant" = override → confidence decay + ladder + module5 CORRECTION).

Known limitation: cascades and reconciliation fire only on app-mediated writes; direct Airtable-UI edits bypass them.

### Learning loop (Module 6)

CORRECTIONS (mandatory Root_Cause) → hypothesis clustering (detect threshold: 5 corrections, same Root_Cause+Source_Module+Supplier/Phase) → per-type validation thresholds **Supplier 3 / Domain 5 / Estimation Bias 8 / Scope Creep 5 / Seasonal 2 seasons (dormant until Season_Year data)** → owner-gated promotion to LEARNING_RULES → confidence maths: **cap 85 at promotion, +1 per clean application to max 95, −5 per override, ≤60 flags review, ≤50 auto Under-Review**. Override ladder (`Override_Level`): Owner_Only / Standard / Advisory; new rules start Owner_Only; >3 overrides in the rolling last-10 (`Application_Window`) auto-demotes one level; 10 clean applications surfaces an owner-click "relax" suggestion. Job close (`closeJob.ts`): budget/schedule deltas + `Scope_Changes_Count` persisted to JOBS, material deltas (|budget| ≥ 10 %, |schedule| ≥ 7 days) flip `Learning_Rule_Candidate` and emit module6 corrections. Session protocol: ≥3 new CORRECTIONS since last session injects a review block; session close lists today-fired rules with per-rule "applied incorrectly?" toggles.

## Data Flow

1. **Human write:** form → server action → `writeRecord` (role/RLS/vocab gates) → direct write → EXECUTION_LOG → reconciliation → cascades.
2. **AI write:** assistant tool → executor → PENDING_WRITES proposal (with rationale) → approvals page (field-level before→after diff; approve-with-edits emits per-field CORRECTIONS) → `executeProposal` → write + cascades + outbound events.
3. **Inbound email:** n8n Gmail workflow → HMAC-signed `POST /api/platform/hooks` → verify signature+timestamp (±300 s) → active `email/in` connection check (403 default-deny) → dedup on `email:<messageId>` → ingestion pipeline (classify → canonical-name → DOCUMENTS row → route suggestions as proposals) → connection health stamp.
4. **Outbound:** approvals/report lifecycle emit events (`report.ready`, `comms.create`) → `PLAT_OUTBOX` rows → shared n8n workflow polls `pending`, delivers, marks `delivered`/`failed`; platform scheduler re-drives `failed` (<5 attempts → `pending`, else `dead`).
5. **Reporting:** catalog (`reportCatalog.ts`, 9+ predefined reports, narrative vs deterministic) or custom prompt (`generateCustomReport`, server-side scope intersection with `reportingCapabilities(role)`) → DOCUMENTS row with `module8` lifecycle block → draft → approved (Airtable path now also renders an immutable SHA-256 PDF snapshot) → sent.

## Integrations

| Integration | Mechanism | Status |
|---|---|---|
| Anthropic Claude | `src/lib/claude.ts` singleton (180 s timeout, maxRetries 2) + `modelRouter.ts`; usage now logged on all 4 call paths | Live |
| Clerk | `src/proxy.ts` fail-closed; invitations via `clerkClient.invitations`; membership authoritative in `PLAT_TEAM` | Live in prod (2026-07-28) |
| Airtable | System of record; PAT-authenticated; name-addressed | Live |
| n8n Cloud | HMAC webhooks in (`/api/platform/hooks`), `PLAT_OUTBOX` out; n8n owns transport + Gmail credentials, platform owns event contract + config intent. Inbound = one workflow per client; outbound = one shared workflow routed by `Org_Slug` | Platform side live (pilot `dulong-downs-didi:email:in`); n8n workflows A/B **not yet built** |
| Google Drive | Storage refs only (URLs in Airtable); one service-account Drive segregated by `<orgSlug>/` subfolders | Live |
| Xero / MYOB / QBO | **Simulated only** (demo tokens); real OAuth requires encrypted secret storage first | Stub |
| Google Maps/Solar, Geoscape PSMA, GA LiDAR | UC1 ingestion pipeline (roofing) | Legacy, gated |
| BIMx (Graphisoft) | Viewer built (`BimxViewer`, portal + project pages); element/quantity API seam reserved (`provider` field) — defer until a tendering customer | Viewer only |

---

# Technical Specifications

## Data model — three-tier taxonomy

- **Core** (identical in every base, 21 tables per Spec 10/12): JOBS, WORKSTREAMS, DECISIONS, ISSUES (née ACTION_HUB), RISKS, PHASES, PLAN, COMMS, CHANGE_LOG, CASHFLOWS, BUDGET, PROCUREMENT, CONTACTS, ORGANISATIONS, DOCUMENTS, LEARNING_RULES, HYPOTHESES, CORRECTIONS, EXECUTION_LOG, INTELLIGENCE_SNAPSHOT, DOMAIN_LABELS.
- **Domain Extension** (per vertical): construction project-delivery tables, roofing estimation tables (RATE_CARD, PRICING, …), legal matters.
- **Customer Configuration:** TEAM, REF_* reference data, NOMENCLATURE, PRICING values, settings.

Prisma mirrors this 1:1 (`Plat*` models, ~90 total; `plat_core_*`/`plat_con_*`/`plat_cfg_*` @@map names). Since Phase B (2026-07-28) every one of the 37 platform models carries `airtableRecordId String? @unique` (the ID bridge), and 11 mirror models exist for previously Airtable-only tables (`PlatComms`, `PlatConPlanTask`, `PlatEngagementTypeConfig`, 8 `PlatCtl*` control-base mirrors — schema-only at runtime).

**Relationship topology caution:** live Airtable is wired differently from the old Postgres instinct — WORKSTREAMS is a linking hub; people fields are TEAM linked records, not strings; CORRECTIONS link to EXECUTION_LOG, not Job. Field maps were reconciled table-by-table against the live schema (never auto-generated from Prisma). Machine-readable schema: `docs/airtable-core-schema.json`, `src/lib/airtable/schema.generated.ts`.

**Airtable platform constraints** (all handled in app code): no transactions (propose/confirm queue + idempotency), no unique constraints (uniqueness enforced at the write path), no cascade deletes (explicit app cascades), Decimal→float (authoritative money math in `src/lib/platform/money.ts`; Airtable values are display copies), select-option drift (`typecast:true` auto-creates options — vocab enforcement compensates), 10-record write batches, ~4.5 req/s/base effective (limiter 220 ms/req vs Airtable cap 5 req/s), ~50k records/base ceiling (unmonitored; Meridian already ~3,000 matters), schema drift across cloned bases (mature report-only drift detection at `/app/[org]/schema-drift`).

## Canonical vocabularies (Governance §5)

Enforced at the write chokepoint (`vocab.ts` in `performWrite`, built 2026-07-15): case variants normalize, unknown values force to a review-default and warn-log — never guess, never auto-create options. Notable canonical sets: ISSUES.Status = Open · In Progress · Blocked · Deferred · Closed; PROCUREMENT.Status = Selection Required · Selected · Quoted · Invoiced · Paid · Delivered · Cancelled; ISSUES.Issue_Type = Open Action · Blocker · Risk Materialised · Decision Required · Scope Change Trigger. CHANGE_LOG keeps `Status=Pending` / `Change_Type=Variation` pending the D1 amendment (Spec 12 stores variation orders there). The ~1,900-record retag of the Didi base (HIGH 336 · MED 212 · REVIEW 111, `scripts/airtable-retag-vocab.mjs` + `scripts/data/governance-retag-map.json`) is tooled and dry-run-validated but **blocked on D1–D4 sign-off**.

## Roles & access model

- **Code taxonomy is canonical (Spec-12 D-1):** `owner / builder / architect / broker` + string-suffix sub-roles `+finance`, `+auditor`, `+business_owner`, `+delivery` (`module1Governance.ts`, `roles.ts` WRITE_MATRIX as data). Governance-framework display names map onto these (owner→Administrator/Business Owner, builder→Manager, architect→Contributor, broker→Viewer — D5, unsigned).
- **CLS:** finance surfaces (budget/cashflow amounts, unit costs) visible only via `financeVisible()` / `requireFinancialAccess` (owner + Finance Manager + Auditor); enforced in data sources and report context builders, not just UI.
- **RLS (project-level):** assignment scoping — org role stays global, *visibility* becomes per-job. `resolveJobScope(ctx, viewer)` → `{mode: all|some|none}`; exempt roles (owner, +auditor, +business_owner) always `all`. Assignments live centrally in control-base `PLAT_ASSIGNMENTS` (`Org_Slug, Email, Job_Rec_Id`) — Option B, decided 2026-07-24, superseding the per-base TEAM.JOBS design. Enforced at every seam (lists via `scopeRows`, job detail `notFound`, dashboard/assistant aggregates, recordWriter human gate, approvals, AI query path). **Fail-open until per-org `projectRlsEnforce` is flipped** in the org registry Settings; flip requires seeded assignments + scope-preview verification. A per-org **General job** (registry `generalJobId`, always in every member's scope) is the intentional home for org-level records — no record is ever visible-to-all by accident via a null job link.
- **COMMS.Stakeholder_Role** is a superset of login roles (adds Supplier/Regulatory/Other — non-login stakeholder categories).

## DOMAIN_LABELS (nomenclature layer)

Cached read layer (`domainLabels.ts`, 10-min TTL) keyed `${Core_Table}.${Core_Field_Label}`, vertical-matched with General fallback; `<TABLE>._TABLE` convention row names the table itself. Applied on record-edit windows, assistant system prompt, approvals cards, and `/plan` columns; remaining windows adopt the 3-line pattern as touched. Only the legal demo seeds labels; construction/roofing seed rows are an open Airtable ops task.

## UI / design system (PR review gate)

Token layer in `src/app/globals.css` (`--ae-*` brand + semantic tokens; stock Tailwind palette banned for semantic meaning). Canonical primitives: `Button`/`SubmitButton`/`ConfirmSubmitButton` (never `window.confirm`), `StatusBadge` (+`StatusMenu`), `Chip`/`AiChip`, `MessageBar`, `MetricCard`, `EmptyState`, `listQuery`+`FilterBar`+`SortableTh`+`GroupHeader`, `CreateForm`, lucide icons. The 10-point "consistent window" checklist (pending states, two-step confirms, skeletons, guided empty states, preserved input on error, format helpers, overflow-safe tables, visible focus, `ae-*` tokens only, no internal jargon) is the PR gate — see `docs/design-system.md` (retained as the living standard).

---

# Configuration

## Environment variables (activation matrix)

Every var and its activation behavior is documented in `render.yaml` (the authoritative registry; new env vars must be declared there per the PR checklist). Key switches:

| Variable | Effect |
|---|---|
| `AIRTABLE_MIGRATION` | `"true"` → Airtable is the (global-default) system of record; unset → Postgres. Since Phase D, `airtableEnabled(ctx?)` also honours the per-org `data_backend_postgres` feature (opt-OUT to Postgres only; forcing Airtable per-org while the global flag is off is unsupported) |
| `AIRTABLE_PAT` | Airtable token (secret; needs `schema.bases:write` for provisioning) |
| `AIRTABLE_CONTROL_BASE_ID` | Enables the control plane (`controlEnabled()`); current control base: **`app51Tmrgab3QYP4Z`** (an earlier control base `appV8j6dicv8ILzAx` appears in June-era docs — historical) |
| `AIRTABLE_TEMPLATE_BASE_ID` / `AIRTABLE_WORKSPACE_ID` | Provisioning targets (workspace `wsppysXBoesIgMtpA`; template architecture is now 3-templates-per-vertical via `PLAT_TEMPLATE_REGISTRY` — Core is never cloned directly) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | Auth; fails closed (503) in production if half-set; absent in dev → demo mode |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Live AI / model override |
| `PLATFORM_ENCRYPTION_KEY` | AES-256-GCM secret storage; prod refuses the dev fallback key |
| `PLATFORM_WEBHOOK_SECRET` | Global fallback webhook HMAC secret (per-org secrets in registry `settings.webhookSecret` preferred) |
| `CRON_SECRET` | Bearer for `/api/platform/scheduler` + `/api/platform/ingest-inbox` (timing-safe); **unset ⇒ scheduler + outbox retry/DLQ sweep disabled** |
| `PROJECT_RLS_ENFORCE` → per-org `projectRlsEnforce` | RLS fail-closed switch (per-org registry setting) |
| `UC1_ENABLED`, `ALLOW_DEMO_MODE`, `DATABASE_URL`, `AIRTABLE_BASES` (legacy map), `PLATFORM_ADMIN_EMAILS` | Secondary switches |

## Control-base tables

`PLAT_ORG_REGISTRY` (slug → orgId, baseId, Settings JSON: `webhookSecret`, `projectRlsEnforce`, `generalJobId`, `features` incl. `data_backend_postgres`), `PLAT_TEAM` (Org_Slug, Email, Role — authoritative membership), `PLAT_ASSIGNMENTS` (RLS), `PLAT_TEMPLATE_REGISTRY`, `PLAT_JOB_CATALOG` (per-vertical assessment job categories, AI-drafted at onboarding), `PLAT_REPORT_CATALOG` (custom report templates), `PLAT_CONNECTIONS` (integration channels; `Destination` field for outbound routing is a pending decision), `PLAT_OUTBOX` (outbound event queue with retry/DLQ).

## Per-org feature flags

Org registry `Settings.features` JSON: `project_rls_enforce`, `data_backend_postgres`, `delay_cascade` (off by default), `accounting` (off by default), standalone chat (on by default). No admin UI for `data_backend_postgres` yet — Settings JSON edit only. **The flag moves reads/writes, not data**: switching an org requires running `scripts/migration/airtable-to-pg.mjs` (or reverse) first.

---

# Build Instructions

```bash
npm ci
npm run dev        # http://localhost:3000 — no secrets = demo mode (fixtures, no Clerk/Airtable)
```

- CI gate, locally: `npm run typecheck && npm run lint && npm test` (zero-warning lint; ~213–215 vitest tests; 3 test files hard-require Postgres at `localhost:5432` — red locally without it, green in CI).
- Airtable-mode local dev: Postgres at `localhost:5432` running, `AIRTABLE_MIGRATION=true` in `.env`, `npx prisma migrate deploy`; demo mode makes `isPlatformAdmin()` true so `/app/new` is reachable without Clerk.
- Working conventions (from the migration build, still binding):
  - Address Airtable by **name**, never field/table id (`core.list/get/create/update/remove`).
  - IDs are `RecordId = number | string`; parse with `recordIdParam(...)`, never `Number(id)`.
  - Relations are linked-record arrays; filter children in app code, not by formula on linked ids.
  - Job pickers use `loadJobOptions(ctx)`; reference lists use `loadReferenceOptions`/`loadVendorOptions`.
  - After base schema changes: run `node scripts/airtable-gen-schema.mjs <templateBaseId>`; new tables also go into the `CORE` array there AND `PLATFORM_TABLES` in both `src/lib/airtable/provision.ts` and `scripts/airtable-provision-base.mjs`.
  - Schema changes are **additive-only** (rollback stays code-only); table renames are the exception — sequence behind code that reads both names.
  - Writes go through `recordWriter` — never raw Prisma/Airtable calls (PR checklist item).

---

# Deployment Procedures

- **Pipeline:** push to `master` → GitHub Actions CI (`.github/workflows/ci.yml`: sqlite prisma push → typecheck → zero-warning lint → vitest → production build) → Render auto-deploy per `render.yaml`. Verify the Render dashboard toggle is "Auto-Deploy after CI passes" (unverifiable from repo — known risk DEV-1).
- **Render:** single web service, Singapore, `numInstances: 1` pinned — **do not scale >1** (per-process limiter would blow Airtable's 5 req/s/base cap → sustained 429 outage). Free-plan spin-down causes 30–60 s cold starts; paid plan is a standing go-live condition. `healthCheckPath: /api/health`.
- **Scheduled jobs:** `.github/workflows/scheduler.yml` (hourly heartbeat → `/api/platform/scheduler`, CRON_SECRET bearer; retries then fails loudly); `.github/workflows/backup.yml` (daily Airtable DR export — **requires repo secrets to be set**).
- **Rollback:** Render deploy rollback (previous image, instant). Schema additive-only ⇒ rollbacks are code-only. Bad AI writes are individually visible in EXECUTION_LOG and reversible record-by-record.
- **Onboarding a new org:** `/app/new` (template-registry-driven vertical selection; supply-existing-base-id path supported — how Didi was onboarded). Then follow the Module-1 runbook: `node scripts/airtable-module1-audit-core.mjs <baseId>` (schema parity) → `airtable-sync-learning-rules-schema.mjs` if drift → data load in strict order (phases → room matrix → vendors → reference data → opening budget → operational data) → confirm governance metadata in diagnostics → `airtable-module1-propagation-status.mjs` to track propagation.
- **n8n client onboarding** (once workflows exist): add `email/in` (+`out`) connection rows at `/app/<org>/integrations` → set org webhook secret (script today; rotate-from-UI is an open gap) → duplicate Gmail workflow in n8n (client's OAuth credential, `orgSlug`, `$env.AEQ_SECRET_<ORG>`) → send test email → verify document + proposals + "Last event". ⚠ n8n HTTP node must use **Raw body mode** with the exact signed `rawBody` string — "JSON" mode re-serializes and breaks the HMAC (the #1 failure mode).

---

# Operations Guide

- **Health:** `GET /api/health` (config checks), `?deep=1` adds Airtable reachability (60 s memo); 503 = investigate before anything else.
- **Backup & DR (target RPO 24 h, RTO half a day):** daily `scripts/airtable-export-backup.mjs` (JSON per table + schema.json per base) over every live base + control base + templates via `backup.yml`, plus weekly Airtable-native base snapshots. Restore: create base from template → replay JSON via API. **A restore drill has never been run** (open condition). Attachment binaries are NOT exported (Drive URLs expire).
- **Scheduler:** hourly GitHub Actions curl; silence = workflow disabled or one-sided `CRON_SECRET` rotation. Concurrent-run skips report "Scheduler run already in progress — skipped".
- **Operational scripts:** `scripts/` — schema/extend/seed (`airtable-extend-spec12-lock.mjs`, `airtable-seed-cascade-rules.mjs`, `airtable-retag-vocab.mjs`, `airtable-link-master-data.mjs`), guarded `reset-platform-orgs.mjs` (refuses prod, requires `--yes`), DR export, migration movers (`scripts/migration/airtable-to-pg.mjs` / `pg-to-airtable.mjs` — dry-run by default, `--execute` to write, resumable via `var/migration/*.json` checkpoints, idempotent via the `airtableRecordId` bridge; **not yet validated against a live Postgres**). ⚠ The ~50-script long tail mutates live Airtable schemas with no dry-run rails and shares the production PAT — handle with care.
- **Data movers — v1 exclusions** (printed on every run): CASHFLOWS (legacy PG shape mismatch), HYPOTHESES/CORRECTIONS/INTELLIGENCE_SNAPSHOT (non-recordWriter writers), chat/audit streams, TEAM/control plane.
- **Diagnostics:** `/app/[org]/diagnostics` (admin) — flag state, resolved backend per org, Airtable-vs-Postgres row counts (true full counts — the suspected 1000-row cap was disproven 2026-07-28), backend asymmetry listing; `/app/[org]/schema-drift` — per-base drift vs template with additive migrate action (⚠ mutates a customer base).

# Monitoring

Specced (deployment itself still open — no Sentry/APM/uptime monitor wired yet; DEV-4):

| Signal | Source | Alert |
|---|---|---|
| `/api/health?deep=1` | uptime monitor (60 s) | 2 consecutive 503s |
| p95 latency `/app/*` | Render metrics | > 3 s sustained 10 m |
| 5xx rate | Render logs / Sentry | > 1 % of requests, 5 m |
| Airtable 429 count | structured logs | > 10/min sustained |
| Scheduler runs | absence detection | no run in 2 h |
| Outbox DLQ depth | PLAT_OUTBOX dead | > 0 |
| Anthropic error rate | "Claude … call failed" lines | > 5/min |
| Proposal age | PENDING_WRITES proposed > 5 days | daily digest |
| Backup job | Actions workflow status | any failure |

Sentry wiring is a one-file change at `logger.emit`.

# Support Runbook

Common incidents (full detail in `docs/production-readiness-audit.md`, Operations artifacts):

| Symptom | Cause / action |
|---|---|
| Every `/app` route 503 | Clerk keys missing/half-set on Render (fail-closed by design) — check both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` |
| Airtable 429 storms | Check instance count (must be 1); check for runaway scripts sharing the PAT; retry layer absorbs bursts |
| Webhook events not landing | 403 = connection missing/inactive in control base; 401 = HMAC/clock skew (±300 s) or wrong per-org secret; 413 = payload > 25 MB |
| Scheduler silent | Actions workflow disabled or one-sided CRON_SECRET rotation |
| Stuck proposal `executing` (PG mode) | Process died mid-write — verify whether the write landed, manually set `failed`/`executed` |
| Every `/app` route 404s in dev | Wedged dev server (Next 16 allows one per project) — restart it |
| Suspected data corruption | Stop the scheduler (rotate CRON_SECRET), duplicate the base in Airtable UI *before* investigating, restore from latest export if needed |
| Leaked credentials | Rotate in Render dashboard (all secrets `sync:false`); Airtable PAT rotation is immediate |

Incident forensics: append-only EXECUTION_LOG + audit rows are the source of truth; record a timeline.

# Security Considerations

**Verified positive controls:** fail-closed Clerk proxy; webhook HMAC (timing-safe, replay window, per-org secrets, 25 MB/20-attachment caps, default-deny on inactive connections); timing-safe length-blinded CRON bearer; layered authz (`requireOrgCtx`/`canWrite`/`canApprove`/`requireFinancialAccess`/`requireAdmin`); per-role AI tool allow-lists with always-gated high-risk writes; single gated write chokepoint with Zod + vocab; immutable SHA-256 document snapshots; append-only EXECUTION_LOG; no SSRF; no secrets in git history; global security headers (HSTS, nosniff, SAMEORIGIN, referrer/permissions policies); portal `/portal/[token]` noindexed.

**Secrets policy:** secrets never in Airtable — portal tokens, OAuth tokens (accounting) stay app-side; encrypted storage via AES-256-GCM (`PLATFORM_ENCRYPTION_KEY`, prod refuses dev key). PAT scoping/rotation done 2026-07-26.

**Open security items (from the audits' registers):**
- RLS fail-open until per-org flip (SEC-3/GOV-2) — flip blocked on assignment seeding + sign-off.
- No inbound rate limiting anywhere (SEC-5) — webhook/CRON brute-forceable unthrottled; AI/geo routes unmetered.
- Under `auto_low_risk` policy, low-risk assistant writes execute ungated while untrusted content reaches the model — prompt-injection window (SEC-4).
- Zod validates only the chokepoint; route handlers/server actions still ad-hoc coerce (SEC-7); Airtable write path relies on `typecast:true` (DAT-2).
- Data residency for legal-vertical PII unaddressed (US-hosted Airtable, Singapore compute, no DPA/GDPR docs) (DAT-4).
- Control-base mutations unaudited (DAT-5); no idempotency keys on creates (DAT-3).

# Testing Strategy

- **Unit/integration:** Vitest, ~215 tests, zero-warning typecheck/lint enforced in CI. Strong areas: pricing, correction memory, money math (half-up boundaries, GST identities), roles/policy, ganttLayout, jobRag, isolation, fieldMaps.
- **Known gaps:** `recordWriter` has no direct unit tests (~70 importers, indirect coverage only — R13); 3 suites hard-require Postgres (non-hermetic); the Django-era roof-accuracy eval harness (`evals/roof_eval/`) was never ported — no roof-measurement regression net; Modules 3 (tender comparison) never evidence-tested against real Peak tender / Master Building Contract data.
- **Verification discipline:** every build phase verified with `tsc` + `eslint` + vitest before commit; ops scripts verified idempotent + read-back after live runs.
- **UI acceptance:** the 10-point consistent-window checklist is the per-PR gate; authed-browser eyeball of spec12 L1–L5 surfaces and the group-by feature remains outstanding (needs owner sign-in).

# Known Issues and Limitations

**Platform ceilings (accepted, documented):**
- Single-instance by construction; horizontal scaling requires Redis-backed shared limiter/cache (R14).
- Scalability: fine to ~100 users; 1,000 users needs rate limiting + pagination + worker-scheduler; 10,000 users hits the control base's 5 req/s ceiling (needs Redis or control-plane-on-Postgres); 100,000 not reachable on Airtable as SoR (dual-path recordWriter keeps the Postgres-primary door open — known ceiling, not defect).
- Bus factor = 1 (256/258 commits one author); ops knowledge partly tribal.
- Cascades/reconciliation bypassed by direct Airtable-UI edits.

**Backend-switch accepted debt (2026-07-28):** no repository-port interface (if/else branches remain, now org-aware); control plane Airtable-only at runtime (`PlatCtl*` mirrors schema-only); failure-audit path writes Postgres unconditionally (Postgres is a hard dependency even in Airtable mode); Spec-12 CASHFLOWS ledger needs a PG model decision; per-org backend flag has no admin UI; data movers untested against live Postgres.

**Open functional items:**
- Spec 12 tail: owner activates CASCADE-D/F/G drafts on `/learning-rules`; n8n consumers for `comms.create`/`report.ready`; Part C drift items (tender canonical tables TRADE_PACKAGES/CONTRACTOR_BIDS/BID_LINE_ITEMS unqueried; VENDORS→ORGANISATIONS collapse; DECISIONS fieldMap drops `alternatives`/`madeBy`/`sourceId`); construction/roofing DOMAIN_LABELS seeds; spec v13 lock flip.
- Governance: D1–D9 unsigned → retag apply, TEAM population, MED/REVIEW batches, master-data linking all blocked; RISKS/TEAM/COMMS/CORRECTIONS vocabularies not enumerated.
- RLS activation: sunridge manual assignments, onboarding General-job hook, quotes-as-job-from-lead (phase Q).
- n8n: workflows A (inbound Gmail) and B (outbound outbox) not built; outbound recipient source undecided (recommended: `Destination` field on PLAT_CONNECTIONS); `CRON_SECRET` was still unset on Render as of 2026-07-20; webhook-secret rotate-from-UI missing.
- Reporting: n8n-scheduled generation; Didi test-data cleanup; portfolio/multi-job reports (v2).
- Performance: dashboard + assistant context still fetch-all (~6.6 s for a 3,000-record org; `SERVER_PAGINATE_ABOVE=500` exists only on projects list) (PER-1/2); detail pages' `OR(RECORD_ID()=…)` formulas have a >~500-children URL cliff (PER-4).
- UX backlog: shared Dialog primitive; responsive device-matrix QA; a11y pass (command palette listbox, inline-select labels); AI-authority-modes decision; assistant streaming/cancel; the uc3-ui-ux-audit Medium/Low per-window backlog.
- UC1 parity punch list (from the Django→Next.js migration, never re-verified): measurement-history page, price-check-log page, storm detail, condition-report create/detail/print, PO-create, measurement-snapshot API, auto-guttering.
- `MIGRATION_GAP_ANALYSIS` P1 items possibly still open: UC3-era phase approval workflow, Decision CRUD (partially superseded by platform decisions register — verify).
- JOBS has no `Code` field in Airtable (JOB-### codes not persisted) — open decision.
- Airtable workspace transfer to `wsp0SwxU3j8IwLZJ1` blocked on PAT 403 / Access-list grant.

# Architecture Decision Records

| # | Decision | Date | Status |
|---|---|---|---|
| ADR-1 | **Airtable is the system of record**; Prisma schema is a 1:1 mirror of the Airtable Core/Domain/Config taxonomy; one base per customer (privacy/auditability) | 2026-06-19 | Adopted |
| ADR-2 | Converge UC2+UC3 onto a shared Project Intelligence core with `engagementType` discriminator (UC3 schema as base) | 2026-06 | Implemented |
| ADR-3 | Writes centralized in `recordWriter`; **approve-executes-write** (closed the "confirm is cosmetic" gap inherited from Django) | 2026-06/07 | Implemented |
| ADR-4 | Chat transcripts, portal tokens, OAuth secrets stay app-side — never in Airtable | 2026-06 | Standing |
| ADR-5 | Canonical template = real Master Template, not the demo base; later evolved to **3-templates-per-vertical** (`PLAT_TEMPLATE_REGISTRY`; Core never cloned directly) | 2026-06-26 / Spec 12 | Adopted |
| ADR-6 | Role taxonomy: code roles `owner/builder/architect/broker` + sub-role suffixes are canonical (Spec-12 D-1); framework names are a display layer (D5, unsigned); COMMS Stakeholder_Role is a superset | 2026-07-24 | Adopted |
| ADR-7 | Membership authoritative in control-base `PLAT_TEAM`; Clerk authenticates identity only; Clerk Organizations **not** used (keeps Clerk swappable, registry queryable) (D6 recommendation) | 2026-07-15 | Built, D6 unsigned |
| ADR-8 | Vocabulary enforcement at the write chokepoint: force-to-review, never guess, never auto-create options | 2026-07-15 | Implemented |
| ADR-9 | RLS model = assignment scoping (not per-project roles); fail-open during rollout (deliberate least-privilege exception), per-org enforce flag flips to fail-closed | 2026-07-24 | Implemented, flip pending |
| ADR-10 | Assignments stored centrally in control-base `PLAT_ASSIGNMENTS` (Option B) — supersedes per-base TEAM.JOBS design | 2026-07-24 | Implemented |
| ADR-11 | "Everything belongs to a project": per-org auto-provisioned **General** job replaces null-job org-visible records; General always in scope | 2026-07-24 | Built (onboarding hook pending) |
| ADR-12 | Spec-12 lock decisions D-1..D-13: cascades as LEARNING_RULES records with stable Rule_Codes (D-4); M6 thresholds locked (D-5); session-close prompt skippable (D-6); approvals card + rationale (D-8); coordination inline actions scoped to ISSUES/COMMS status, not via proposal queue (D-10); Portfolio View explicit flag, never auto-activates (D-11); report delivery via n8n on outbound events (D-12); report titles fixed, DOMAIN_LABELS for fields only (D-13); PLAN.Predecessor stays empty for non-Gantt types (D-2); ENGAGEMENT_TYPE_CONFIG seeded from Didi (D-3) | 2026-07-24 | Decided |
| ADR-13 | Reports: deterministic where the report is a register (no AI call); every narrative prompt pinned + versioned; duplicate-supersede on same (job, report, period); promptSpec stored for audit/regeneration | 2026-07-20 | Implemented |
| ADR-14 | Group-by: URL-driven (`?group=`), categorical only, group key = primary sort, row-based pagination, zero extra Airtable reads | 2026-07-23 | Implemented |
| ADR-15 | n8n owns transport + credentials; platform owns event contract + config intent; inbound per-client workflows, outbound one shared workflow | 2026-07 | Adopted |
| ADR-16 | Backend switch: per-org `data_backend_postgres` (pragmatic ctx-threading) instead of a full repository-port rewrite; opt-OUT only; recorded alternative — DR/exit-option needs only Phase B + Airtable→PG mover at ~40 % of cost | 2026-07-28 | Implemented |
| ADR-17 | Render (not spec's Vercel) is an accepted standing decision; model-ID drift tolerated via env override — spec errata, no action | 2026-07-24 | Accepted |
| ADR-18 | XLSX export deviation: Excel-compatible CSV (UTF-8 BOM), not literal .xlsx — no xlsx dependency; revisit on customer demand | 2026-07-25 | Accepted deviation |
| ADR-19 | Auto-apply learning rules only at confidence > 85 AND triggers > 50; two human gates (hypothesis approval, rule promotion) before a rule is active | 2026-06 (UC1) | Standing |
| Pending | Governance D1–D9 (vocabularies, control rules, retag batches, new fields, role display mapping, Clerk orgs, TEAM order, DOMAIN_LABELS ownership, reporting MVP) | — | **Unsigned** — see `docs/governance-phase0-decisions.md` |

# Lessons Learned

Operational gotchas worth their weight — each cost real debugging time:

1. **`migrateBaseToTemplate` copies schema from the live TEMPLATE base, not `schema.generated.ts`** — extend templates first, then live bases, or drift migrations won't carry new columns.
2. **n8n HTTP Request must send the exact signed `rawBody` in Raw mode** — "JSON" body mode re-serializes and invalidates the HMAC (the #1 inbound-webhook failure).
3. **Airtable auto-creates reverse link fields with the wrong name** — the provisioner renames them to the template's name; bases provisioned before that fix 422 on write (re-onboard them).
4. **`typecast:true` silently creates select options** — vocabulary drift; controlled fields go through vocab enforcement.
5. **`Number(id)` NaNs Airtable rec ids** — always `recordIdParam(...)`; `RecordId = number | string`.
6. **Next 16 allows one dev server per project** — a wedged server 404s every `/app` route; restart fixes. Browser-pane initial loads may never reveal streamed content — verify via client-side navs.
7. **Airtable has no clone-base API and delete-base is 403 for PATs** — structure rebuilt in passes; test bases deleted manually.
8. **The `.catch(() => null)` idiom (198 sites) makes outages look like empty dashboards** — check `/api/health?deep=1` before trusting "no data".
9. **Legal vertical scale (~3,000 matters) breaks enumerate-everything UI** — pickers must page/search; uncapped reads cost ~30 sequential rate-limited pages.
10. **Airtable JOBS has no job-code field** — grouping/"by project" features need `loadJobLabelMap` link resolution, not codes.
11. **Auto-deploy is repo-invisible** — Render's "after CI passes" is a dashboard toggle; never assume red CI blocks a deploy.
12. **Demo-mode writes persist as real data** (`status="demo"` exec-log rows) — exclude demo sessions from analytics.
13. **Two audits in two days beat one:** the enterprise audit independently re-verified the self-audit and caught the two "built but not wired" gaps (health-check pointer, backup scheduling).

---

# Appendix

## Source Document Mapping

| Original file | Status at consolidation | Consolidated section(s) |
|---|---|---|
| `docs/PLATFORM_ARCHITECTURE.md` | Partially stale (module model current; gap tables historical) | Solution Overview; Architecture; ADR-2, ADR-19 |
| `docs/UC2_README.md` | Superseded (module retired; banner says historical) | Solution Overview (history); Lessons Learned #12 |
| `docs/UC3_README.md` | Effectively superseded (pre-convergence routes) | Solution Overview (history); Testing; Known Issues (aiAuthority origin) |
| `MEMORY_ARCHITECTURE.md` | Superseded (MEMORY_BACKEND adapter proposal never built) | Architecture (learning loop); Technical Specifications (tier taxonomy); ADR-1, ADR-19 |
| `docs/design-system.md` | **Current — retained as living standard** | Technical Specifications (UI/design system) |
| `docs/airtable-migration-plan.md` | Superseded (all P-items done or superseded) | Build Instructions; Configuration; Lessons Learned #3, #7 |
| `docs/airtable-migration-mapping.md` | Reference-grade analysis; decisions since made | Technical Specifications (data model, constraints, topology caution) |
| `docs/airtable-postgres-free-remaining.md` | Superseded (zero-Postgres goal reached; conventions absorbed) | Build Instructions (working conventions); Configuration |
| `docs/airtable-postgres-switch-audit.md` | **Current — retained as live debt register** | Executive Summary; Configuration; Known Issues (backend debt); ADR-16 |
| `MIGRATION_GAP_ANALYSIS.md` | Stale snapshot (Django→Next.js migration, 2026-06-08) | Known Issues (UC1 punch list); Testing (eval harness gap); ADR-3 |
| `docs/SPEC_GAP_ANALYSIS.md` | Superseded by SPEC10 → Spec 12 | Business Requirements (spec lineage) |
| `docs/SPEC10_GAP_ANALYSIS.md` | Superseded by spec12-lock-plan | Technical Specifications (21-table Core); ADR-5 |
| `docs/spec12-lock-plan.md` | **Current — retained until spec v13 flip** | Architecture (invariants, cascade engine, learning loop, assistant); ADR-12, ADR-17, ADR-18; Known Issues (spec tail) |
| `docs/governance-framework-plan.md` | Partially stale (phases built; P-register partly closed elsewhere) | Technical Specifications (vocab, roles, DOMAIN_LABELS); Security; ADR-7, ADR-8 |
| `docs/governance-phase0-decisions.md` | **Current — retained; all D1–D9 unsigned** | ADR table (Pending row); Known Issues (governance) |
| `docs/project-rls-plan.md` | Implemented design record | Technical Specifications (RLS); ADR-9 |
| `docs/project-rls-activation.md` | **Current — retained until enforcement flipped** | Technical Specifications (RLS); Known Issues; ADR-10 |
| `docs/project-general-bucket-plan.md` | Mostly built (onboarding hook + phase Q open) | Technical Specifications (General bucket); ADR-11 |
| `docs/reporting-revamp-plan.md` | Shipped (all 4 phases, 2026-07-20) | Data Flow (reporting); ADR-13; Known Issues (reporting tail) |
| `docs/group-by-plan.md` | Shipped (phases 1–5, 2026-07-23) | Architecture (list windows); ADR-14 |
| `docs/n8n-automation-plan.md` | **Current — retained; workflows A/B unbuilt** | Integrations; Data Flow; Deployment (n8n onboarding); Lessons Learned #2 |
| `docs/module1-onboarding-runbook.md` | **Current — retained as operational runbook** | Deployment Procedures (onboarding) |
| `docs/production-readiness-audit.md` | **Current for ops artifacts — retained**; findings superseded by enterprise audit | Operations Guide; Monitoring; Support Runbook; Known Issues (scalability) |
| `docs/enterprise-audit-2026-07-26.md` | **Current — retained as live action register** | Executive Summary; Security (open items); Known Issues |
| `docs/uc3-ui-ux-audit.md` | Criticals fixed (verified); Medium/Low backlog remains | Known Issues (UX backlog); Testing (UI acceptance) |
| `README.md` | Current — retained (repo root) | Executive Summary; Build; Deployment |

## Unresolved conflicts flagged during consolidation

1. **Control base ID:** June docs say `appV8j6dicv8ILzAx`; July docs (spec12, RLS activation) say `app51Tmrgab3QYP4Z`. Treated the July value as current; verify `AIRTABLE_CONTROL_BASE_ID` on Render if in doubt.
2. **Master Template ID:** three values appear across time — `appIf959oh38fgKYp` (mapping doc + SPEC10 canonical decision), `appg09Mmwh2Bvjg1k` (flagged incomplete, "do not use"), `appharWaojouHgMeW` (demo base, de-facto template through June). Superseded by the Spec-12 3-template-per-vertical registry (`PLAT_TEMPLATE_REGISTRY`); the raw IDs are historical.
3. **Fail-fast env counts:** "~40 env vars / 25 files" (enterprise) vs "56 process.env reads / 25 files" (production-readiness) — different counting methods, same finding (DEV-5, open).
4. **Null-job record policy:** rls-plan/activation said null-job records are org-visible; general-bucket-plan reverses this (backfill to General). General-bucket policy is current.
5. **MIGRATION_GAP_ANALYSIS P1 items** (UC3 phase approvals, Decision CRUD) were never explicitly re-verified after platform convergence — the platform has a decisions register and approvals flow that likely supersede them, but no document confirms it.
