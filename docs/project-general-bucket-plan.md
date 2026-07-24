# "Everything under a project" + the General bucket

**Status:** plan · **Date:** 2026-07-24 · Extends [project-rls-activation.md](project-rls-activation.md)

Decision (2026-07-24): every operational record belongs to a job. The genuine
org-level minority (company policies, org-wide decisions, admin tasks) lives in a
per-org **"General" project** rather than as a null-job record. This removes the
null-job leak vector entirely — nothing is "visible to everyone" by accident; the
General bucket is the *intentional* shared home, and everyone can see it.

Earlier reasoning that actions/decisions/documents/quotes were "org-level by
nature" was largely an artifact of Didi being a single-project dataset (and the
platform's single-project UC2/UC3 origins) — not proof they're project-less.

## Model

- One auto-provisioned **General job** per org — an ordinary JOBS/PlatJob record
  (so it has a rec id and RLS works). Identified by its rec id stored in the org
  registry Settings (`generalJobId`); also `engagementType = "general"` where the
  backend has that column (Postgres; Airtable JOBS has no type field, so the
  registry pointer is the identifier).
- **RLS treats General as always in scope for every member** — even a user with
  zero assignments sees General. So org-wide records are shared deliberately, and
  no record is ever silently visible to all via a null job.

## Phases

**G (this pass) — the bucket + RLS + provisioning**
- `EngagementType` gains `"general"`; `OrgConfig.generalJobId` carries the id into
  every `ctx` (parsed from registry Settings, like features).
- `resolveJobScope` includes `generalJobId` in every non-exempt viewer's scope
  (assignments ∪ General; an unresolved+enforcing viewer still sees General).
- Provisioning script: create a "General" job per org (idempotent) and store its
  rec id in registry Settings. Run for the 7 existing orgs; hook onboarding for
  new orgs.

**R — required on create**
- Add a **required** Project select to every operational create/generate form
  that lacks one, General available (default for actions/decisions/documents).

**M — migration**
- Backfill existing null-job records to General per org — except Didi, whose null
  records go to its single real project (they're just unlinked).

**Q — quotes as job-from-lead (later)**
- Model a quote/proposal as a job at `status = lead` (→ won/lost/cancelled), so a
  quote always has a job. Touches the assessment/quote workflow; its own phase.

## Notes
- General is visible to all members (the shared company bucket). A separate
  admin-only bucket, if ever wanted, would be a second special project.
- Still gated by the per-org enforce flag — no behavior change until a base is
  flipped.
