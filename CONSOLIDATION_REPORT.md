# Documentation Consolidation Report

**Date:** 2026-07-28
**Deliverables:** `MASTER_IMPLEMENTATION_GUIDE.md` (consolidated reference), this report, `MARKDOWN_CLEANUP_PLAN.md` (cleanup recommendations).
**Method:** full-repository Markdown discovery → five parallel full-text content extractions (grouped by theme: architecture, migration, spec/governance, audits, feature plans) → cross-file deduplication with supersession resolution → consolidated master guide with 100 % source traceability.

---

## Phase 1 — Discovery & Inventory

**Scope:** 30 tracked `*.md` files. Excluded from consolidation: `node_modules` / `.git` / build outputs (2,893 vendor files), gitignored generated content (`outputs/Reverse_Engineering_aequilibri-next.md`; 13 runtime report snapshots under `var/storage/`), and 4 retained non-documentation files (`README.md` — repo root doc; `CLAUDE.md`/`AGENTS.md` — runtime agent instructions; `.github/pull_request_template.md` — GitHub config).

**Consolidation corpus: 26 files, ~360 KB.**

| File | Purpose | Last Modified | Size | Category |
|---|---|---|---|---|
| docs/PLATFORM_ARCHITECTURE.md | 8-module target architecture + UC1/UC2/UC3 mapping + Construction Domain Pack | 2026-07-07 | 20.6 KB | Architecture |
| docs/UC2_README.md | Retired UC2 (Didi) module reference — explicitly historical | 2026-07-07 | 15.4 KB | Technical Specification |
| docs/UC3_README.md | Pre-convergence UC3 module reference (cookie tenancy, `/uc3` routes) | 2026-06-05 | 21.2 KB | Technical Specification |
| MEMORY_ARCHITECTURE.md | Six-layer memory model on UC1 loop + superseded Airtable adapter plan | 2026-06-05 | 4.3 KB | Architecture |
| docs/design-system.md | UI tokens, primitives, 10-point PR review gate | 2026-07-25 | 4.0 KB | Design |
| docs/airtable-migration-plan.md | Hand-off status/plan for the Postgres→Airtable migration (June) | 2026-06-23 | 20.3 KB | Project Notes |
| docs/airtable-migration-mapping.md | Prisma↔Airtable schema mapping, translation rules, live-schema reconciliation | 2026-07-10 | 20.0 KB | Technical Specification |
| docs/airtable-postgres-free-remaining.md | Implementation spec to finish zero-Postgres operation | 2026-06-24 | 15.5 KB | Build Guide |
| docs/airtable-postgres-switch-audit.md | 2026-07-28 backend-switch readiness audit + Phase A–D remediation record | 2026-07-28 | 14.7 KB | Architecture / Decisions |
| MIGRATION_GAP_ANALYSIS.md | Django→Next.js port gap analysis (different migration; 2026-06-08 snapshot) | 2026-06-08 | 12.2 KB | Project Notes |
| docs/SPEC_GAP_ANALYSIS.md | Gap analysis vs Build Spec 5 | 2026-06-24 | 16.9 KB | Project Notes |
| docs/SPEC10_GAP_ANALYSIS.md | Gap analysis vs Build Spec 10 (21-table Core; supersedes Spec 5 analysis) | 2026-06-26 | 16.1 KB | Project Notes |
| docs/spec12-lock-plan.md | Spec 12 M1–M8 cross-check + L0–L5 lock design and build log | 2026-07-26 | 47.2 KB | Technical Specification / Decisions |
| docs/governance-framework-plan.md | Governance Framework v3.0 → code mapping, phases 0–5 with build log | 2026-07-16 | 16.5 KB | Design |
| docs/governance-phase0-decisions.md | D1–D9 Product-Owner decision register (all unsigned) | 2026-07-15 | 5.1 KB | Decisions |
| docs/project-rls-plan.md | Project-level RLS design (JobScope, seams, edge cases) | 2026-07-24 | 10.5 KB | Design |
| docs/project-rls-activation.md | RLS activation plan (PLAT_ASSIGNMENTS, per-org flag, rollout) | 2026-07-24 | 6.1 KB | Deployment Guide |
| docs/project-general-bucket-plan.md | Per-org General job for org-level records (kills null-job leak) | 2026-07-24 | 2.8 KB | Design / Decisions |
| docs/reporting-revamp-plan.md | Report catalog + custom AI reports (all 4 phases shipped) | 2026-07-20 | 9.5 KB | Design / Technical Specification |
| docs/group-by-plan.md | URL-driven group-by across 12 list windows (shipped) | 2026-07-23 | 5.6 KB | Technical Specification |
| docs/n8n-automation-plan.md | n8n Gmail inbound / outbox outbound workflows + onboarding runbook | 2026-07-20 | 7.8 KB | Build Guide / Operations |
| docs/module1-onboarding-runbook.md | Org provisioning + schema propagation procedure | 2026-06-24 | 1.3 KB | Support Runbook |
| docs/production-readiness-audit.md | 2026-07-25 self-audit (66/100) + runbook/IR/rollback/DR/monitoring spec | 2026-07-25 | 18.0 KB | Operations |
| docs/enterprise-audit-2026-07-26.md | 2026-07-26 enterprise audit (63/100) + P0–P3 action register | 2026-07-26 | 32.0 KB | Operations |
| docs/uc3-ui-ux-audit.md | 2026-07-20 per-window UI/UX audit (4 Criticals, since fixed) + 5-phase plan | 2026-07-20 | 30.6 KB | Testing |
| README.md | Repo root documentation (rewritten 2026-07-26) | 2026-07-26 | 3.2 KB | Other (retained) |

## Phase 2 — Content Analysis

All 26 files were read in full by five parallel extraction passes, each producing structured extractions (business context, architecture decisions, data model, integrations, security, build/config/deploy, operations, decision records) plus per-file currency judgments and cross-file overlap notes. No file was skimmed or sampled.

## Phase 3 — Duplicate Analysis

| Topic | Source files | Resolution |
|---|---|---|
| Spec gap analyses | SPEC_GAP → SPEC10_GAP → spec12-lock-plan | Explicit supersession chain; spec12-lock-plan authoritative. SPEC10 uniquely documents the 21-table Core transition + template decision (preserved); SPEC_GAP's per-module artifact inventory preserved in essence |
| Backend flag / seam mechanics | airtable-migration-plan, airtable-postgres-free-remaining, switch-audit | Switch-audit (2026-07-28) authoritative — records the per-org `data_backend_postgres` evolution; free-remaining's working conventions absorbed into Build Instructions |
| Env vars & base IDs | migration-plan, free-remaining, mapping, spec12, activation | Merged into Configuration; **two conflicts flagged** (control base ID June vs July; three template-base IDs over time) — see master guide "Unresolved conflicts" |
| ID bridge (`legacy_pg_id`/`airtableRecordId`) | mapping §7.1 (proposal), switch-audit Phase B (implementation) | Switch-audit authoritative; mapping kept as design rationale |
| Airtable platform constraints (no txns, floats, typecast, drift) | mapping (fullest), migration-plan, free-remaining, switch-audit | Merged; mapping's analytical version + switch-audit's current numbers |
| UC1 learning loop (thresholds, function names) | MEMORY_ARCHITECTURE, PLATFORM_ARCHITECTURE (near-identical) | Merged once into Architecture/learning loop; MEMORY_ARCHITECTURE's `MEMORY_BACKEND` adapter proposal marked superseded (never built) |
| "Approve doesn't execute write" gap | PLATFORM_ARCHITECTURE, UC2_README, UC3_README, MIGRATION_GAP_ANALYSIS | All four describe a since-fixed gap (recordWriter approve-executes-write); recorded as ADR-3 history, stale risk entries dropped |
| No-auth / cookie-tenancy risks | UC2_README, UC3_README, MIGRATION_GAP_ANALYSIS | Superseded by Clerk production activation; dropped as open risks, kept as history |
| Role taxonomy evolution | SPEC_GAP, SPEC10, governance-plan, phase0-decisions D5, spec12 D-1 | Spec12 D-1 resolution authoritative (code roles canonical); D5 display mapping noted as complementary + unsigned |
| 7 cascading rules | SPEC_GAP (gap), SPEC10 (spec), spec12 (design + build) | spec12 authoritative (CASCADE-A..G as built) |
| Module 6 thresholds & confidence formula | SPEC10 (introduced), spec12 (locked D-5) | spec12 authoritative |
| PLAN table + 4 render modes | SPEC10 (open), spec12 L1/L5 (built PlanView) | spec12 authoritative |
| DOMAIN_LABELS | SPEC10, governance-plan Phase 4, phase0 D8, spec12 L4/L5 | Merged: governance-plan for read layer, spec12 for rollout mechanics, D8 remains unsigned |
| RLS design → activation → General bucket | project-rls-plan, project-rls-activation, project-general-bucket-plan | Explicit chain; activation supersedes plan §3.4/§3.5 (assignment store); general-bucket reverses the null-job policy — general-bucket most current |
| Audit findings (two audits, 24 h apart) | production-readiness-audit, enterprise-audit | Enterprise audit authoritative for finding status (it re-verified the self-audit); production-readiness retained for its unique ops artifacts (runbook, DR plan, growth scenarios, SPOF list) — both preserved in Operations/Monitoring/Support sections |
| UC3 UI/UX Criticals C1–C4 | uc3-ui-ux-audit (found), enterprise-audit UX-5 (verified fixed) | Recorded as fixed; Medium/Low backlog carried into Known Issues |
| Onboarding checklists | module1-onboarding-runbook, n8n-automation-plan, rls-activation/general-bucket | Merged into one Deployment/onboarding narrative; runbook retained as operational quick reference |
| n8n-scheduled reports | reporting-revamp-plan Phase 4, n8n-automation-plan | Neither built; recorded once in Known Issues |
| Control-base table inventory | activation, n8n-plan, reporting-plan, spec12, switch-audit (scattered) | Unified into one Configuration table — previously existed nowhere as a single list |
| Live org / base-ID inventory | activation (only complete list), spec12, legal-demo refs | Unified in Solution Overview |

## Phase 4 — Master Guide

`MASTER_IMPLEMENTATION_GUIDE.md` created (~34 KB) with the prescribed structure (Executive Summary → Appendix). Content policy: current verified state wins; superseded designs recorded as ADR history rather than repeated; all concrete technical facts (env vars, base IDs, script names, thresholds, endpoints) preserved verbatim; five unresolved conflicts flagged explicitly rather than silently resolved.

## Phase 5 — Validation

| Check | Result |
|---|---|
| No source file contributes zero information | ✅ All 26 corpus files appear in the traceability matrix with at least one consolidated section |
| Every source in traceability matrix | ✅ 26/26 (see master guide Appendix) |
| Requirements preserved | ✅ Spec lineage (5→10→12), governance framework requirements, engagement types, D1–D9 register, module model all present |
| Architecture preserved | ✅ Layered architecture, write chokepoint pipeline, RLS/CLS/RBAC, cascade engine, learning-loop maths, data model tiers, topology caution, ID bridge |
| Deployment steps preserved | ✅ CI/Render pipeline, single-instance constraint, onboarding runbook commands (verbatim), n8n onboarding, rollback, schema-change discipline |
| Operational procedures preserved | ✅ Health checks, backup/DR (RPO/RTO), incident table, monitoring spec table, scripts inventory, diagnostics |
| Decisions preserved | ✅ 19 ADRs + the unsigned D1–D9 register + Spec-12 D-1..D-13 |
| Conflicts resolved or flagged | ✅ 5 flagged explicitly (control-base ID, template IDs, env-var counts, null-job policy, MIGRATION_GAP P1 re-verification) |

**Known information-loss risk (accepted, by design):** fine-grained per-window Medium/Low findings in `docs/uc3-ui-ux-audit.md`, the line-item build logs in `docs/spec12-lock-plan.md`, and the field-level Didi schema reconciliation in `docs/airtable-migration-mapping.md` are *summarized*, not reproduced — those three files are recommended for retention/archive (not deletion) precisely because their detail exceeds what a master guide should carry.

## Statistics

- Files processed: 30 (26 consolidated, 4 retained out-of-corpus)
- Files fully absorbed (candidates for removal): 7
- Files recommended for archive (historical/backlog value): 9
- Files recommended for retention (live registers / operational references): 10 + README/CLAUDE/AGENTS/PR-template
- Duplicate topic clusters merged: 19 (table above)
- Supersession chains resolved: 4 (spec analyses; migration docs; RLS trilogy; UC-era READMEs)
- Unresolved conflicts flagged: 5

## Potential Risks

1. **Master guide staleness:** the repo moves fast (5 phases of work shipped in the last 4 days alone). The guide is a 2026-07-28 snapshot; the retained live registers (switch-audit, enterprise-audit, governance decisions) remain the mutation points. Recommend updating the guide when those registers close items.
2. **Deleted-file link rot:** `README.md` links to `docs/PLATFORM_ARCHITECTURE.md` (archive candidate); the enterprise audit references the production-readiness audit's ops section. The cleanup plan lists required link updates before any deletion.
3. **Unsigned decisions:** D1–D9 remain open; nothing in this consolidation should be read as approving them.
4. **80 % reduction target:** honestly achievable only by also archiving the live registers, which is *not* recommended until their open items close — see the cleanup plan for the arithmetic.
