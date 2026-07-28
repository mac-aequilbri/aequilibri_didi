# Project-level RBAC (assignment scoping / RLS) — design

**Status:** design · **Date:** 2026-07-24 · **Model chosen:** Assignment scoping (RLS)

A user keeps **one org-wide role** (`owner` / `builder` / `architect` / `broker`, plus
`+finance`/`+auditor`/`+business_owner`/`+delivery` sub-roles). What they can **do** stays
global (unchanged — governed by `roles.ts` `WRITE_MATRIX`/`canWrite`/`canApprove`). What
they can **see and touch** becomes per-project: a non-exempt user only sees the projects
(**jobs**) they're assigned to. This is governance framework §3/§7 ("RLS via TEAM→JOBS").

> Terminology: **project = job**. The entity is `PlatJob` (Postgres) / `JOBS` (Airtable);
> the UI word "project" maps to a job record. There is no separate `Project` model.

---

## 1. What already exists (foundation — do not rebuild)

The RLS scaffolding is in place; only the **rollout across seams** is missing.

| Piece | File | State |
|---|---|---|
| Role bypass — Administrator/Auditor/Business Owner see all | `src/lib/platform/roles.ts:108` `rlsExempt()` | ✅ done + unit-tested (`roles.test.ts:78`) |
| Assignment resolver — email → assigned JOBS record ids | `src/lib/platform/rls.ts:21` `assignedJobRecIds()` | ✅ done (Airtable only; tolerant/fail-open) |
| Projects list window is scoped | `src/lib/platform/jobsListSource.ts:219` `loadJobsList(ctx, viewer)` | ✅ done |
| Data shape: per-base `TEAM` table carries `Email` + `JOBS` links | Airtable customer base | ⚠️ table exists; **unpopulated (D7)** |
| `JOBS.Assigned_To` linked field | `src/lib/airtable/schema.generated.ts:155` | ⚠️ present but **not mapped in `fieldMaps.ts`** (can't be written from app) |

**Critical fact:** `assignedJobRecIds` and `rlsExempt` are consumed in **exactly one place**
— `loadJobsList`. Every other surface is currently **unscoped**. That is the gap.

---

## 2. The gap — surfaces that are NOT yet scoped

1. **~11 other list windows** — actions, decisions, risks, procurement, documents, comms,
   variations, phases, cashflow, budget, meeting-minutes, room-matrix, coordination. Each
   `*Source.ts` already resolves each row's Job link (via `loadJobLabelMap`, from the
   group-by work) but does **not** filter by assignment.
2. **Job detail / context** — `jobDetailSource.ts`, `jobContextSource.ts`: a user can open a
   job they're not assigned to by hitting its URL directly.
3. **Dashboard & assistant** — both call `loadJobsList(ctx)` with **no viewer**
   (`dashboardSource.ts:60`, `assistant/page.tsx:22`) → aggregates span all jobs.
4. **Write path** — `recordWriter.writeRecord` human gate (`recordWriter.ts:708-714`) checks
   `canWrite` (role) but not "is the viewer assigned to this record's job".
5. **Approvals** — `approvals/page.tsx` lists all pending writes; `PlatPendingWrite` carries
   `jobId` but isn't filtered by assignment.
6. **AI query path** — `assistant/tools.ts` `roleCanQueryTable` gates by table, not by job;
   the assistant can read cross-project rows.
7. **Postgres mode** — `assignedJobRecIds` is Airtable-only (returns `null`), so Postgres
   orgs are entirely unscoped. Needs a join table.

---

## 3. Design

### 3.1 Generalize the resolver into a `JobScope`

Replace the single-purpose `assignedJobRecIds` with one scope object every seam consumes.

```ts
// src/lib/platform/rls.ts
export type JobScope =
  | { mode: "all" }                          // exempt role, or unresolved + not enforcing
  | { mode: "some"; jobIds: ReadonlySet<string> }
  | { mode: "none" };                        // explicitly zero assignments (only when enforcing)

export async function resolveJobScope(
  ctx: OrgCtx,
  viewer: { email: string; role: string },
): Promise<JobScope>;
```

Rules:
- `rlsExempt(viewer.role)` → `{ mode: "all" }` (owner / +auditor / +business_owner).
- Otherwise resolve assignments (Airtable `TEAM.JOBS` by email, or Postgres join table).
- **Unresolvable** (table missing, no row, no links, table read error): governed by the
  rollout flag — fail-**open** (`all`) during rollout, fail-**closed** (`none`) once enforcing.
- `jobIds` are backend-native ids: `rec…` in Airtable mode, numeric PK strings in Postgres —
  matching what each list source emits as `job`/`id`.

Cache per request (dedupe the `TEAM` scan) using the existing TTL cache layer — the resolver
must not re-read `TEAM` once per list window.

### 3.2 Job-scoped-table registry

Not every record has a job. Add, next to `WRITE_MATRIX`:

```ts
// src/lib/platform/roles.ts (or a new scope.ts)
const JOB_SCOPED = new Set([
  "action","risk","decision","procurement","document","variation_order",
  "budget_line","cashflow","phase","quote","meeting_minute", /* … */
]);
```

- Records in job-scoped tables → filtered by `JobScope`.
- Org-global records (org settings, contacts, team, learning rules) → visible to any member;
  never RLS-filtered.
- A job-scoped record with **no** job link → treat as org-visible (don't hide orphans).

### 3.3 Enforcement seams (apply the same scope everywhere)

| Seam | Where | Change |
|---|---|---|
| **List reads** | each `*Source.ts`, ideally via the shared `listQuery` layer | after building rows, `scopeRows(rows, r => r.jobId, scope)`; `all`→passthrough, `some`→filter, `none`→empty |
| **Job detail** | `jobDetailSource` / `jobContextSource` / `projects/[id]` | if scope ≠ `all` and `jobId ∉ scope.jobIds` → `notFound()` |
| **Dashboard / assistant** | `dashboardSource.ts:60`, `assistant/page.tsx:22` | pass `viewer` into `loadJobsList`; scope downstream aggregates |
| **Writes** | `recordWriter.ts:708-714` (human gate) | resolve the target job (payload for `create`; existing record's `jobId` for `update`/`delete`); assert `jobId ∈ scope` unless `all`; throw on denial |
| **Approvals** | `approvals/page.tsx` + `approvals/actions.ts` | filter `PlatPendingWrite`/`PENDING_WRITES` by `jobId ∈ scope`; re-check in the resolve action |
| **AI query** | `assistant/tools.ts` `roleCanQueryTable`/query builder | inject scope into the Airtable/Prisma filter so the assistant reads only assigned jobs |

Single shared helper so every seam behaves identically:

```ts
export function scopeRows<T>(rows: T[], jobIdOf: (r: T) => string | undefined, s: JobScope): T[] {
  if (s.mode === "all") return rows;
  if (s.mode === "none") return rows.filter(r => jobIdOf(r) === undefined); // org-global only
  return rows.filter(r => { const j = jobIdOf(r); return j === undefined || s.jobIds.has(j); });
}
```

### 3.4 Backend parity

- **Airtable** — assignment lives in the **customer base** `TEAM` table (`Email` + `JOBS`
  multi-link). It cannot live in the control-base `PLAT_TEAM` (Airtable links don't cross
  bases); identity join is by **email**, as `rls.ts` already does.
- **Postgres** — add a join model:

```prisma
model PlatJobAssignment {
  id      Int    @id @default(autoincrement())
  orgId   Int    @map("org_id")
  jobId   Int    @map("job_id")
  email   String @db.VarChar(254)          // joins to PlatCfgTeamMember.email
  org PlatOrganisation @relation(fields: [orgId], references: [id], onDelete: Cascade)
  job PlatJob          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@unique([orgId, jobId, email])
  @@index([orgId, email])
  @@map("plat_cfg_job_assignment")
}
```

### 3.5 Data population (unblocks everything — this is D7)

1. Map `JOBS.Assigned_To` in `fieldMaps.ts` so assignments are writable from the app.
2. Ensure each customer base `TEAM` table has `Email` + `JOBS` link (provisioning template).
3. **Assignment UI** — on Team management and/or the project detail page: assign members to
   a project (writes `TEAM.JOBS` / `Assigned_To`, or `PlatJobAssignment`).
4. **Auto-assign the creator** when a job is created (so a builder who creates a project
   keeps access to it).

### 3.6 Fail direction & rollout flag

- During rollout: **fail-open** — unresolved/empty assignments ⇒ `{mode:"all"}`. Matches the
  existing `rls.ts` contract ("RLS tightens as TEAM data arrives, never bricks an org").
- Per-org flag `PROJECT_RLS_ENFORCE` flips the posture to **fail-closed** once a base's
  assignments are populated: unresolved/empty ⇒ `{mode:"none"}`.
- This is a deliberate exception to the platform's usual "default to least privilege"
  (`normalizeTeamRole`) — locking everyone out before data exists is worse than a temporary
  open window. The flag is the gate.

### 3.7 Edge cases

- **Demo mode** — no Clerk ⇒ viewer is the highest-privilege member (`owner`), which is
  `rlsExempt` ⇒ sees all. No behavior change; note it.
- **Platform admin** (`isPlatformAdmin`) — always full; orthogonal to org RLS.
- **Zero-assignment non-exempt user under enforcement** — empty list windows + a clear empty
  state ("No projects assigned — ask an admin"); must still reach org-global records.
- **Reports** — `reportDetailSource`/`reportCatalog` job-derived aggregates must scope too,
  or a report leaks cross-project totals.
- **Nav** — unchanged. RLS is row-level, not feature-level; the finance-nav gating stays as-is.

---

## 4. Out of scope (adjacent, don't conflate)

- **Financial-route gating gap (C1/C4)** — procurement/tender *view* pages and 4
  learning-rules actions lack role gates. That's **CLS / role gating**, not project scoping.
  Track separately (UC3 audit Phase 0).
- **Per-project *roles*** (a user being `builder` on A, `broker` on B) — explicitly not
  chosen. If ever wanted, it layers on §3.1 by returning a role-per-job map instead of a set.

---

## 5. Rollout phases

- **P0 — data:** map `Assigned_To`; `TEAM.Email/JOBS` in template; `PlatJobAssignment`;
  assignment UI; auto-assign creator.
- **P1 — reads:** `JobScope` + `resolveJobScope` + `scopeRows`; scope all list windows (via
  `listQuery`), job detail (`notFound`), dashboard/assistant. Fail-open.
- **P2 — writes + approvals:** job-scope guard in `recordWriter` human gate; scope approvals.
- **P3 — AI:** scope `tools.ts` query path.
- **P4 — enforce:** flip `PROJECT_RLS_ENFORCE` per org once populated; empty-state UX; audit
  that no seam is unscoped.

## 6. Tests

- Unit: `resolveJobScope` (exempt / some / none / unresolved-open-vs-closed), `scopeRows`
  (all/some/none, orphan rows). Extend `roles.test.ts` pattern.
- Integration per seam: list filter, detail `notFound`, write denial, approvals filter,
  AI query filter — for a scoped `broker`, an exempt `owner`, and a `+business_owner`.
