# Enterprise Application Audit — aequilibri-next

**Audit date:** 2026-07-26
**Method:** read-only static review by six parallel specialist assessments (architecture, security, DevOps/SRE, data, performance, UX/governance), cross-checked against the repo's own self-audit (`docs/production-readiness-audit.md`, 2026-07-25). Every claim was independently verified against current code, not taken from that document. No files were modified during the audit.

**Verdict:** Enterprise Readiness **63/100** — **GO WITH CONDITIONS** for the platform surface; **NO GO** for the UC1 public surface and for horizontal scaling. See [Go/No-Go](#gono-go-assessment).

**Remediation status (2026-07-26, same day):** code-side fixes applied and verified (tsc/lint/213 tests ✅) for: SEC-1 (UC1 gated behind Clerk in proxy.ts), SEC-6 (generic error bodies ×5), SEC-8 (CSV formula guard), SEC-9 (formulaSafe everywhere), SEC-10 (demo mode only on explicit dev/test), SEC-11 (crypto refuses dev key in prod; `PLATFORM_ENCRYPTION_KEY` declared in render.yaml), DEV-3 (healthCheckPath → /api/health), DEV-6 (Claude `response.usage` logged on all 4 paths), DEV-7 (scheduler workflow retries then fails loudly), DAT-1 (daily backup workflow `.github/workflows/backup.yml` — needs repo secrets), DAT-6 partial (approver stamped by email), DAT-10 (wipe script refuses non-local DATABASE_URL), PER-3 (`numInstances: 1` pinned in render.yaml), GOV-1 partial (CODEOWNERS + PR template), SUP-2 (README rewritten), plus `.nvmrc`. SEC-2 closed by owner same day (workstation credentials rotated). **Still open:** items in the register requiring dashboard/credential/sign-off actions, and the larger engineering items (DAT-2 Airtable-shaped Zod schemas, DAT-3 idempotency, DAT-5 control-base audit log, PER-1/2 pagination, SEC-5 rate limiting, DEV-5 env module, DEV-9 logger adoption, R13 test hermeticity, ARC-1 migration completion).

**Key pattern:** the single most distinctive risk found across all six reviews is **"built but not operational"** — health endpoint unwired, DR export unscheduled, monitoring specced but not deployed, RLS complete but fail-open, CI green but not gating. Remediation is mostly *activation*, not construction.

---

## Phase 1 – Application inventory

| Category | Finding |
|---|---|
| Technology stack | Next.js 16 (App Router), React 19.2, TypeScript 5, Tailwind 4, Node ≥20.9 |
| Frontend architecture | Server-components-first; 119 pages, 49 server-action modules, ~2,500 LOC shared component library (`src/components`); all platform pages `force-dynamic` |
| Backend architecture | Next.js server actions + 20 API route handlers; service layer in `src/services` (~13.7k LOC); data-source layer of ~40 `*Source.ts` view-model builders; single write chokepoint `src/lib/platform/recordWriter.ts` |
| Database technologies | **Airtable is the system of record** (base-per-tenant + one shared control base); Prisma/Postgres retained as legacy/escape-hatch dual path (~90 models in `prisma/schema.prisma`); SQLite for CI |
| External integrations | Anthropic (AI assistant/agents), Clerk (auth), Xero (read), IMAP inbox ingestion, Google Drive/Maps/Solar, Geoscape, n8n via HMAC webhooks |
| Authentication | Clerk, enforced in `src/proxy.ts`; fail-closed (503) if half-configured; `ALLOW_DEMO_MODE` escape hatch; UC1 surface unauthenticated behind `UC1_ENABLED` flag |
| Infrastructure | Single Render web service (Singapore), **`plan: free`**, declared in `render.yaml`; no staging environment |
| Deployment model | Push to `master` → GitHub Actions CI → Render auto-deploy (CI-gating depends on an unverifiable dashboard toggle) |
| CI/CD tooling | `.github/workflows/ci.yml`: typecheck, zero-warning lint, vitest (213 tests), production build; `.github/workflows/scheduler.yml`: hourly cron heartbeat |
| Monitoring tooling | **None deployed.** Health endpoint exists (`src/app/api/health/route.ts`) but Render still health-checks `/`; no Sentry/APM/uptime monitor; structured logger exists with stdout as only sink |
| Third-party dependencies | Lean and well-isolated: three.js/geotiff confined to UC1 and code-split; imapflow/mailparser behind an interface; audit-clean except postcss/sharp advisories bundled inside Next itself |
| Codebase size | 477 TS/TSX files, ~60,650 LOC; 33 test files; exactly **1** TODO/FIXME in source |

---

## Phase 2 – Architecture review

### Findings

| ID | Severity | Component | Observation | Business impact |
|----|----------|-----------|-------------|-----------------|
| ARC-1 | **High** | Read data layer | Postgres→Airtable migration in-flight with **~253 `airtableEnabled()` conditionals across 75 files**; each of ~40 sources maintains two parallel query implementations | Every feature is built and regression-tested twice; branches drift until migration completes |
| ARC-2 | Medium | Layering | Prisma imported in 97 files including page-level server components (diagnostics, accounting, portal pages) and the assistant executor — bypassing the source/writer layer | Tenant scoping and business rules drift between view files; assistant writes must be migrated separately |
| ARC-3 | Medium | UC1 legacy stack | ~8.5k LOC parallel application under `(uc1)`, flag-gated but still coupled into platform code (`uc1Source`, assess module); duplicate `learning.ts` implementations | Maintenance and security-surface tax with unclear ownership; neither retired nor integrated |
| ARC-4 | Medium | Error handling | 198 `catch`-and-swallow sites across 116 files, dominant idiom `.catch(() => null)` | Partial Airtable/Postgres outages surface as silently-empty dashboards, delaying detection |
| ARC-5 | Low | Config | 32–40 distinct env vars read ad-hoc; model IDs defined in both `src/lib/claude.ts` and `modelRouter.ts` | Misconfiguration surface; model rollover can miss one path |
| ARC-6 | Low | File size | Four hand-written files >1,000 LOC (`learning.ts` 1,299; `uc1Source.ts` 1,236; `recordWriter.ts` 1,227; `control.ts` 1,099) | Review and merge-conflict cost |

**Strengths (verified):** components layer has *zero* direct data-access imports; single write registry with Zod + field maps; Prisma client wrapped in a `$extends` guard that throws on org-unscoped queries; all seven external seams behind clean, demo-swappable interfaces; near-zero inline debt markers.

### Action log

| Priority | Action item |
|---|---|
| P1 | Finish the read-path Airtable migration (or wrap reads in one repository seam) to eliminate the dual implementations |
| P2 | Decide UC1's fate: retire and delete, or fully integrate behind auth — stop carrying it half-alive |
| P3 | Route server-component and assistant-executor data access through the source/writer layer |
| P4 | Add telemetry to the `.catch(() => null)` fallbacks so outages aren't masked as empty results |

---

## Phase 3 – Security review

### Findings

| ID | Severity | Risk area | Observation |
|----|----------|-----------|-------------|
| SEC-1 | **Critical** | API authorization | Entire `/api/uc1/*` surface (11 routes) is unauthenticated; several perform DB writes with no validation; solar/lidar/detect-features routes invoke **paid** Google/Claude APIs with no rate limit (cost-amplification DoS). `src/proxy.ts:16-36` only protects `/app` |
| SEC-2 | **High** | Secrets management | Live-format credentials in plaintext workstation `.env` (Anthropic `sk-ant-…`, Airtable PAT, Google keys, Geoscape secret). Not git-tracked (verified) — but readable by any local process; rotation recommended |
| SEC-3 | **High** | Authorization / RLS | Project-level RLS is feature-complete but **fail-open**: `rlsEnforce()` defaults false (`src/lib/platform/rls.ts:49-52`); low-privilege members see every job in their org until per-org enforcement is flipped |
| SEC-4 | Medium | AI security | Under `auto_low_risk` org policy, low-risk assistant writes execute with no human gate while untrusted content (chat, ingested email) reaches the model — prompt-injection can drive unreviewed record writes (`src/services/platform/assistant/executor.ts:26-30`) |
| SEC-5 | Medium | Rate limiting | No inbound rate limiting anywhere — webhook HMAC and CRON bearer are brute-forceable unthrottled; AI/geo routes unmetered |
| SEC-6 | Medium | Data protection | Raw exception text returned to clients on 5 endpoints (UC1 session-init/solar/detect-features, webhook, ingest) — internal detail leakage |
| SEC-7 | Medium | Input validation | Zod validates only the canonical write chokepoint; every route handler and the 40 server-action modules parse raw JSON/FormData with ad-hoc `String()/Number()` coercion |
| SEC-8 | Low | Injection | CSV export doesn't neutralize leading `=`/`+`/`-`/`@` (`src/lib/platform/csv.ts:9-12`) — spreadsheet formula injection on exported registers |
| SEC-9 | Low | Injection | Airtable `formulaSafe` strips rather than escapes quotes; two call sites bypass the helper (`documents.ts:675`, `cascade.ts:215`) — low exploitability, consistency issue |
| SEC-10 | Low | Config | `demoModeAllowed()` is true for any non-production `NODE_ENV` — a mis-set env var silently disables auth (`src/lib/platform/authConfig.ts:26`) |
| SEC-11 | Low | Crypto | AES-256-GCM secret storage falls back to a hard-coded dev key when `PLATFORM_ENCRYPTION_KEY` is unset; nothing enforces a real key in prod — and that variable is **not declared in render.yaml** |

**Positive controls (verified):** fail-closed Clerk proxy; exemplary webhook HMAC (timing-safe, replay window, per-org secrets, size caps, default-deny); timing-safe length-blinded CRON bearer; layered authz (`requireOrgCtx`/`canApprove`/`requireFinancialAccess`/`requireAdmin`); per-role AI tool allow-lists with always-gated high-risk writes; no SSRF found; no secrets in git history.

### Action log

| Priority | Action item | Risk reduction |
|---|---|---|
| P1 | Gate or disable the UC1 public API (extend proxy matcher or flip `UC1_ENABLED` off) | Eliminates unauthenticated writes + financial DoS |
| P1 | Rotate workstation credentials; restrict Google key by referrer; split/scope the Airtable PAT | Closes live-credential exposure |
| P1 | Flip `PROJECT_RLS_ENFORCE` for live orgs (feature is built and verified) | Closes within-tenant overexposure |
| P2 | Add inbound rate limiting on `/api/platform/*`, portal, and AI routes | Brute-force + cost control |
| P2 | Declare and enforce `PLATFORM_ENCRYPTION_KEY`; fail boot without it in prod | Protects stored OAuth tokens |
| P3 | Sanitize CSV exports; genericize client-facing error bodies; Zod-validate route inputs | Injection + info-leak hardening |

---

## Phase 4 – DevOps review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| DEV-1 | **High** | Deploy gating | CI is advisory: Render's "Auto-Deploy after CI passes" is a manual dashboard toggle, unverifiable from the repo and unconfirmed — red CI may still deploy `master` to production |
| DEV-2 | **High** | Infrastructure | `plan: free` (`render.yaml:6`) — instance spin-down means 30–60s customer-facing cold starts; scheduler workflow explicitly tolerates cold-start failures |
| DEV-3 | **High** | Health checks | `healthCheckPath: /` is stale — the real `/api/health` endpoint (config + deep Airtable probe) exists but **is not wired to Render**; a total data-layer outage still health-checks green |
| DEV-4 | **High** | Monitoring | No error tracking, APM, metrics, or uptime monitoring anywhere; Sentry exists only as a comment in `src/lib/logger.ts`; alert thresholds exist as a written spec only |
| DEV-5 | **High** | Config management | No fail-fast env validation: ~40 env vars read ad-hoc across 25 files; a missing `AIRTABLE_PAT` is a runtime 500, not a boot failure |
| DEV-6 | **High** | AI cost | `response.usage` never read on any of the 4 Claude call paths — zero token/cost accounting, no spend caps, on a product with multi-round agent loops and scheduled cross-org report generation |
| DEV-7 | **High** | Scheduled jobs | Scheduler is a silent SPOF: hourly GitHub Actions curl swallows failures (`exit 0`); if Actions is disabled or `CRON_SECRET` rotates one-sided, snapshots go stale and the outbox DLQ stops draining with **no alarm** |
| DEV-8 | Medium | Environments | No staging; complex env-activation matrix (Airtable/demo, Clerk/demo, IMAP/fixtures, Drive/local) multiplies misconfiguration risk |
| DEV-9 | Medium | Logging | Right single-sink structured logger, but ~20 raw `console.*` calls bypass it; no request/correlation IDs; Claude errors laundered into content strings |
| DEV-10 | Medium | Ops scripts | The two most dangerous scripts (wipe, DR export) are well-guarded; the ~50-script long tail mutates live Airtable schemas with no `--yes`/dry-run rails, sharing the production PAT |
| DEV-11 | Low | Release mgmt | Version frozen at 0.1.0, one git tag ever, no changelog; rollback path (Render image rollback + additive-only schema) is documented and credible |

### Action log

| Priority | Action item |
|---|---|
| P1 | Verify/enable Render's "Auto-Deploy after CI passes"; upgrade off the free plan; point `healthCheckPath` at `/api/health` |
| P1 | Wire Sentry (one-file change at `logger.emit`) + an external uptime monitor on `/api/health?deep=1` |
| P2 | Build the zod-validated `src/lib/env.ts` fail-fast config module; declare `PLATFORM_ENCRYPTION_KEY` in render.yaml |
| P2 | Implement scheduler-absence alerting; stop masking curl failures in scheduler.yml |
| P2 | Read and record `response.usage` per Claude call; add per-org spend visibility and a budget cap |
| P3 | Add pre-commit hooks, `.nvmrc`, staging environment, release tagging |

---

## Phase 5 – Data review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| DAT-1 | **Critical** | Backup/DR | **No automated backups of the system of record.** The DR export script (`scripts/airtable-export-backup.mjs`) exists and is good, but nothing schedules it — actual RPO is unbounded vs the documented 24h target. Restore path documented but never drilled |
| DAT-2 | **High** | Data integrity | The Airtable (live) write path **skips Zod validation**, relying on `typecast:true` which silently coerces values and auto-creates select options; only the legacy Postgres path is validated |
| DAT-3 | **High** | Data integrity | No idempotency/dedup key on creates; ambiguous write failures are correctly not retried, but a create whose response was lost is unreconcilable; partial 10-record batch success has no compensating rollback |
| DAT-4 | **High** | Compliance | **Data residency unaddressed:** legal-vertical PII (matters, contacts, emails, portal tokens) in US-hosted Airtable, compute in Singapore, zero residency/DPA/GDPR documentation anywhere in the repo |
| DAT-5 | Medium | Audit trail | Control-base mutations (provisioning, team changes, RLS assignments in `src/lib/airtable/control.ts`) are **unaudited** — who changed tenant registry/access, and when, is captured nowhere |
| DAT-6 | Medium | Audit trail | Airtable-mode EXECUTION_LOG appends are best-effort (`logger.warn` on failure) — the designated forensic source is not guaranteed complete; approver stamped by display name, not stable ID |
| DAT-7 | Medium | Concurrency | Proposal execution CAS exists only on the Postgres path; Airtable mode relies on an in-process Set (`recordWriter.ts:946`) — safe only at the mandated single instance; no optimistic-concurrency version marker (7-day proposal TTL = wide lost-update window) |
| DAT-8 | Medium | Tenancy | Customer isolation is structural (base-per-org, fail-loud resolution) — strong; but the shared control base is only *logically* isolated via `filterByFormula`, and is a single corruption/rate-limit blast radius for all tenants |
| DAT-9 | Medium | Capacity | Airtable's ~50k records/base ceiling is unmonitored — a data-rich tenant (legal org already at ~3,000 matters) hits the plan cap silently |
| DAT-10 | Medium | Retention | No retention policy; deletes are hard-deletes; wipe-script guard keys only on `NODE_ENV` |
| DAT-11 | Low | Schema mgmt | Two Prisma schemas coexist with the dev variant newer than canonical; drift detection between template and client bases is mature but report-only |

**Positive controls:** single gated write chokepoint; post-write reconciliation (prior Critical gap, now verified closed — `src/lib/platform/reconciliation.ts`); append-only execution log; write-safe retry policy; immutable AI snapshots; mature schema-drift detection; dual-path writer preserved as the migration-away escape hatch.

### Action log

| Priority | Action item |
|---|---|
| P1 | Schedule the DR export daily (GitHub Actions cron or n8n) for every live base + control base + templates; ship to durable storage; run one documented restore drill |
| P1 | Zod-validate the Airtable write path (parity with Postgres path) |
| P2 | Add externalId/idempotency keys on creates; handle partial batch failure |
| P2 | Audit-log control-base mutations; stamp approver by stable identity |
| P2 | Produce a data-residency/PII position for the legal vertical (DPA, residency statement, field classification) |
| P3 | Monitor per-base record counts against the plan ceiling; define retention policy |

---

## Phase 6 – Performance review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| PER-1 | **High** | Query efficiency | "Uncap" behavior: `maxRecords ≥ 100` silently becomes fetch-ALL-pages (`src/lib/airtable/client.ts:40`). The dashboard fetches ~3,000 jobs (~30 sequential 220ms-paced pages ≈ 6.6s) **to render six**; assistant context does the same. Projects list already has the fix (`SERVER_PAGINATE_ABOVE=500`) — dashboard/assistant don't use it |
| PER-2 | **High** | AI latency | 10–15 limiter-paced Airtable reads per chat message, several uncapped (ISSUES/DECISIONS/CORRECTIONS at maxRecords:1000), all blocking before the first token streams; scoped viewers pay full JOBS scans |
| PER-3 | **High** | Scalability | Single-instance by construction: per-process limiter (4.5 req/s/base), caches, proposal claim, scheduler lock. **Nothing mechanically prevents setting Render instances >1**, which would immediately exceed Airtable's 5 req/s/base cap → sustained 429 outage. Control base is the shared bottleneck at scale. No load-testing evidence |
| PER-4 | Medium | Query limits | Detail pages build `OR(RECORD_ID()=…)` formulas in the GET query string — a matter with >~500 linked children exceeds the URL bound; latent cliff exactly for the data-rich legal vertical |
| PER-5 | Medium | Concurrency | Nav-count snapshot recompute is stampede-prone on write-back: concurrent cold-cache users each issue a registry update, invalidating and re-reading; worst on free-tier cold starts |
| PER-6 | Medium | Client-side work | Action Hub materializes/filters/facets/groups up to 1,000+ rows in memory per request (`force-dynamic`, no cross-request memoization); no server-pagination fallback outside the projects list |
| PER-7 | Low | Frontend | Bundle risk well-contained: three.js code-split in UC1 only; geotiff server-external; UC1 heavy deps don't leak into `/app` routes |
| PER-8 | Low | Caching | Perf layer is genuinely good: promise-storing TTL caches (real stampede protection per key), write invalidation by prefix, bounded eviction; one unbounded Map in UC1's paid-API cache (growth bounded by distinct addresses) |

Key numbers: limiter 220ms/req = 4.5 req/s per base (Airtable cap 5); read cache 15s; control/nav/assistant-context caches 60s; retry 4 attempts with 30s per-attempt timeout; stream backstop 300s.

### Action log

| Priority | Action item |
|---|---|
| P1 | Extend server-side pagination/snapshot strategy to dashboard and assistant context (the projects-list pattern already exists) |
| P1 | Add a mechanical guard against multi-instance deployment (or ship the Redis-backed shared limiter/cache first) |
| P2 | Cap/trim assistant pre-model reads; move heavy context to cached snapshots |
| P2 | Chunk `RECORD_ID()` OR-formulas or move to link-field `filterByFormula` |
| P3 | Coordinate nav-snapshot write-back (single-flight); server-paginate Action Hub above a threshold |

---

## Phase 7 – UX review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| UX-1 | Medium | Accessibility | Coverage thin relative to interactive surface: one `role="dialog"`/`aria-modal` in the codebase; command palette and inline selects lack full listbox/label semantics; only 2 progressbar roles. Positives: global `:focus-visible`, FilterBar focus trap (verified), all images have alt text |
| UX-2 | Low/Medium | Consistency | No shared Dialog/modal primitive — modal focus management is per-component (confirmed gap); otherwise the design system is real and enforced (10-point window checklist, primitives adopted across 30+ files) |
| UX-3 | Low/Medium | Error states | Error boundaries now cover all three surfaces + root; 19 `loading.tsx` including all 12 list windows (prior "frozen navigation" Critical resolved); a few silent-failure admin paths remain unswept |
| UX-4 | Low | Responsiveness | The "never audited" note is stale — 53 files use responsive prefixes, real breakpoints exist; coverage uneven (`md:` barely used), no formal device-matrix QA pass |
| UX-5 | — | Prior Criticals | **All 4 Criticals from the 2026-07-20 UC3 audit verified FIXED in code** (approvals role-gating, cashflow net math, RecordEditor required, learning-rules/exec-log gating) |

### Action log

| Priority | Action item |
|---|---|
| P2 | Build the shared Dialog primitive with systematized focus management |
| P2 | Accessibility pass on command palette, selects, and progress indicators |
| P3 | Formal responsive device-matrix QA; finish the silent-failure sweep from the UC3 audit's High/Medium roadmap |

---

## Phase 8 – Supportability review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| SUP-1 | **High** | Knowledge transfer | **Bus factor = 1:** 256 of 258 commits by a single author; operations depend on ~a dozen bespoke scripts + manual Airtable UI steps that exist only as tribal knowledge. A successor could run the app but not safely operate, onboard an org, or recover from a data incident |
| SUP-2 | **High** | Documentation | README.md is unmodified `create-next-app` boilerplate — it describes Vercel deployment of an app that deploys to Render with Airtable/Clerk; a new engineer learns nothing true from it |
| SUP-3 | Medium | Runbooks | Ops section in `docs/production-readiness-audit.md` is genuinely good (6 incident playbooks, rollback, DR plan, monitoring spec) — but the monitoring is a spec not a deployment, the DR restore is undrilled, and the onboarding runbook (27 lines) is a memory-jog, not an operator document |
| SUP-4 | Medium | Incident mgmt | No error tracking means incident *detection* relies on users reporting; L1/L2/L3 model nonexistent (single operator) |
| SUP-5 | Low | Docs currency | Architecture/spec docs (24 files) are recent, detailed, and honest — a real strength; but debt is externalized into docs and easy to lose track of |

### Action log

| Priority | Action item |
|---|---|
| P1 | Rewrite README to reality; expand the onboarding runbook into a true second-operator document |
| P2 | Run one documented DR restore drill; deploy the already-specced monitoring |
| P2 | Record the manual Airtable ops steps (screenshots/checklists) and the env-var matrix in one place |

---

## Phase 9 – Governance review

### Findings

| ID | Severity | Area | Observation |
|----|----------|------|-------------|
| GOV-1 | **High** | Change management | No CODEOWNERS, no PR template, no branch protection; direct-to-master is the norm (13 merge commits in 258; one GitHub PR ever); combined with the unverified CI-gate toggle, changes can reach production with no review and potentially no green CI |
| GOV-2 | **High** | Risk management | Governance rollout's critical path (RLS enforcement, ~1,900-record vocab retag, RBAC taxonomy) is gated on a single named Product Owner's sign-off — a process bottleneck leaving security controls fail-open in the meantime |
| GOV-3 | Medium | Standards alignment | RBAC taxonomy mismatch: framework specifies Administrator/Manager/Contributor/Viewer; code ships owner/builder/architect/broker with string-suffix sub-roles; Clerk Organizations not implemented |
| GOV-4 | Medium | Auditability | Admin/write auditability is the *strongest* governance surface (approve-executes-write, append-only EXECUTION_LOG, role-gated approvals) — but control-plane changes (DAT-5) and missing correlation IDs limit forensic completeness |
| GOV-5 | Medium | Secure by Design | Core is genuinely secure-by-design (fail-closed auth, default-deny webhooks, write chokepoint); undermined at the edges by fail-open RLS, the unauthenticated UC1 surface, and `NODE_ENV`-dependent demo mode |
| GOV-6 | Low | Ownership | Platform ownership implicit in one person; no on-call, SLA, or support-tier definition for paying tenants |

### Action log

| Priority | Action item |
|---|---|
| P1 | Enable branch protection + require PRs and green CI on `master`; add CODEOWNERS |
| P1 | Unblock the Product-Owner sign-off queue (decision log) so RLS enforcement and retag stop being fail-open |
| P2 | Reconcile the RBAC taxonomy (framework vs code) and document the mapping as the accepted standard |
| P3 | Define an operating model: ownership, support tiers, SLA for tenants |

---

# Executive summary

**Enterprise Readiness Score: 63/100** — a well-engineered core wrapped in immature operations.

| Category | Score | One-line rationale |
|---|---|---|
| Architecture | 76 | Disciplined layering, clean seams, strong write chokepoint; dragged down by the in-flight dual data layer and the half-retired UC1 stack |
| Security | 66 | Fail-closed auth, exemplary webhook HMAC, layered authz; but an unauthenticated public API surface, fail-open RLS, and no rate limiting |
| DevOps | 48 | Real CI and credible rollback; but no enforced deploy gate, no monitoring, free-tier infra, health check unwired, zero AI cost visibility |
| Data | 58 | Structural tenant isolation, reconciliation, append-only audit; but **no automated backups**, unvalidated live write path, residency unaddressed |
| Performance | 60 | Genuinely good cache/limiter design; but full-table scans on the hottest paths and a hard, unguarded single-instance ceiling |
| UX | 74 | All prior Criticals fixed, design system enforced, loading/error states solid; accessibility depth and Dialog primitive remain |
| Operations | 50 | Excellent written runbooks; almost nothing operationally live (no alerts, undrilled DR, silent scheduler SPOF), bus factor of 1 |
| Governance | 52 | Best-in-class write auditability; but direct-to-master change management and security controls stuck fail-open behind one person's sign-off |

## Top critical risks

1. **SEC-1 — Unauthenticated UC1 public API**: 11 routes with no auth, unvalidated DB writes, and paid third-party API calls (financial DoS by anyone with the URL).
2. **DAT-1 — No automated backups of the system of record**: the export script exists but nothing runs it; actual RPO is unbounded for all tenant data, and the restore path has never been drilled.
3. **PER-3 — Unguarded single-instance ceiling**: one dashboard setting (Render instance count >1) causes an immediate, sustained Airtable 429 outage; nothing mechanical prevents it.

## Top high risks

- **SEC-2** Plaintext live credentials on the workstation (rotate + scope).
- **SEC-3 / GOV-2** Project RLS built, verified, and fail-open — blocked on sign-off, not engineering.
- **DEV-1** CI is not an enforced deploy gate; **GOV-1** direct-to-master with no branch protection.
- **DEV-2/3** Free-tier hosting with the real health endpoint unwired to Render.
- **DEV-4** No error tracking/monitoring of any kind; **DEV-7** scheduler is a silent SPOF (DLQ stops draining unnoticed).
- **DEV-5** No fail-fast env validation (~40 vars, 25 files); `PLATFORM_ENCRYPTION_KEY` undeclared in render.yaml.
- **DEV-6** Zero AI token/cost accounting on an agentic product.
- **DAT-2/3** Live write path skips schema validation; no create idempotency.
- **DAT-4** Legal-vertical PII residency/compliance position nonexistent.
- **PER-1/2** Full-table scans on dashboard and assistant (6.6s+ for the 3,000-matter org).
- **SUP-1/2** Bus factor of 1 with a boilerplate README and a 27-line operator runbook.
- **ARC-1** Dual read-path data layer doubles the cost and risk of every change until migration completes.

## Consolidated action register

| Priority | Area | Action item | Severity addressed |
|---|---|---|---|
| P0 | Security | Gate or disable the UC1 public API | Critical (SEC-1) |
| P0 | Data | Schedule daily DR exports (all live bases + control base) to durable storage; drill one restore | Critical (DAT-1) |
| P0 | Ops | Add a mechanical guard against >1 instance (or note in Render + alert on instance count) | Critical (PER-3) |
| P1 | Security | Rotate/scope workstation credentials | High (SEC-2) |
| P1 | Security | Flip `PROJECT_RLS_ENFORCE` per live org | High (SEC-3) |
| P1 | DevOps | Paid Render plan; `healthCheckPath: /api/health`; verify CI-gate toggle | High (DEV-1/2/3) |
| P1 | DevOps | Sentry at `logger.emit` + external uptime monitor + scheduler-absence alert | High (DEV-4/7) |
| P1 | Governance | Branch protection, required PRs + green CI, CODEOWNERS | High (GOV-1) |
| P1 | Supportability | Rewrite README; expand operator runbook | High (SUP-1/2) |
| P2 | Data | Zod-validate Airtable writes; create idempotency keys; audit control-base mutations | High/Med (DAT-2/3/5) |
| P2 | Performance | Server-paginate dashboard + assistant context (pattern exists in projects list) | High (PER-1/2) |
| P2 | DevOps | Fail-fast env module; declare `PLATFORM_ENCRYPTION_KEY`; AI usage/cost metering | High/Med (DEV-5/6, SEC-11) |
| P2 | Security | Inbound rate limiting; genericize client error bodies; CSV sanitization | Medium (SEC-5/6/8) |
| P2 | Compliance | Data-residency/PII position for the legal vertical | High (DAT-4) |
| P3 | Architecture | Complete read-path migration; decide UC1 retire-vs-integrate; telemetry on swallowed catches | Med (ARC-1/3/4) |
| P3 | UX | Shared Dialog primitive; accessibility pass; responsive QA matrix | Med (UX-1/2/4) |
| P3 | Governance | RBAC taxonomy reconciliation; operating/support model definition | Med (GOV-3/6) |

## Go/No-Go assessment

**GO WITH CONDITIONS** — for the platform surface (`/app`, portal, webhooks) on a single always-on instance.

The engineering fundamentals are strong: fail-closed authentication, a single validated-and-audited write chokepoint with human-in-the-loop approval, structural base-per-tenant isolation, post-write reconciliation, real CI, and honest self-documentation. The prior internal audit's fixes were verified as actually landed (with two exceptions: the health-check pointer and backup scheduling are *built but not wired*).

**Mandatory conditions before production traffic:**
1. Close the three Criticals (UC1 gate, scheduled backups, instance-count guard).
2. Land the P1 register: credential rotation, RLS enforcement, paid plan + health-check wiring + verified CI gate, error tracking + uptime alerting, branch protection.
3. Accept in writing the residual risks: single-operator bus factor, US-hosted PII pending a residency position, and the Airtable scaling ceiling (~100 users/handful of orgs until the Redis work).

**NO GO** — for the UC1 surface in its current unauthenticated form, and for any horizontal scaling (>1 instance) until shared rate-limiting/caching exists. Both boundaries are explicitly documented in the codebase itself.
