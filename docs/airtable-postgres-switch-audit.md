# Airtable ↔ Postgres Backend-Switch Readiness Audit

> **Question:** Can we switch between Airtable and Postgres (either direction) via a feature flag, and how ready are we for automated data migration?
> **Date:** 2026-07-28 · Method: 4 parallel deep audits (abstraction seam, coupling inventory, schema parity, migration tooling), key claims re-verified by hand.

---

## 1. Verdict

**Readiness: ~55/100 — the switch exists, but it is a one-way, global, schema-only migration lever, not the bidirectional per-org backend selector the architecture intends.**

| Dimension | Score | Summary |
|---|---|---|
| Feature-flag switch | 🟡 6/10 | `AIRTABLE_MIGRATION` env flag exists and works — but it is **process-global** (all orgs at once), branched inline at **179 call sites across 71 files**, with no per-org scoping. |
| Abstraction seam | 🟡 5/10 | Central read layer (`*Source.ts` + `listQuery.ts`) and one write engine (`recordWriter.ts`, 25 tables) exist. But there is **no repository/adapter interface** — just duplicated `fromAirtable()`/`fromPostgres()` branches, and ~11 modules bypass the write engine. |
| Feature parity between backends | 🔴 3/10 | The two backends are **not equivalent**: COMMS/PLAN/CASHFLOWS throw in Postgres mode; control plane (orgs/team/RLS/outbox/catalogs) is Airtable-only; UC1 is Postgres-only; the audit-failure path writes Postgres unconditionally even in Airtable mode. |
| Schema parity | 🟡 6/10 | ~34/41 Core-base tables pair cleanly with Prisma models. But the **entire control base (8 PLAT_* tables) has zero Prisma models**, COMMS/PLAN/ENGAGEMENT_TYPE_CONFIG are missing, and 6 of 7 spec-12 lock columns never landed in Prisma. |
| Automated data migration | 🔴 2/10 | **No data mover exists in either direction.** Strong building blocks exist (exporter, provisioner, reconciliation diff, checkpointing), but no rec↔pk ID bridge, no linked-record load ordering, no attachment handling. |

---

## 2. What actually exists today (verified)

### The flag
- `airtableEnabled()` = `process.env.AIRTABLE_MIGRATION === "true"` (`src/lib/airtable/config.ts:47-49`). Off → Postgres everywhere; on → Airtable for platform data.
- Second flag `AIRTABLE_CONTROL_BASE_ID` → `controlEnabled()` (`src/lib/airtable/control.ts`) gates the Airtable control plane (org registry, team, RLS assignments, outbox, catalogs).
- 179 `airtableEnabled()` call sites across 71 files — every one an inline `if/else`, none receives org context.

### The seams (good bones)
- **Write engine:** `recordWriter.ts` — Zod validation → role/RLS gate → `performWrite()` (Airtable field-maps OR Prisma delegate) → execution log → post-write reconciliation → cascades. Covers 25 domain tables.
- **Read layer:** ~35 `*Source.ts` modules returning backend-neutral view models; shared `listQuery.ts` compiles one `ListQuery` to either an in-memory predicate (Airtable) or a Prisma `where`.
- **Components are 100% backend-agnostic** (0 imports of either backend).
- **Per-org feature-flag substrate exists** (`OrgConfig.features` in org settings JSON, precedent: `project_rls_enforce`) — a per-org `data_backend` flag has a natural home, but nothing consults it for backend choice.

### The leaks (why "switchable" is currently aspirational)
- ~41 app/service files import `lib/airtable/*` directly, outside the source layer (notably `[org]/search/route.ts`, `diagnostics`, `delay-cascade`, assistant/learning/onboarding services).
- ~11 modules write Airtable outside `recordWriter` — genuine choke-point bypasses: `closeJob.ts:118` (JOBS), `construction/assess.ts` (ASSESSMENTS); plus chat/learning/onboarding/cascade/corrections/outbox writing Airtable-only tables.
- **~45 `filterByFormula` sites** (Airtable query DSL, incl. `RECORD_ID()` tricks) baked into control plane, search, assistant, sources.
- **ID-shape leakage:** `RecordId = number | string`; `advisoryId.startsWith("rec")` checks in app actions (silently no-op under Postgres); dual `rec["Job"]` (link array) / `rec["jobId"]` (scalar FK) reads in `rls.ts` and `recordWriter.ts`.
- Airtable field-name string literals (`job["Job_Name"]`, `r["Impact_Cost"]`) hardcoded in each `fromAirtable` branch.

### What lives where (as of today)
| Subsystem | Backend |
|---|---|
| Platform domain data (25 registry tables) | Dual-path; Airtable in prod (flag on), Postgres when off |
| COMMS, PLAN, CASHFLOWS | **Airtable-only** — throws in Postgres mode (`recordWriter.ts:443,444,450` — no delegate) |
| Control plane (org registry, team, RLS assignments, outbox, template/job/report catalogs) | **Airtable-only** (control base); Postgres fallback only for org identity |
| UC1 roofing | **Postgres-only** (direct Prisma, bypasses recordWriter; Airtable path stubbed in `uc1Source.ts`) |
| Execution-log **failure** rows, pending-write claims | **Postgres unconditionally** (`recordWriter.ts:905`) — Postgres is a hard dependency even in Airtable mode |
| Chat, learning, assessments, config tables | Airtable when flag on (several with Prisma mirrors) |

---

## 3. Schema parity (Prisma mirror status)

- **In sync:** 16 Core pairs + 14 construction pairs + 4 config pairs (≈34 tables map cleanly). Tenancy design is sound: every `Plat*` model carries `orgId` + indexes (single shared DB) vs Airtable's base-per-org — different shapes, both coherent.
- **Missing in Prisma:** all 8 control-base tables (`PLAT_ORG_REGISTRY`, `PLAT_TEAM`, `PLAT_ASSIGNMENTS`, `PLAT_TEMPLATE_REGISTRY`, `PLAT_JOB_CATALOG`, `PLAT_CONNECTIONS`, `PLAT_REPORT_CATALOG`, `PLAT_OUTBOX`); `COMMS`; `PLAN`; `ENGAGEMENT_TYPE_CONFIG`; `DOMAIN_LABELS`; `REGIONS`; 6 of 7 spec-12 lock columns (`Scope_Changes_Count`, `Portfolio_View`, `Override_Level`, `Application_Window`, `Source_Module`, `Correction_Direction`).
- **Missing in Airtable (deliberate):** `PlatConPortalToken`, `PlatConAccountingConnection`, `PlatCfgTeamMember`.
- **The hard blocker — no ID bridge:** Prisma = `Int autoincrement` PKs; Airtable = opaque `rec…` ids. The ONLY cross-link in the whole schema is `PlatOrganisation.airtableBaseId`. No `airtableRecordId`/`legacy_pg_id` column exists on any model (proposed in `docs/archive/airtable-migration-mapping.md` §7.1, never implemented). 114 `multipleRecordLinks` fields must collapse to scalar FKs (cardinality unvalidated).
- **Semantic traps:** `BUDGET.Actual` is a read-only Airtable rollup but a *writable* `Decimal` in Prisma; formula fields (`PROCUREMENT.Total_Cost`) and attachments (`DOCUMENTS.File`, expiring URLs) can't migrate as plain data; Airtable original timestamps would be re-stamped by `@default(now())` unless written explicitly.
- Intra-Airtable drift to resolve first: `VARIATIONS` vs `CHANGE_LOG`, `PLAN` vs `PHASES` look like superseded duplicates.

---

## 4. Automated data migration readiness

**Reusable machinery (exists, tested):**
- `scripts/airtable-export-backup.mjs` — full per-base JSON dump (schema + all tables). Manual only (not scheduled anywhere); does NOT download attachment binaries (expiring URLs).
- `src/lib/airtable/provision.ts` — production-grade **schema** provisioning: `provisionClientBase` (3-pass table/field/link build), `migrateBaseToTemplate` (additive, idempotent), `ensureAppRuntimeTables`. The Postgres→Airtable *structural* direction is essentially solved.
- `scripts/migrate-uc1.mjs` — proves the FK-ordered, type-coerced bulk-load pattern (SQLite→PG).
- `scripts/legal-demo/*` — 3000-matter Airtable seeder with **resumable `state.json` checkpoints** and batched writes; the template for any migration driver.
- `src/lib/platform/reconciliation.ts` — field-by-field post-write diff (row-level verification primitive).
- Diagnostics page compares Airtable vs Postgres row counts per entity. (Correction 2026-07-28: the suspected 1000-row cap is not real — `maxRecords ≥ UNCAP_THRESHOLD(100)` means "follow pagination to the end" in `client.ts`, so counts are true full counts.)
- Rate limiting is well understood: ~4.5 req/s/base, writes 10/batch ⇒ ~45 records/s best case; a data-rich org migration is a resumable batch job of tens of minutes to hours. Single-instance pin (`render.yaml`) means no parallelizing across instances.

**Missing (all net-new):**
1. A data mover in either direction (nothing loads rows PG→Airtable or Airtable→PG for platform data).
2. Persisted rec↔pk ID map (gates everything — FK resolution is impossible without it).
3. Topological load ordering for linked records (parents first, capture ids, then children).
4. Attachment fetch-and-restage (backup only stores expiring URLs).
5. Uniqueness enforcement + partial-batch tolerance (Airtable has no unique constraints, no transactions).
6. Per-row verification at scale (batch-mode reconciliation report; full counts already work).

---

## 5. Top 5 structural blockers to the intended architecture

1. **Backend selection is a global env boolean, not an injected, org-scoped decision.** `airtableEnabled()` takes no context; per-org switching requires threading `ctx` through 179 call sites or collapsing them behind a real port interface.
2. **Neither backend is a complete system of record.** Control plane + COMMS/PLAN/CASHFLOWS = Airtable-only; UC1 + audit-failure path + pending-write claims = Postgres-only. Flipping the flag in either direction breaks features today.
3. **No ID bridge.** `rec…` ↔ int-PK correspondence is stored nowhere; ID-shape checks (`startsWith("rec")`) already leak into app logic and silently no-op on the wrong backend.
4. **Hand-written per-table, per-direction mapping with no shared contract.** `fromAirtable`/`fromPostgres` duplicated per source; write REGISTRY (Prisma) vs fieldMaps (Airtable) maintained separately; Prisma mirror has already drifted (spec-12 columns, control base).
5. **Airtable-only semantics in business logic.** ~45 `filterByFormula` sites, rollup dependencies (`BUDGET.Actual`), typecast select auto-creation, name-based table addressing.

---

## 6. Recommended path (if the switchable architecture is a real goal)

**Phase A — honesty fixes (days): ✅ DONE 2026-07-28.** Flag documented as a one-way global migration lever (`config.ts` doc comment); boot-time asymmetry guard added (`src/instrumentation.ts` — warns on COMMS/PLAN/CASHFLOWS unavailability when off, missing PAT/control-base/DATABASE_URL when on); diagnostics page now lists both asymmetry directions. (The suspected diagnostics 1000-row count cap turned out not to exist — see §4.)

**Phase B — ID bridge + mirror repair: ✅ DONE 2026-07-28 (schema layer).** `airtableRecordId String? @unique` added to all 37 platform models; 11 new models added (`PlatComms`, `PlatConPlanTask`, `PlatEngagementTypeConfig`, and the 8 control-base mirrors `PlatCtl*` — exempted from the db.ts org-isolation guard since they key on orgSlug); 5 spec-12 columns added (`PlatJob.scopeChangesCount`, `PlatLearningRule.overrideLevel/applicationWindow`, `PlatCorrection.sourceModule/correctionDirection`; `Portfolio_View` landed on the new `PlatEngagementTypeConfig`). Drift resolved by decision, documented in the schema: CHANGE_LOG is canonical (VARIATIONS superseded, not modelled); PLAN is a real table (now `PlatConPlanTask`); DOMAIN_LABELS/REGIONS deliberately unmodelled. Migration SQL at `prisma/migrations/20260728000000_phase_b_airtable_bridge/` (generated by datamodel diff from git HEAD — verify with `prisma migrate deploy` when a Postgres target is live). Note: `recordWriter`'s comms/plan/cashflow entries still have no Prisma delegates — wiring them is Phase D work; Phase B only makes it possible.

**Phase C — data movers: ✅ BUILT 2026-07-28 (v1, awaiting live-DB validation).** `scripts/migration/`: `_shared.mjs` (paced/retried Airtable REST, 10-record batches, state.json checkpoints), `_map.mjs` (23 tables in topological order, hand-derived from fieldMaps.ts + schema.prisma, status-vocab maps auto-reversed, self-link second pass for PLAN.Predecessor), `airtable-to-pg.mjs` and `pg-to-airtable.mjs` (both dry-run by default, `--execute` to write, idempotent via the Phase B `airtableRecordId` bridge, resumable via `var/migration/*.json`, per-table verification counts). Map validated against schema.generated.ts: 23/23 tables, all fields (QUOTES.Assessment is newer than the snapshot — regenerate it). Explicit v1 exclusions, printed on every run: CASHFLOWS (legacy PG shape mismatch), HYPOTHESES/CORRECTIONS/INTELLIGENCE_SNAPSHOT (non-recordWriter writers), chat/audit streams, TEAM/control-plane. Attachments remain Drive-URL refs (no binary restage). **Not yet run against a live Postgres** (none reachable locally) — first execute run should be dry-run against Didi, whose base has known schema drift (run `migrateBaseToTemplate` first for PG→Air).

**Phase D — per-org seam: ✅ DONE 2026-07-28 (pragmatic form).** Instead of a full repository-port rewrite, the backend decision itself became org-aware at every existing branch point: `airtableEnabled(ctx?)` now honours the per-org feature `data_backend_postgres` (org registry Settings JSON → `{"features":{"data_backend_postgres":true}}`), falling back to the global `AIRTABLE_MIGRATION` env. 63 files (~150 call sites — all org-scoped read sources, recordWriter, cascades, services, app pages/actions) now pass `ctx`; 28 sites are deliberately global (health, org-context bootstrap, schema-drift, UC1, onboarding provisioning — none serve per-org domain data). The override is opt-OUT only (Postgres while global Airtable is on); forcing Airtable per-org while the global flag is off is unsupported. Also closed: comms/plan write asymmetry (Prisma delegates wired to the Phase B `PlatComms`/`PlatConPlanTask` mirrors — only CASHFLOWS still throws in Postgres mode) and the diagnostics page now shows the org's resolved backend. Verified: tsc clean, 215 tests pass (3 pre-existing DB-dependent file failures unchanged), boot guard healthy.

**Still open after Phase D (accepted debt):** no repository-port interface (the `if/else` branches remain, now org-aware); control plane stays Airtable-only at runtime (the `PlatCtl*` mirrors are schema-only); the failure-audit path still writes Postgres unconditionally; the Spec-12 CASHFLOWS ledger needs a PG model decision; the per-org flag has no admin UI (Settings JSON edit). Switching an org requires running `scripts/migration/airtable-to-pg.mjs` first — the flag moves reads/writes, not data.

**Pragmatic alternative:** if the actual business goal is *disaster recovery / exit-option from Airtable* rather than live per-org switching, Phases B + the Airtable→PG half of C deliver that at ~40% of the cost, and Phase D can be skipped.
