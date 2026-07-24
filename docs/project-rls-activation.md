# Project (job) level security — activation plan

**Status:** plan · **Date:** 2026-07-24 · Follows [project-rls-plan.md](project-rls-plan.md)

The enforcement machinery is built and shipped (commit `3903b87`): every read/write
seam funnels through `inScope`/`scopeRows`, gated by `PROJECT_RLS_ENFORCE` (default
**off / fail-open**). This plan is the path from *built* to *actually enforcing* —
which is entirely a **data + activation** problem, not a code-coverage one.

## 0. Ground truth (probed 2026-07-24)

- **No assignment data exists anywhere.** The resolver reads a per-base Airtable
  `TEAM` table (`Email` → `JOBS` links). Reality across the 7 live client bases:
  - `TEAM` table **absent**: sunridge, port-city-roofing, rhins, builders-co,
    meridian-legal (5 of 7 — everything not cloned from the construction template).
  - `TEAM` present but **empty**: ataro-com, dulong-downs-didi (0 member rows).
  - Construction template: 1 stub row, no email.
- **Membership + roles already live centrally**, not per-base: the control base
  `app51Tmrgab3QYP4Z` `PLAT_TEAM` table (`Org_Slug`, `Email`, `Role`) is what
  `getCurrentViewer` reads. The per-base `TEAM` table is a *different*, largely
  non-existent table.

So RLS resolves to `all` for everyone today. Turning it on requires putting
assignment data somewhere the resolver can read it — and that "where" is the one
real decision below.

## 1. The core decision — where assignments live

> **Decided 2026-07-24: Option B (central control-base `PLAT_ASSIGNMENTS`).**


| | **A. Per-base `TEAM.JOBS`** (current resolver) | **B. Central control-base store** (recommended) |
|---|---|---|
| Where | Each customer base's `TEAM` table, `Email`→`JOBS` link | One `PLAT_ASSIGNMENTS` table in the control base: `(Org_Slug, Email, Job_Rec_Id)` rows |
| Schema work | Provision `TEAM` + `JOBS` link in **5 bases that lack it**, backfill a member row per user in **every** base | One new table, one base (already PAT-reachable) |
| Matches existing model | No — splits identity (control `PLAT_TEAM`) from assignment (per-base `TEAM`) | **Yes** — assignments sit beside membership/roles in the control plane |
| Cross-base links | N/A (same base) | Job ids stored as **text** (rec ids); Airtable can't link across bases — fine, the resolver only needs the id set |
| Both backends | Airtable only | Works for Airtable **and** Postgres orgs from one store |

**Recommendation: B.** Membership already lives centrally; the per-base `TEAM`
approach means provisioning a table into 5 bases and syncing a member row per user
into all of them, for no benefit. A central `PLAT_ASSIGNMENTS` table is one place,
reachable by the PAT, backend-agnostic. The only code change is re-pointing
`assignedJobRecIds`/`resolveJobScope` to read it (by `org + email` → set of job rec
ids), which is a ~20-line swap behind the same `JobScope` interface — every seam
downstream is unchanged.

## 2. Phases

**P0 — Assignment store + resolver re-point** *(unblocks everything)*
- Control base: `PLAT_ASSIGNMENTS` (`Org_Slug`, `Email`, `Job_Rec_Id`, `Created_At`).
  Provisioning script mirrors `airtable-add-issues-job-link.mjs` / the control-base
  creation script.
- Postgres mirror `PlatJobAssignment (orgId, email, jobRef)` for PG orgs (low
  priority — all live orgs are Airtable).
- Re-point `assignedJobRecIds(ctx, email)` to read `PLAT_ASSIGNMENTS` filtered by
  `Org_Slug + Email` → `Set<jobRecId>`. Keep the tolerant null-on-empty contract.
  Cache the read (control reads are already TTL-cached).

**P1 — Assignment management UI** *(admin)*
- Extend the existing Team admin page (`team/actions.ts` already manages
  `PLAT_TEAM`): per member, a **searchable/paginated** project multiselect (must
  handle Meridian's ~3000 matters — reuse the search-based pattern, not a giant
  dropdown). Save writes/deletes `PLAT_ASSIGNMENTS` rows.
- Gate with `requireAdmin` (owner) — assigning is an Administrator action.
- Show each member's current assignment set; bulk "assign to all active jobs".

**P2 — Lifecycle automation**
- Auto-assign the **creator** on job create: in `recordWriter` (human `job`
  create), add a `PLAT_ASSIGNMENTS` row for the actor's email + new job rec id, so a
  Manager who creates a project keeps access to it.
- On member deactivation/removal, delete their assignment rows.

**P3 — Per-org enforce flag** *(replace the global env var)*
- Move `PROJECT_RLS_ENFORCE` from a process-wide env flag to a **per-org** setting
  (control-base org registry `Settings`, e.g. `{ projectRlsEnforce: true }`).
  `resolveJobScope` reads it per `ctx`. This lets you flip one base at a time once
  its assignments are seeded, without touching the others.

**P4 — Pre-flip verification + rollout**
- A **scope-preview** admin view: for every non-exempt member of a base, show their
  resolved job set. Confirm each is non-empty and correct before flipping.
- Empty-state UX: a non-exempt member with zero assignments sees only org-global
  rows — the list windows need a clear "No projects assigned — ask an admin" state.
- Flip `projectRlsEnforce` for that org; re-verify as a scoped test user.

## 3. Policy & edge cases

- **Exempt roles** (owner / `+auditor` / `+business_owner`) always see everything —
  so at least one Administrator always has full access; flipping a base can never
  lock everyone out.
- **New / unassigned non-exempt members** see only org-global rows until assigned —
  least-privilege by design; onboarding must include a project assignment step.
- **Org-global records** (no job link: contacts, org settings, learning rules,
  pre-fix orphan actions) stay visible to all members in every mode.
- **Legal vertical** — "projects" are matters (~3000 at Meridian); the assignment UI
  and any job pickers must page/search, never enumerate.

## 4. Minimum to turn it on for one base

P0 (store + resolver) + a handful of manually-seeded `PLAT_ASSIGNMENTS` rows + P3
(per-org flag) → flip that one org and verify. P1/P2/P4 make it operable at scale but
aren't strictly required to prove enforcement on a single seeded base.
