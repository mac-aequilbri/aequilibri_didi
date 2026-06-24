# Finish the Postgres → Airtable migration (zero-Postgres prod) — implementation plan

> **For an AI coding agent (GitHub Copilot).** This is a self-contained spec to finish making the
> **platform (UC2/UC3)** run with **no Postgres in production**. The core flow is already
> Postgres-free; this covers the remaining feature pages, the AI assistant + approval queue, and the
> accounting-secrets decision. Read this whole file, then work bucket by bucket. Do **not** change
> behaviour when the flag is off.

---

## 0. Context — what's already done (do not redo)

Everything funnels through two flags:
- `airtableEnabled()` (`src/lib/airtable/config.ts`) = `AIRTABLE_MIGRATION === "true"`.
- `controlEnabled()` (`src/lib/airtable/control.ts`) = `airtableEnabled() && !!AIRTABLE_CONTROL_BASE_ID`.

Already migrated to Airtable (read **and** write) behind these flags:
- All **domain data**: jobs, phases, budget, risks, cashflow, procurement, vendors, quotes(+lines),
  variations, meeting-minutes, weekly-reports, BIM models, room matrix, decisions, actions, documents
  (writes), assessments. Field maps in `src/lib/airtable/fieldMaps.ts`; per-page reads in
  `src/lib/platform/*Source.ts` (each branches `airtableEnabled() ? fromAirtable() : fromPostgres()`).
- **Learning loop**: rules lifecycle, corrections→hypotheses clustering, settings, snapshots.
- **Control plane** (`control.ts`): org registry + team + base resolution + auth, so onboarding,
  `resolveBaseId`, `getOrgCtx`, `getCurrentUser`, the org picker, and the scheduler org-list need no
  Postgres. Onboarding's control path writes the org to the control base and **skips the Postgres txn**.
- **Audit log** → `EXECUTION_LOG`, **snapshot** → `INTELLIGENCE_SNAPSHOT`, **layout nav counts** +
  **dashboard** read the base. `createJobWithCode` skips the Postgres read in Airtable mode.

So the path **login → org picker → dashboard → assess → accept → add domain records → learning** is
already Postgres-free. What remains are the feature pages/services below.

---

## 1. Hard rules — follow these exactly

1. **Flag-gate everything.** When `airtableEnabled()` is false, behaviour and code paths must be
   byte-for-byte unchanged (Postgres). Add an `if (airtableEnabled()) { …Airtable… } else { …existing
   Postgres… }` branch; never delete the Postgres path.
2. **Address Airtable by NAME**, never by id. Reads: `core.list(orgSlug, "TABLE", { maxRecords })`,
   `core.get(orgSlug, "TABLE", recId)`. Writes: `core.create/update/remove` (gated; they assert the
   flag). Import from `@/lib/airtable` (`import { airtableEnabled, core } from "@/lib/airtable"`).
3. **IDs are `RecordId = number | string`** (Postgres int vs Airtable `rec…`). Parse a form/URL id with
   `recordIdParam(formData.get("x"))` from `@/lib/platform/recordWriter` — **never** `Number(id)` (it
   NaNs a `rec…` id). Thread `RecordId` through service signatures and into `<input>`/links as-is.
4. **Reads use a `*Source.ts`** with `fromPostgres`/`fromAirtable` and a uniform `*View` interface; the
   page consumes the view. Copy an existing one as a template — good models:
   `src/lib/platform/jobDetailSource.ts`, `dashboardSource.ts`, `navCountsSource.ts`,
   `quoteDetailSource.ts`.
5. **Relations in Airtable are linked-record arrays.** Filter children by their parent link in app, e.g.
   `rows.filter(r => Array.isArray(r["Job"]) && r["Job"].map(String).includes(jobId))`. There is **no
   formula filtering by linked id**; list + filter in app (fine at these volumes).
6. **Job pickers** must use `loadJobOptions(ctx)` from `src/lib/platform/jobOptionsSource.ts` (returns
   `{ id, label }`; id is `rec…` in Airtable mode). Reference value lists use
   `loadReferenceOptions(ctx, type)` / `loadVendorOptions(ctx)` from `src/lib/platform/configSource.ts`.
7. **Money**: keep authoritative math in `src/lib/platform/money.ts`; Airtable numbers are display copies.
8. **Single-select / linked fields**: the client sends `typecast: true`, so writing a new select value
   auto-creates the option. Linked fields only emit for `rec…` ids (the `LINK` codec).
9. **Don't put secrets in Airtable** (see bucket #3).
10. **Verify before every commit** (section 5). Keep commits small and per-bucket.

---

## 2. Key facts the agent needs

- **Bases**: template = `appharWaojouHgMeW` (clients are clones of it); **control base** =
  `appV8j6dicv8ILzAx`; workspace = `wsppysXBoesIgMtpA`. The template already has the ASSESSMENTS table,
  `CORRECTIONS.Hypothesis`, and `DECISIONS.Job` (scripts already run on it).
- **Env vars** (Render + local `.env`): `AIRTABLE_MIGRATION=true`, `AIRTABLE_PAT` (secret),
  `AIRTABLE_CONTROL_BASE_ID=appV8j6dicv8ILzAx`, `AIRTABLE_TEMPLATE_BASE_ID=appharWaojouHgMeW`,
  `AIRTABLE_WORKSPACE_ID=wsppysXBoesIgMtpA`. `.env` is gitignored — never commit it.
- **Airtable client** is `src/lib/airtable/client.ts` (name-addressed, paginates reads, batches writes
  at 10, rate-limited). Meta-API scripts live in `scripts/airtable-*.mjs` — copy
  `scripts/airtable-add-assessments-table.mjs` as the template for any new table/field.
- **Schema** is `src/lib/airtable/schema.generated.ts` (`CoreTableName` union). After adding a table/field
  to the base, run `node scripts/airtable-gen-schema.mjs appharWaojouHgMeW` to refresh it; if you add a
  brand-new table also add its name to the `CORE` array in `scripts/airtable-gen-schema.mjs` **and** the
  `PLATFORM_TABLES` set in both `src/lib/airtable/provision.ts` and `scripts/airtable-provision-base.mjs`.
- **Verify**: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run src/lib/airtable/fieldMaps.test.ts`.
  (DB-backed tests like `lifecycle.test.ts` need Postgres at `localhost:5432`; skip if it's down.)
- **Git**: work on `master` (Render auto-deploys from it) — or a branch then merge `--no-ff`. End commit
  messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` if matching the existing log.
- **Catch-all**: when done, run `grep -rn "prisma\." src/app/\(platform\) src/services/platform src/lib/platform`
  and confirm **every remaining `prisma.` call is inside an `if (!airtableEnabled())` / `else` branch**
  (or a `*Source` `fromPostgres`). Any unconditional `prisma.` on a reachable platform path is a
  zero-Postgres crash. (UC1 / `src/services/uc1/*`, `src/app/(uc1)/*` are OUT OF SCOPE — leave them.)

---

## 3. BUCKET #1 — feature read pages/services (mechanical; do these first)

For each, add an Airtable branch (or a `*Source.ts`) following the rules above. Group commits sensibly.

### 3a. Job-context service used by assessment (CHECK FIRST — may affect the core flow)
- `src/services/platform/construction/phaseTemplates.ts` — `derivePhaseTemplate` reads prior jobs'
  phases from `prisma.platJob`/`platConPhase` to learn a phase plan. `runConstructionAssessment` calls
  it, so if it throws without Postgres the **assessment breaks**. Add an `airtableEnabled()` branch:
  read PHASES (+ JOBS) from the base and derive the same template, **or** (minimum) guard it to return
  `null` in Airtable mode so assessment falls back to the catalog/AI phase plan. Prefer the real read.

### 3b. Documents
- `src/app/(platform)/app/[org]/documents/new/page.tsx` — job picker → `loadJobOptions(ctx)`.
- `src/app/(platform)/app/[org]/documents/actions.ts` — replaces `prisma.platJob.findFirst` jobCode
  lookup; parse `jobId` via `recordIdParam`; the document write already routes via `writeRecord`
  (`document` map exists). In Airtable mode skip the jobCode lookup (JOBS has no code) — pass the rec id.
- `src/app/(platform)/app/[org]/documents/page.tsx` and `documents/[id]/page.tsx` — list/detail reads.
  Add a `documentsSource.ts` (or extend `domainListSources.ts`) reading `DOCUMENTS` filtered by `Job`.
- `src/services/platform/documents.ts` — branch its reads.

### 3c. BIM models
- `src/app/(platform)/app/[org]/projects/[id]/models/page.tsx` and `models/new/page.tsx` — read the job
  + its BIM models. Add a `bimModelsSource.ts` reading `BIM_MODELS` filtered by `Job`; job via
  `loadJobDetail`/`loadJobOptions`. Writes already route via the `bim_model` map.

### 3d. Project edit
- `src/app/(platform)/app/[org]/projects/[id]/edit/page.tsx` — reads the job to prefill the form. Use
  `loadJobDetail(ctx, id)` (exists) or a small job read; the update already goes via `writeRecord`.

### 3e. Reports detail
- `src/app/(platform)/app/[org]/reports/[id]/page.tsx` and `reports/[id]/print/page.tsx` — add a
  `reportDetailSource.ts` reading `WEEKLY_REPORTS` by rec id (pattern: `quoteDetailSource.ts`). The
  list page already uses `domainListSources.loadWeeklyReports`. Approve/sent actions are already
  RecordId-aware (`reports/actions.ts`).

### 3f. Exec log
- `src/app/(platform)/app/[org]/exec-log/page.tsx` — confirm it uses `execLogSource.ts`; if it reads
  `prisma.platExecutionLog` directly, move that read into `execLogSource.fromAirtable` (read
  `EXECUTION_LOG`: Log_Entry/Action_Type/Tables_Affected/Status/Initiated_By/Date_Time).

### 3g. Project plan / risk escalation / delay cascade
- `src/app/(platform)/app/[org]/project-plan/page.tsx` — derived from phases; read PHASES via the base.
- `src/app/(platform)/app/[org]/risks/escalation/page.tsx` — read RISKS via `risksSource` (extend it).
- `src/app/(platform)/app/[org]/delay-cascade/page.tsx` + `delay-cascade/actions.ts` +
  `src/services/platform/construction/delay.ts` — feature-flag is **off by default** (`delay_cascade`),
  lowest priority; branch its job/phase reads when you get to it.

### 3h. Search
- `src/app/(platform)/app/[org]/search/route.ts` (8 `prisma.*`) — full-text-ish search across jobs/
  actions/decisions/etc. In Airtable mode, `core.list` each relevant table and filter by `q` in app
  (name/title contains, case-insensitive), capped at `take`. Mirror the existing result shape.

### 3i. phaseEvidence service
- `src/services/platform/construction/phaseEvidence.ts` — `emitCorrection` is already Airtable-aware;
  branch any remaining `prisma` reads (it links DOCUMENTS↔PHASES; the `phase_evidence` write map exists).

---

## 4. BUCKET #2 — AI assistant + approval queue (bigger; its own design)

Only needed if the assistant is used in prod. Two coupled parts:

### 4a. Approval queue → Airtable
The propose/confirm queue (`PlatPendingWrite`) is the only `requireApproval: true` consumer
(`src/services/platform/assistant/executor.ts`). To run Postgres-free:
1. Add a `PENDING_WRITES` table to the **template base** + every existing base via a new
   `scripts/airtable-add-pending-writes-table.mjs` (copy `airtable-add-assessments-table.mjs`). Fields:
   `Table_Key` (text, primary), `Op` (singleSelect: create/update/delete), `Record_Id` (text),
   `Payload` (long text JSON), `Actor_Type` (text), `Actor_Name` (text), `Status` (singleSelect:
   proposed/executed/rejected/expired/failed), `Expires_At` (date), `Job_Id` (text), `Resolved_By`
   (text), `Resolved_At` (date), `Error` (long text). Add `PENDING_WRITES` to `gen-schema` CORE list +
   both `PLATFORM_TABLES` sets; regenerate schema.
2. In `src/lib/platform/recordWriter.ts`, branch `writeRecord` (the `requireApproval` block),
   `resolvePending`, `executeProposal`, `rejectProposal` on `airtableEnabled()`: create/read/update the
   `PENDING_WRITES` record (proposalId becomes a `RecordId`). `performWrite` is already Airtable-aware,
   so executing a proposal just re-runs it with the stored payload (strip the `__recId` like the
   existing Airtable propose path does).
3. `src/app/(platform)/app/[org]/approvals/page.tsx` + its actions — add `pendingWritesSource.ts`
   (read `PENDING_WRITES` where `Status = proposed`); actions parse the proposal id via `recordIdParam`.
   `navCountsSource`/`dashboardSource` currently hardcode `pending: 0` in Airtable mode — switch them to
   count `PENDING_WRITES` once the table exists.

### 4b. Assistant context + chat persistence
- `src/services/platform/assistant/chat.ts` (~11 `prisma.*`) and `executor.ts` (~11) read job/org
  context and persist chat sessions/messages. **Decision**: chat sessions/messages are high-volume,
  low-audit — the mapping doc recommends they stay app-side, NOT per-message rows in Airtable (rate
  limits). Options: (i) keep chat transcripts in a non-Airtable store and only route the **writes the
  assistant performs** through `writeRecord` (already Airtable-aware); or (ii) if a small chat table is
  acceptable, add `CHAT_SESSIONS`/`CHAT_MESSAGES` to the base. Recommend (i): make the assistant's
  **context reads** use the existing sources (`loadJobContext`, `getActiveRules`, `learningPromptText`,
  etc.) and leave transcript persistence to a lightweight store (or disable history when control mode is
  on). Confirm with the product owner before building chat tables.

---

## 5. BUCKET #3 — accounting (secrets — needs a decision, do NOT default to Airtable)

`src/services/platform/accounting.ts` + `src/lib/platform/accounting.ts` +
`src/app/(platform)/app/[org]/accounting/page.tsx` use `PlatConAccountingConnection`, which stores an
**OAuth `accessToken`**. The migration mapping doc explicitly says **keep secrets app-side/encrypted —
do NOT put them in Airtable**. So for zero-Postgres you must pick one:
- **(a)** Drop/feature-flag the accounting integration in prod (simplest if unused — `accounting` is off
  by default in `DEFAULT_FEATURES`).
- **(b)** Store the connection in a real secrets store (encrypted env, a managed secrets service, or a
  small dedicated encrypted KV) — **not** an Airtable base.
- **(c)** Keep a tiny Postgres (or other DB) **only** for secrets.
Implement only after the owner chooses. Until then, leave it Postgres-gated and ensure the accounting
page is guarded so it doesn't 500 when the feature flag is off.

---

## 6. One-time operational steps (outside code; the owner runs these)

- For **each already-provisioned client base** (new onboards inherit from the template automatically),
  run with a valid `AIRTABLE_PAT`:
  ```
  node scripts/airtable-add-assessments-table.mjs   <baseId>
  node scripts/airtable-add-hypothesis-link.mjs     <baseId>
  node scripts/airtable-add-decision-job-link.mjs   <baseId>
  # plus, after bucket #2: node scripts/airtable-add-pending-writes-table.mjs <baseId>
  ```
- Ensure Render has all env vars from §2 (especially a **valid** `AIRTABLE_PAT` and
  `AIRTABLE_CONTROL_BASE_ID`).
- Existing test orgs are disposable (owner confirmed) — no Postgres→registry backfill needed; just
  onboard fresh clients, which self-register in the control base.

---

## 7. Definition of done

- `grep -rn "prisma\." src/app/\(platform\) src/services/platform src/lib/platform` shows **no
  unconditional** `prisma.` on a reachable platform path — every one is behind `!airtableEnabled()` /
  a `*Source.fromPostgres` / an explicit Postgres-only feature (accounting per the §5 decision).
- `npx tsc --noEmit` and `npx eslint` clean; `npx vitest run src/lib/airtable/fieldMaps.test.ts` green.
- With `AIRTABLE_MIGRATION=true` + `AIRTABLE_CONTROL_BASE_ID` set and **Postgres stopped**, you can:
  onboard a client, open every nav page without a 500, run an assessment, accept it, add a
  risk/decision/variation/quote/minutes/report, generate a weekly report, and view the learning-rules
  page — all reading/writing only Airtable. Verify via `/app/[org]/diagnostics` (Airtable columns
  populated, Postgres side irrelevant).
