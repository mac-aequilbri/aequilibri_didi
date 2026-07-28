# Markdown Cleanup Plan

**Date:** 2026-07-28 · **Status: RECOMMENDATION ONLY — no files have been deleted or moved.**
Execute only after `MASTER_IMPLEMENTATION_GUIDE.md` has been reviewed and this plan approved.

Suggested mechanics: create `docs/archive/` for the archive bucket (preserves git history via `git mv`); deletions also stay recoverable via git history, but archiving keeps them greppable.

---

## Safe to Delete (7 files)

Fully superseded; all surviving knowledge is in the master guide (see its Source Document Mapping).

| File | Justification |
|---|---|
| `docs/SPEC_GAP_ANALYSIS.md` | Twice-superseded (by SPEC10 analysis, then spec12-lock-plan). Header of SPEC10 doc records the supersession explicitly. |
| `docs/airtable-migration-plan.md` | June hand-off doc; every P-item done or superseded; the switch-audit (2026-07-28) is the current record. Gotchas absorbed into Lessons Learned. |
| `docs/airtable-postgres-free-remaining.md` | Its goal (zero-Postgres core operation) was achieved; working conventions absorbed into Build Instructions; env values absorbed into Configuration (with the control-base-ID conflict flagged). |
| `MEMORY_ARCHITECTURE.md` | The `MEMORY_BACKEND`/`memory-store.ts` adapter it proposes was never built (superseded by `AIRTABLE_MIGRATION` + per-org flag); learning-loop description duplicated in PLATFORM_ARCHITECTURE and the master guide. |
| `docs/UC2_README.md` | Explicitly banner-marked "Historical — the standalone UC2 module no longer exists"; every open risk in it is either fixed (recordWriter, Clerk) or tracked in the audits. |
| `docs/group-by-plan.md` | Feature shipped in full (phases 1–5, 2026-07-23); design decisions recorded as ADR-14; remaining optional Tier-2 add-ons listed in Known Issues. |
| `docs/reporting-revamp-plan.md` | All 4 phases shipped 2026-07-20; catalog + pipeline recorded in the master guide; open tail (n8n scheduling, Didi cleanup) in Known Issues. |

## Archive Recommended (9 files → `docs/archive/`)

Superseded as working documents, but carrying historical or backlog detail deliberately *not* reproduced in the master guide.

| File | Justification |
|---|---|
| `docs/SPEC10_GAP_ANALYSIS.md` | Sole record of the 21-table Core transition, the 3 table renames, the demo-base vs Master Template canonical decision, and `airtable-spec10-core-schema.mjs` provenance. |
| `docs/UC3_README.md` | Pre-convergence system description; useful when archaeology on `Uc3*`-era behavior is needed; all operative content superseded. |
| `MIGRATION_GAP_ANALYSIS.md` | Different migration (Django→Next.js). Its UC1 parity punch list is the *only* record of those gaps and was never re-verified — archive with a note to re-verify before deleting outright. |
| `docs/airtable-migration-mapping.md` | Reference-grade Prisma↔Airtable translation rules and the field-level Didi topology reconciliation (cited by the switch audit §7.1). Too detailed for the guide, too valuable to delete. |
| `docs/PLATFORM_ARCHITECTURE.md` | The 8-module model is absorbed; the per-module gap tables are self-described as "retained for history." ⚠ `README.md` links to it — update the link to the master guide first. |
| `docs/uc3-ui-ux-audit.md` | All 4 Criticals verified fixed; the per-window Medium/Low findings and Phases 2–4 remain a usable UX backlog — archive rather than lose it. |
| `docs/project-rls-plan.md` | Design implemented; JobScope rationale and seam catalog preserved in the guide; §3.4/§3.5 superseded by the activation doc. Keep as design record. |
| `docs/project-general-bucket-plan.md` | Policy absorbed (ADR-11); open items (onboarding hook, phase Q) tracked in Known Issues and the RLS activation doc. |
| `docs/governance-framework-plan.md` | Phases 0–5 build log largely complete; the P-register's live items (retag apply, TEAM population) are gated on the *retained* decisions register. Archive once P2–P5 data work begins under its own tracking. |

## Retain Separately (10 + 4 files)

Live registers, operational references, or non-documentation files. Do **not** consolidate away.

| File | Justification |
|---|---|
| `docs/airtable-postgres-switch-audit.md` | Most current doc in the repo (2026-07-28); its "accepted debt" list is the live open-items register for the backend switch. |
| `docs/enterprise-audit-2026-07-26.md` | Live P0–P3 action register with per-finding remediation status; README links to it; go-live conditions defined here. |
| `docs/production-readiness-audit.md` | The runbook / incident-response / rollback / DR-plan / monitoring-spec section is the platform's operational reference (the enterprise audit itself defers to it); README links to it. |
| `docs/spec12-lock-plan.md` | Authoritative Spec-12 record with open ops items (CASCADE-D/F/G activation, n8n consumers, Part C drift); retain at least until spec v13 flips M5–M8 to LOCKED. |
| `docs/governance-phase0-decisions.md` | Unsigned D1–D9 decision register awaiting the Product Owner — an active governance instrument, not documentation. |
| `docs/project-rls-activation.md` | RLS enforcement is still fail-open; this is the live activation plan until every org's flag is flipped. |
| `docs/n8n-automation-plan.md` | n8n workflows A/B are not yet built; this is the build plan plus the per-client onboarding runbook. |
| `docs/module1-onboarding-runbook.md` | Operational runbook with verbatim commands; README links to it. |
| `docs/design-system.md` | Living UI standard; the PR template's review checklist points at it. |
| `README.md` | Repo root documentation (rewritten 2026-07-26). |
| `CLAUDE.md`, `AGENTS.md` | Runtime agent-instruction files, loaded by tooling — not documentation. |
| `.github/pull_request_template.md` | GitHub configuration. |

**Out of scope (leave untouched):** gitignored generated content — `outputs/Reverse_Engineering_aequilibri-next.md`, `var/storage/**/*.md` (app-generated report snapshots = runtime data).

---

## Pre-deletion checklist

1. [ ] Review + approve `MASTER_IMPLEMENTATION_GUIDE.md`.
2. [ ] Update `README.md`: repoint the `docs/PLATFORM_ARCHITECTURE.md` link to `MASTER_IMPLEMENTATION_GUIDE.md`; add a link to the guide in the Operations section.
3. [ ] Grep the repo for references to files being deleted/archived (`docs/UC2_README`, `SPEC_GAP_ANALYSIS`, etc.) and fix any hits (docs cross-references, code comments).
4. [ ] `git mv` the archive bucket into `docs/archive/`; `git rm` the delete bucket; single commit so the removal is one revert away.
5. [ ] Re-run the link check after the move.

## Reduction arithmetic (honesty note)

Corpus of 26 substantive docs → 7 deleted + 9 archived = **16 removed from the active doc set (62 %)**; active `docs/` drops from 24 files to 9 + the master guide. The stated 80 % target is reachable only by also archiving the five live registers (switch-audit, both audits, spec12-lock-plan, governance decisions) — **not recommended** until their open items close, because they are the working state of in-flight security, spec, and governance work. Recommended path: take the 62 % now; re-run a lightweight consolidation pass when RLS enforcement flips, spec v13 locks, and D1–D9 are signed — at that point the registers become archivable and the reduction exceeds 80 % naturally.
