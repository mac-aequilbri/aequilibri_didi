# Production Readiness Audit — 2026-07-25

Full-codebase audit (security, performance, scalability, reliability, observability, DevOps, testing) plus the hardening fixes applied the same day. Four parallel deep audits fed this report: security/auth, data/API layer, frontend/reliability, infra/CI/testing.

## Scores

| Dimension | Score | Rationale |
|---|---|---|
| **Production Readiness (overall)** | **66/100** | Solid engineering core; blocked by infra tier, missing error tracking, and the public UC1 surface |
| Security | 74 | Fail-closed auth, HMAC webhooks, no injection/XSS found; UC1 API unauthenticated, no inbound rate limiting, RLS fail-open |
| Scalability | 45 | Architecture is single-instance by construction (per-process rate limiter/caches/locks); Airtable's 5 req/s/base is a hard ceiling |
| Reliability | 68 | Retry/backoff + timeouts + atomic approval claim now in place; free-tier spin-down and unscheduled backups remain |
| Software Quality | 78 | Typecheck/lint clean at zero warnings, 213 passing tests, disciplined write path, honest comments |
| Maintainability | 75 | Single choke points (writeRecord, logger, webhookAuth); scattered `process.env` reads and ~20 raw `console.*` calls |

## Risk heatmap

| Area | Critical | High | Medium | Low |
|---|---|---|---|---|
| Security | — | UC1 public API; no rate limiting | plaintext local secrets (rotate); RLS fail-open; ~~webhook body DoS~~ ✅ | ~~timing-unsafe Bearer~~ ✅ ~~headers~~ ✅ ~~storage prefix~~ ✅ formula escaping |
| Data layer | ~~no retry/backoff~~ ✅ multi-instance rate limiter; ~~approval TOCTOU~~ ✅ | lost-update overwrites; Claude errors as content (now logged); ~~cache leak~~ ✅ full-table detail reads; Airtable writes skip Zod; ~~scheduler overlap~~ ✅ | cross-instance cache staleness; write-path latency chains; orgId max+1 race | fail-soft catches hide outages |
| Frontend | — | ~~approval double-write~~ ✅ ~~stream disconnect kills mid-write~~ ✅ | ~~portal error boundary~~ ✅ ~~uc1 boundaries~~ ✅ ~~not-found~~ ✅ ~~portal indexable~~ ✅ soft-nav dirty-form loss | stream fetch timeout; client stack logging |
| Infra/ops | ~~unguarded wipe script~~ ✅ no *scheduled* backups (script now exists) | free tier; ~~false-positive health check~~ ✅ (render.yaml pointer pending); ~~next CVEs~~ partially ✅; no fail-fast env validation | no error tracking (Sentry); ~~money untested~~ ✅ recordWriter untested; non-hermetic tests; pptx in git | no staging env; Node version drift; CI-gate toggle unverified |

## Implemented fixes (this session — all verified: tsc ✅ lint ✅ 213 tests ✅ build ✅)

1. **Airtable retry/backoff + request timeouts** — `src/lib/airtable/client.ts`. 4 attempts, exponential backoff with full jitter, honors `Retry-After` on 429 (all methods — 429 is never-applied); 5xx/network retries for GET only (writes could double-apply). 30s per-attempt `AbortSignal.timeout` so a hung socket can't pin a rate-limiter slot. Retries re-enter the per-base throttle. *Eliminates the dominant class of production 500s and silent webhook drops.*
2. **Bounded caches** — `src/lib/airtable/ttlCache.ts`. Lazy sweep every 100 inserts + 5,000-entry bound with oldest-first eviction. *Stops the slow per-process memory leak (per-record/per-filter keys never re-requested were never freed).*
3. **Atomic proposal claim** — `src/lib/platform/recordWriter.ts`. In-process claim registry serializes execute/reject per proposal (kills the double-click/two-tab double-write); Postgres path additionally does a true CAS (`updateMany` guarded on `status:"proposed"` → `"executing"`); reject is CAS-guarded so it can't clobber an executed proposal. Airtable status vocabulary untouched (no select-option drift).
4. **Stream disconnect safety** — assistant + chat `stream/route.ts`. A client disconnect no longer throws *inside* `sendChatMessage` at an arbitrary persistence point (Airtable has no transactions): event delivery becomes a no-op and the turn's writes complete. Raw error text no longer crosses the wire (generic marker; detail stays server-side). `maxDuration = 300` backstop added.
5. **Anthropic client hardening** — `src/lib/claude.ts`. Module singleton with explicit `timeout: 180s` (SDK default ~10 min exceeded every route budget) and `maxRetries: 2`; model id env-overridable via `ANTHROPIC_MODEL`; API failures now logged through `logger` (previously fully silent).
6. **Timing-safe cron auth** — `bearerAuthorized()` in `src/lib/platform/webhookAuth.ts` (HMAC-then-`timingSafeEqual`, leaks neither content nor length), adopted by `/api/platform/scheduler` and `/api/platform/ingest-inbox`.
7. **Webhook DoS caps** — `/api/platform/hooks`: 25 MB body limit (pre-buffer via Content-Length + post-buffer backstop), 20-attachment cap; 413 responses.
8. **Scheduler overlap guard** — `src/services/platform/scheduler.ts`: one run at a time per instance; a concurrent trigger returns a marker result instead of duplicating snapshots/report drafts.
9. **Global security headers** — `next.config.ts`: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off — verified unused). BIMx frame-src CSP kept.
10. **Real health endpoint** — `src/app/api/health/route.ts`: config checks (Airtable PAT when migration on; Clerk-complete-or-explicit-demo) on every hit; `?deep=1` adds Airtable reachability via `meta/whoami`, memoized 60s. 503 on failure. **Pending (uncommitted render.yaml belongs to another session): point `healthCheckPath` at `/api/health`.**
11. **Guarded wipe script** — `scripts/reset-platform-orgs.mjs`: refuses `NODE_ENV=production`, requires `--yes`, prints the (credential-masked) target DB first.
12. **DR export script** — `scripts/airtable-export-backup.mjs` (new): dumps every table + schema of given bases to timestamped JSON, rate-limit-paced, retry-safe. Needs scheduling (see DR plan).
13. **Error/404 surfaces** — new `src/app/(public)/error.tsx` (branded portal failure card), `src/app/(uc1)/uc1/error.tsx` + `loading.tsx`, root `src/app/not-found.tsx` (22 `notFound()` call sites previously rendered Next's unstyled default).
14. **Portal noindex** — `robots: {index:false, follow:false}` on `/portal/[token]`; token URLs were crawlable.
15. **Storage containment** — `src/lib/platform/storage.ts`: `path.relative`-based check (prefix `startsWith` accepted sibling dirs like `var/storage-x`).
16. **Dependency patches** — `next` 16.2.6 → 16.2.11 (+ matching eslint-config-next); `npm audit fix` cleared the `linkify-it` quadratic-DoS advisory in mailparser (reachable: it parses attacker-supplied email). Remaining: postcss/sharp advisories bundled inside *every* current Next release (no non-breaking fix exists; postcss issues are build-time-only, sharp backs next/image which this app doesn't use).
17. **Money-math tests** — `src/lib/money.test.ts`: 9 tests covering half-up boundaries (1.005, 2.675, 0.125), negatives, large amounts, GST identities. The header's "matches every validated worksheet" claim is now enforced.

## Recommended fixes (not applied — risky, infra-dependent, or owned by another session)

**Before go-live (conditions):**
- **R1. Upgrade Render off `plan: free`** — spin-down = 30–60s cold starts for customers. (render.yaml is uncommitted from another session; edit there.) Also set `healthCheckPath: /api/health` and verify the dashboard's "Auto-Deploy after CI passes" toggle is actually on.
- **R2. Rotate the local `.env` credentials** (Anthropic key, Airtable PAT, Geoscape secret) — never committed to git (verified), but they live in plaintext on a workstation and were readable by every process. Restrict the Google Maps key by referrer; confirm the PAT scope is truly read-only or split read/write PATs.
- **R3. Gate or kill the UC1 public API** — every `/api/uc1/*` route is unauthenticated, several are DB writes with no validation, and solar/lidar-analyze burn paid third-party quota (cost-amplification). Extend the proxy matcher (proxy.ts is uncommitted from another session) or add a token gate. If UC1 isn't part of the enterprise offering, disable it via the existing `UC1_ENABLED` kill-switch.
- **R4. Error tracking** — install Sentry (or similar) and wire it into `logger.emit` (single-sink design makes this a one-file change); add a request-id/correlation field; replace the ~20 raw `console.*` calls in platform actions.
- **R5. Flip `PROJECT_RLS_ENFORCE`** per seeded org — RLS is feature-complete but fail-open by default; a low-privilege member currently sees every job in their org until enforcement is on.
- **R6. Schedule backups** — run `scripts/airtable-export-backup.mjs` daily (GitHub Actions cron or n8n) against every live base + the control base; ship output to durable storage (S3/Drive). Airtable trash/snapshots alone are not a DR story.

**Soon after:**
- **R7. Inbound rate limiting** — per-IP/token buckets on `/api/platform/*`, portal token lookup, and any UC1 survivors (Upstash or an edge bucket; in-memory versions are per-instance only).
- **R8. Optimistic concurrency on proposals** — capture a version marker (Airtable `Last_Modified_Time` / Postgres `updatedAt`) at proposal time; refuse execution when the target changed (7-day TTL is a wide lost-update window).
- **R9. Zod-validate the Airtable write path** — the system-of-record path relies on `typecast:true` (silently coerces, auto-creates select options); Postgres path is validated, parity is missing where it matters.
- **R10. Cap the dashboard/assistant full-table reads** — `loadJobsList` fetch-all runs on every dashboard/assistant render (~30 sequential requests / ~6.6s for the 3,000-matter legal org); extend the `SERVER_PAGINATE_ABOVE` strategy there, and replace the 3 detail-page full-child-table scans in `uc1Source.ts` with `filterByFormula` on the link field.
- **R11. Fail-fast env module** — a zod-validated `src/lib/env.ts` imported early; today a missing `AIRTABLE_PAT` is a runtime 500 on first request, not a boot failure. (56 scattered `process.env` reads across 25 files.)
- **R12. Claude error laundering** — `claude.ts` catch blocks return error text as if it were model output (now at least logged); callers can persist it as AI analysis. Move to a discriminated `{ok:false}` result.
- **R13. Test hermeticity + recordWriter coverage** — 3 suites hard-require Postgres at localhost:5432 (red locally, green in CI); make them skip without `DATABASE_URL`. Add direct unit tests for `recordWriter` (~70 importers, indirect coverage only).
- **R14. Multi-instance readiness** (before scaling past 1 instance): shared rate limiter + cache (Redis) or pin Airtable work to a worker; the in-process proposal claim, scheduler lock, and read caches are all per-process. **Do not scale horizontally until this is done — N instances × 4.5 req/s blows Airtable's 5 req/s/base cap and today that means sustained failures.**
- **R15. Housekeeping** — untrack the CEO showcase .pptx; add `.nvmrc`; define a staging/preview environment; add a `staleTimes`/soft-nav dirty-form guard to RecordEditor.

## Scalability assessment (growth scenarios)

- **100 users / handful of orgs (today's shape):** fine after R1. Single instance, per-base rate limiting, snapshot-served nav badges all hold.
- **1,000 users:** needs R7, R10, R14, and the scheduler moved off request handlers to a worker. Airtable per-base limits still hold because tenancy is base-per-org.
- **10,000 users:** the **control base** becomes the bottleneck — every request from every instance resolves org/team/assignments against one shared base at 5 req/s. Requires a shared cache layer (Redis) in front of the control plane, or moving the control plane to Postgres (the code already dual-paths).
- **100,000 users:** not reachable on Airtable as the system of record. This is an explicit architectural trade (per-org bases, human-in-the-loop ops) — the platform would need its Postgres path promoted back to primary with Airtable as a sync target. The dual-path `recordWriter` design keeps that door open; treat it as the known ceiling, not a defect.

## Single points of failure

1. **Airtable** (system of record, no fallback) — mitigations: retry/backoff ✅, health visibility ✅, scheduled exports (R6), documented restore (below).
2. **The control base** (org registry/team/assignments for *all* tenants) — one base, one rate limit, one corruption blast radius. Include it in every backup run.
3. **Single Render instance** — acceptable now (and *required* until R14), but instance death = downtime until restart; Render auto-restarts.
4. **Anthropic API** — degraded gracefully (demo-mode fallbacks, now-logged errors), not a hard SPOF.
5. **CRON_SECRET holder (GitHub Actions)** — scheduler stops silently if the workflow is disabled; alert on scheduler-run absence (monitoring spec below).

---

# Operations artifacts

## Runbook

**Deploy:** push to `master` → GitHub Actions CI (sqlite prisma push → typecheck → lint → vitest → build) → Render auto-deploy. *Verify the Render dashboard has Auto-Deploy set to "After CI Checks Pass."*
**Health:** `GET /api/health` (config), `GET /api/health?deep=1` (adds Airtable reachability, 60s memo). 503 = investigate before anything else.
**Common incidents:**
- *Every /app route 503:* Clerk keys missing/half-set on Render (fail-closed by design). Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` both present.
- *Airtable 429 storms:* check instance count (must be 1 until R14); check for runaway scripts sharing the PAT; retry layer absorbs bursts, sustained storms mean quota math changed.
- *Webhook events not landing:* `/api/platform/hooks` 403 = channel connection missing/inactive in control base, or transient control-base read failure (now retried); 401 = HMAC/skew — check sender clock and per-org secret; 413 = payload over 25 MB.
- *Scheduler silent:* GitHub Actions workflow disabled or CRON_SECRET rotated on one side only. Concurrent-run skips report `"Scheduler run already in progress — skipped"` in the response errors array.
- *Stuck proposal (Postgres mode) in `executing`:* process died mid-write; inspect the record, then manually set `failed` or `executed` after verifying whether the write landed.

## Incident response

1. Classify: data-layer outage (health deep-check red) / auth outage (503s) / bad deploy (errors spike after deploy) / security event.
2. For bad deploys: Render → previous deploy → "Rollback" (image-level, instant). DB/Airtable schema changes are additive by convention — rollbacks are code-only.
3. For suspected data corruption: stop the scheduler (rotate CRON_SECRET), snapshot the base (Airtable UI → duplicate base) *before* investigating, restore from the latest export if needed.
4. For leaked credentials: rotate in Render dashboard (all secrets are `sync:false` — no repo change needed); Airtable PAT rotation invalidates the old token immediately.
5. Record a timeline; the append-only EXECUTION_LOG and audit rows are the forensic source.

## Rollback strategy

- **Code:** Render deploy rollback (previous image) — no build wait. CI keeps `master` releasable; never deploy around a red CI.
- **Schema (Airtable):** additive-only changes (the extend scripts follow this); a rollback never requires deleting columns. Table renames are the exception — sequence them behind code that reads both names.
- **Proposals/writes:** the approve-executes-write queue means bad AI writes are individually visible in EXECUTION_LOG and reversible record-by-record; CORRECTIONS rows track manual fixes.

## Backup & DR plan

- **What:** every live org base + the control base + both template bases.
- **How:** `node scripts/airtable-export-backup.mjs <baseIds…>` — JSON per table + schema.json per base, timestamped.
- **Cadence:** daily via GitHub Actions cron (upload artifact to durable storage); weekly Airtable-native base snapshot (UI) as a second format.
- **Restore:** create base from template → replay JSON via the Airtable API (schema.json documents field types); for single-table damage, restore just that table's JSON. Target RPO 24h, RTO half a day. Postgres (UC1/legacy) relies on the provider's PITR — confirm it's enabled on the production instance.

## Monitoring dashboard spec

| Signal | Source | Alert |
|---|---|---|
| `/api/health?deep=1` status | uptime monitor (60s) | 2 consecutive 503s |
| p95 latency `/app/*` | Render metrics | > 3s sustained 10m |
| 5xx rate | Render logs / Sentry (R4) | > 1% of requests, 5m |
| AirtableError 429 count | structured logs (`logger`) | > 10/min sustained |
| Scheduler runs | absence detection | no run in 2h |
| Outbox DLQ depth | PLAT_OUTBOX dead-lettered | > 0 |
| Anthropic error rate | "Claude … call failed" log lines | > 5/min |
| Proposal age | PENDING_WRITES proposed > 5 days | daily digest |
| Backup job | Actions workflow status | any failure |

---

## Go-live decision

**⚠ Ready with Conditions** — for the platform surface (`/app`, portal, webhooks), on a single always-on instance, after: **R1** (paid plan + health-check pointer + CI-gate toggle), **R2** (rotate local secrets), **R3** (close or gate the UC1 public API), **R4** (error tracking), **R5** (flip RLS enforce for seeded orgs), **R6** (schedule backups). The UC1 surface as it stands is **❌ not ready** for public exposure. Horizontal scaling is **❌ not supported** until R14.

The core engineering is genuinely strong — fail-closed auth, a single validated write choke-point with approval flow and append-only audit, exemplary HMAC webhook auth, tenant isolation enforced mechanically, real CI. The gaps were concentrated in operational hardening (resilience, observability, infra tier), and the resilience half of that list was closed in this session.
