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

**Net working flow:** onboard a client → its own base is provisioned + registered → create an assessment (draft in Postgres) → accept → job + phases + budget + risks written into the client's Airtable base, linked.

---

## 3. What's PENDING (prioritized)

### P0 — Operational (blocks live testing)
- **Render `AIRTABLE_PAT` is stale → 401.** Update Render's env var to the re-scoped token (the value in local `.env` that authenticates today). Token must have `schema.bases:write` + workspace-creator on `wsppysXBoesIgMtpA`. Confirm `AIRTABLE_WORKSPACE_ID` + `AIRTABLE_TEMPLATE_BASE_ID` are applied.
- **Delete leftover test base(s)** in the Airtable UI (e.g. "Provision Verify (delete me)"). The PAT can't delete bases via API (403).

### P1 — Detail-page read migration (the big remaining bucket)
These pages/services still read Postgres, so they **break on `rec…` ids** in Airtable mode:
- `/app/[org]/projects/[id]` (job detail) — **404s right after assessment acceptance**. Highest-visibility gap.
- `variations/[id]`, `quotes/[id]`, `meeting-minutes/[id]` detail pages.
- AI-generation services read job context from Postgres: variation draft, weekly report, minutes (`src/services/platform/construction/*`).
- **Acceptance criterion:** after accepting an assessment in Airtable mode, the job detail page renders from the Airtable base.

### P2 — Learning engine + config reads (Postgres-bound)
- `learning.ts` (`getActiveRules`, `getMatchingGuidance`, `applyRules`, `getLearningSettings`) reads `prisma.platLearningRule` / `prisma.platCfgSetting` directly — **not** Airtable-aware.
- Config reference reads: `decisions/new`, `budget/new` → `PlatCfgReference`; `learning.ts` → `PlatCfgSetting`.
- **Consequence today:** a new Airtable org's **learning-rules page is empty** (page reads Airtable; engine + onboarding write Postgres). The two stores disagree.
- **Decision needed:** migrate these reads to Airtable (and write onboarding rules/config to the base), or keep them Postgres long-term as "engine state."

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

1. **Unblock + verify** (P0): fix Render `AIRTABLE_PAT`, run one real onboard→assess→accept on Render/local, record exactly what lands in the client base and what errors.
2. **Job detail page** (P1, highest ROI): make `/app/[org]/projects/[id]` read from Airtable so acceptance has a working landing page. Establish the detail-page read pattern, then replicate to `quotes/[id]`, `variations/[id]`, `meeting-minutes/[id]`.
3. **AI-context reads** (P1): point the construction AI services at Airtable job context.
4. **Learning/config reads** (P2): decide Airtable vs Postgres-as-engine-state; if Airtable, migrate `learning.ts` + cfg reads and write onboarding rules/config to the base.
5. **Assessment record** (P3) if full system-of-record is required.
6. **Cleanup decisions** (P4): job code, TEAM/PRICING, per-customer base mapping.

---

## 6. Starter prompt for a new session

> Continue the Airtable migration for aequilibri-next. Read `docs/airtable-migration-plan.md`
> and the memory note `uc2-uc3-airtable-writes` first. Current state: onboarding provisions a
> per-client base and assessment acceptance writes the job-tree to Airtable, but detail pages
> still read Postgres and 404 on `rec…` ids. Start with P1: make `/app/[org]/projects/[id]`
> read from the org's Airtable base, then replicate the pattern to the other detail pages.
> Keep changes behind `AIRTABLE_MIGRATION`; verify with tsc/eslint/vitest before committing.
