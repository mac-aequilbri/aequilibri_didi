# Airtable Migration — Status & Plan (handoff)

> **Purpose:** hand-off doc for continuing the Postgres → Airtable migration in a
> fresh session. Written 2026-06-22. Branch: `airtable-migration` (merged to
> `master` at `a0a2cdd`). Decision context: **Airtable is the system of record**;
> Postgres/Prisma is being migrated out. The whole Airtable layer is inert unless
> `AIRTABLE_MIGRATION=true`.

---

## 1. How the system is wired (read this first)

**The flag.** Everything routes through `airtableEnabled()` (`src/lib/airtable/config.ts`) = `process.env.AIRTABLE_MIGRATION === "true"`. Off → pure Postgres/Prisma. On → the branches below activate.

**Per-customer bases.** Each org is its own Airtable base ("bases are clones"). An org resolves to its base via `resolveBaseId(orgSlug)` (async): **`PlatOrganisation.airtableBaseId` column → `AIRTABLE_BASES` env map → demo base (dev) → throw (prod)**.

**The hybrid (current, deliberate).** The migration is partial, so data is written where it is *read*:
- **Postgres keeps:** org identity (`PlatOrganisation`, needed for auth + `resolveBaseId`), team (`PlatCfgTeamMember`), config (`PlatCfgReference`/`PlatCfgSetting`), **learning rules** (the engine in `learning.ts` reads Postgres directly), audit log, pending-write queue, and the transient **assessment draft**.
- **Airtable gets:** the per-client base + all *already-migrated* domain records written through `recordWriter` (decisions, action hub, risks, budget, cashflow, phases, procurement, vendors, quotes, variations, domain lists, etc.).

**Writes** funnel through `src/lib/platform/recordWriter.ts` → `performWrite`, which routes to Airtable when the table has a map in `src/lib/airtable/fieldMaps.ts`. `RecordId = number | string` (Postgres int vs Airtable `rec…`).

**Reads** use per-page `*Source.ts` files (`src/lib/platform/*Source.ts`) that branch `airtableEnabled() ? fromAirtable() : fromPostgres()`.

---

## 2. What's DONE

| Area | Status | Where |
|---|---|---|
| Core data-access layer, schema-driven | ✅ | `src/lib/airtable/{client,generic,codecs,config}.ts`, `schema.generated.ts` |
| Field maps for writable tables | ✅ | `src/lib/airtable/fieldMaps.ts` |
| Reads for most platform pages (list + many) | ✅ | `src/lib/platform/*Source.ts` |
| **A1** base provisioner (clone template structure) | ✅ | `scripts/airtable-provision-base.mjs` (ops) + `src/lib/airtable/provision.ts` (importable). Verified: 30 tables, 26 links, 0 computed. Commit `7b9303d` |
| **A2/A3** per-org base resolution | ✅ | `PlatOrganisation.airtableBaseId` (migration `20260622000000_org_airtable_base_id`); `resolveBaseId()` async. Commit `8b9b5ac` |
| **B** onboarding provisions the client base | ✅ | `src/services/platform/onboarding.ts` calls `provisionClientBase()` before the txn, stores `airtableBaseId`, fails onboarding on error. Commit `47bf278` |
| **C** assessment acceptance → Airtable job-tree | ✅ | `Job` link spec added to phase/budget_line/risk/cashflow/procurement maps; `createJobWithCode` returns `RecordId`; `acceptAssessment` uses numeric `pgJobId` for Postgres-bound writes. Commit `1eb000a` |
| **Base-aware data layer** | ✅ | Tables/fields addressed by **name** (clone-stable), not per-base ids — so reads AND writes work against any provisioned base, not just the demo. `client.ts`/`generic.ts`/`codecs.ts`/`types.ts`. Commit `cf93830`. |
| **Provisioner reverse-link naming** | ✅ | Auto-created reverse link fields are renamed to the template's name (else PHASES had `JOBS` not `Job` → 422 on accept). `provision.ts` + ops script. Commit `cda497b`. |
| **🎉 onboard → assess → accept VERIFIED on Render** | ✅ | A new client provisions its own base and the full assessment-acceptance flow writes the job-tree into it. (Bases provisioned *before* the reverse-link fix — e.g. orgId 8 — stay broken; re-onboard.) |
| **P1 (started)** job detail reads Airtable | ✅ | `src/lib/platform/jobDetailSource.ts` (`loadJobDetail`: Postgres for numeric id, Airtable for `rec…` id) + `/app/[org]/projects/[id]` wired to it. **Fixes the post-acceptance 404.** Commit `5f07dc9`. This is the pattern for the rest of P1. |

**Net working flow:** onboard a client → its own base is provisioned + registered → create an assessment (draft in Postgres) → accept → job + phases + budget + risks written into the client's Airtable base, linked.

---

## 3. What's PENDING (prioritized)

### P0 — Operational (blocks live testing)
- **Render `AIRTABLE_PAT` is stale → 401.** Update Render's env var to the re-scoped token (the value in local `.env` that authenticates today). Token must have `schema.bases:write` + workspace-creator on `wsppysXBoesIgMtpA`. Confirm `AIRTABLE_WORKSPACE_ID` + `AIRTABLE_TEMPLATE_BASE_ID` are applied.
- **Delete leftover test base(s)** in the Airtable UI (e.g. "Provision Verify (delete me)"). The PAT can't delete bases via API (403).

### P1 — Detail-page read migration (in progress)
NOTE: this is a *separate* issue from the (now-fixed) base-aware layer. These pages read **Postgres directly** (they don't use the Airtable `*Source` path), so they **break on `rec…` ids** in Airtable mode.
- ✅ **`/app/[org]/projects/[id]` (job detail) — DONE** (`jobDetailSource.ts`, commit `5f07dc9`). The post-acceptance landing page now renders from the org's Airtable base. **This establishes the pattern** for the rest: a `*DetailSource.ts` with `fromPostgres`/`fromAirtable` behind `airtableEnabled()`, a uniform `*View` interface, related rows filtered by their `Job` link, and the page consuming the view.
- ✅ **`variations/[id]` — DONE** (`variationDetailSource.ts`, commit `b7026f2`); the variations service is RecordId-aware (`approveVariation`/`rejectVariation`).
- ✅ **`quotes/[id]` (+ printable view) — DONE** (`quoteDetailSource.ts`, commit `014c6db`). Lines read from `QUOTE_LINES` filtered by their `Quote` link; the quotes service was already RecordId-aware. Detail-page actions parse the posted id via `recordIdParam`.
- ✅ **`meeting-minutes/[id]` — DONE** (`minutesDetailSource.ts`, commit `014c6db`). `confirmMeetingMinutes` is now RecordId-aware (reads the minutes record from Airtable, creates Action Hub rows, stamps confirmed). Confirm action uses `recordIdParam`.
- ✅ **AI-generation services + job-picker dependency — DONE** (commits `f5dee4f`, `a907046`). Shared `loadJobOptions(ctx)` ([jobOptionsSource.ts](../src/lib/platform/jobOptionsSource.ts)) backs every job `<select>` (id is `rec…` in Airtable mode); shared `loadJobContext(ctx, jobId)` ([jobContextSource.ts](../src/lib/platform/jobContextSource.ts)) backs `aiDraftVariation`, `generateWeeklyReport`, `generateQuoteFromBudget` (job-id params widened to `RecordId`). The create/generate actions parse `jobId` via `recordIdParam`; `formToObject` create actions were already pass-through. Added a `Job` LINK spec to the quote/variation_order/meeting_minutes/weekly_report maps so those records actually link to their job (fixes quote→job-name resolution, job-detail variation counts, AI variation context). Migrated pickers: `{actions,budget,cashflow,decisions,meeting-minutes,procurement,quotes,risks,variations}/new` + the `reports` generate dropdown.
- **Acceptance criterion (met):** an Airtable-only org can pick a job, create domain records against it, and run AI generation; all four detail pages render from the Airtable base.
- ⬜ **Remaining for full Airtable-only (smaller tail):** (a) pure-display reads still on Postgres — dashboard `page.tsx` recent-jobs widget, `search/route.ts`, `delay-cascade` (feature-flag off by default), `portal` (intentionally Postgres — `portal_token` has no field map, secrets stay app-side); (b) ~~Customer Config reads~~ ✅ **done in P2**; (c) the `reports/[id]` detail page (if one exists) reads Postgres like the other detail pages did. None of these block create/generate against an Airtable job.

### P2 — Learning engine + config reads — ✅ DONE (full migration, 2026-06-23; commits `922e3e7`, `f1424e8`)
Decision taken: **full migration to Airtable** (to the extent the canonical schema allows).
- **Customer Config tier → Airtable** (`922e3e7`): [configSource.ts](../src/lib/platform/configSource.ts) `loadReferenceOptions`/`loadVendorOptions` read `PLAT_CFG_REFERENCE`/`VENDORS` (Postgres fallback when the base isn't seeded); `getLearningSettings` reads `PLAT_CFG_SETTING`; onboarding mirrors categories + settings into the base; the decisions/budget category dropdowns + procurement vendor dropdown route through configSource.
- **Learning-rule lifecycle → Airtable** (`f1424e8`): the `learning_rule` field map is reconciled with the canonical `LEARNING_RULES` schema (Instance/Rule_Type/Rule_Status/Applies_To/Trigger_Context/Operational_Directive=adjustment/Times_Triggered; `typecast:true` creates the select options). `getActiveRules` returns a backend-neutral `RuleRow` and reads Airtable; `applyRules` bumps counters via `core.update`; `nextRuleCode`/`createRuleWithCode` are ctx-based + Airtable-aware; `promoteHypothesisToRule` writes the promoted rule to the base; the executor's `AUTO` rule code is allocated in the recordWriter Airtable branch; onboarding seeds guidance rules into the base; `learningSource` reads rules from Airtable (reconciled — old ASSUMPTIONs are now exact).
- **Corrections→hypotheses loop → Airtable — ✅ DONE** (`8a4d027`). The blocker was a missing `CORRECTIONS`→`HYPOTHESES` link; [scripts/airtable-add-hypothesis-link.mjs](../scripts/airtable-add-hypothesis-link.mjs) adds a `Hypothesis` multipleRecordLinks field (reverse renamed `Corrections`) via the meta API. With it: `emitCorrection` writes `CORRECTIONS` (app-only columns in `Notes` JSON), `runHypothesisEngine` has an Airtable port (clusters → finds/creates/updates `HYPOTHESES` with app fields encoded in `Evidence` JSON → sets the correction `Hypothesis` link), `setHypothesisStatus`/`promoteHypothesisToRule` read+write the base, `snapshotIntelligence` + `learningSource` read the loop from the active backend (snapshot *history* stays Postgres — a local metric log). The Postgres path is byte-for-byte unchanged behind the flag.
- **⚠️ REQUIRED base-schema scripts (run on the template base + every already-provisioned client base; needs a valid PAT):**
  - `node scripts/airtable-add-hypothesis-link.mjs <baseId>` — the CORRECTIONS→HYPOTHESES link the loop needs.
  - `node scripts/airtable-add-decision-job-link.mjs <baseId>` — a DECISIONS→JOBS link so decisions attach to their project (the canonical schema links decisions to WORKSTREAMS/ACTION_HUB only).
- **Diagnostics:** `/app/[org]/diagnostics` (admin-only) shows the flag, the resolved base id, and Airtable-vs-Postgres row counts per table — the quickest way to confirm an org's data actually lives in Airtable.
- **Not yet live-verified (whole P2):** the local `AIRTABLE_PAT` is stale, so all of P2 was checked only via tsc/eslint/fieldMaps-test. Verify on Render: onboard an Airtable org → confirm categories/settings/seed-rules land + the learning-rules page renders them; record a correction (approve-with-edits), run the hypothesis engine, promote a hypothesis → confirm the rule appears.

### P3 — Assessment record itself (deferred "C-full")
- The transient **assessment draft stays in Postgres**; there is **no `ASSESSMENTS` table** in the template base.
- If full system-of-record is wanted: add `ASSESSMENTS` table to the template base (via meta API create-table) → add to `PLATFORM_TABLES` in both provisioners → regenerate `schema.generated.ts` → add a field map → route `runConstructionAssessment` / `getAssessment` / refine / accept and thread `assessmentId` as `RecordId`.

### P4 — Smaller / decisions
- **JOBS has no code field** in Airtable → `JOB-###` codes aren't persisted (jobs keyed by rec id). Add a `Code` field + map, or drop the concept in Airtable.
- **TEAM / PRICING tables** exist in the template but are **excluded** from client bases (team kept Postgres-side). Decide whether client bases should carry them (Core tables link to them — those links are skipped today).
- **render.yaml maps all 3 demo orgs to the SAME demo base** (`AIRTABLE_BASES`). Fine for demo; real customers each need their own base (provisioned via onboarding now).
- **Verify the remaining migrated writes end-to-end** with the flag on (many field maps exist but were never exercised through the UI).

---

## 4. Facts a new session needs

- **Token / identity:** PAT account `mac.antonio@reedelsevier.com` (user `usrFW1GXgcUuShnOU`). It is a **workspace creator** on `wsppysXBoesIgMtpA` (base creation works). PAT is read from `.env` / env (never hard-coded).
- **Key base ids:** demo/template `appharWaojouHgMeW` (full 30 tables — the fieldMaps are aligned to it); Master Template `appg09Mmwh2Bvjg1k` (only 12 Core tables — incomplete, do NOT use as template); workspace `wsppysXBoesIgMtpA`.
- **Env vars:** `AIRTABLE_MIGRATION`, `AIRTABLE_PAT` (secret), `AIRTABLE_BASES` (JSON orgSlug→baseId, legacy/fallback), `AIRTABLE_WORKSPACE_ID`, `AIRTABLE_TEMPLATE_BASE_ID`.
- **Provisioner reproducibility:** template clones cleanly — 30 tables, 252 simple + 63 link fields, **0 computed** (nothing needs manual fixup). TEAM/PRICING links are intentionally skipped.
- **Gotchas:** Airtable has **no transactions** (multi-writes can half-complete — use the propose/confirm queue + idempotency); **no clone-base API** (we rebuild structure in 2 passes); **delete-base is 403** for this token (manual UI delete); creating a link field auto-creates the reverse (deduped via `inverseLinkFieldId`); write batches cap at 10 records; rate-limited (`rateLimiter.ts`).
- **Repo gotchas:** git commits land under auto-detected identity `Antonio <antonim3@legal.regn.net>` (set `git config user.*` if wrong); LF→CRLF warnings are benign. Render deploys auto from GitHub; `render.yaml` doesn't pin a branch (master + airtable-migration are both current at the merge).
- **Local dev:** Postgres at `localhost:5432` (must be running). `AIRTABLE_MIGRATION=true` already in local `.env`. Apply migrations with `npx prisma migrate deploy`; demo mode makes `isPlatformAdmin()` true so `/app/new` is reachable without Clerk.
- **Verify commands:** `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run src/lib/airtable/fieldMaps.test.ts`, `npx prisma validate`. Provisioner dry-run: `node scripts/airtable-provision-base.mjs --name "X"` (no writes).

---

## 5. Suggested order of attack (next session)

1. ✅ **DONE — base-aware data layer** (was the critical blocker; commit `cf93830`).
2. ✅ **DONE — job detail page** reads Airtable (`jobDetailSource.ts`, commit `5f07dc9`) — the post-accept landing page works.
3. **Verify on Render** (P0b): re-run onboard→assess→accept now that the base-aware fix + job detail are deployed; record what lands and what errors. (Local PAT is stale — refresh local `.env` if verifying locally.)
4. ✅ **DONE — remaining P1 detail pages**: `variations/[id]` (`b7026f2`), `quotes/[id]` + print and `meeting-minutes/[id]` (`014c6db`). All follow the `jobDetailSource.ts` pattern.
5. ✅ **DONE — AI-context reads + job-picker migration** (`f5dee4f`, `a907046`): shared `loadJobOptions`/`loadJobContext`; pickers + AI services routed through them; Job links added to quote/variation/minutes/report maps. **P1 is complete.**
6. ✅ **DONE — Learning/config reads** (P2, `922e3e7`+`f1424e8`+`8a4d027`): full migration — config tier, learning-rule lifecycle, AND the corrections→hypotheses loop on Airtable (the last needs `airtable-add-hypothesis-link.mjs` run on the template + existing bases). Onboarding mirrors config + seed rules. All of P2 is unverified pending a live PAT.
7. **Assessment record** (P3) if full system-of-record is required.
8. **Cleanup decisions** (P4): job code, TEAM/PRICING, per-customer base mapping.

---

## 6. Starter prompt for a new session

> Continue the Airtable migration for aequilibri-next. Read `docs/airtable-migration-plan.md`
> and the memory note `uc2-uc3-airtable-writes` first. Current state: the data layer is
> base-aware (names, not ids), onboarding provisions a per-client base, assessment acceptance
> writes the job-tree to Airtable, and the job detail page (`/app/[org]/projects/[id]`) reads
> from Airtable via `src/lib/platform/jobDetailSource.ts`. Next P1: replicate that exact
> source pattern to the remaining detail pages — `quotes/[id]`, `variations/[id]`,
> `meeting-minutes/[id]` — then point the construction AI-context services at Airtable.
> Keep changes behind `AIRTABLE_MIGRATION`; verify with tsc/eslint/vitest before committing.
