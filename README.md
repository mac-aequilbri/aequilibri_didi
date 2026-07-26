# aequilibri-next

Multi-tenant AI-assisted operations platform for project-based businesses (construction, roofing, legal verticals). Next.js 16 App Router + TypeScript, **Airtable as the system of record** (one base per client org + a shared control base), Clerk authentication, Anthropic-powered assistant/agents, deployed on **Render**.

## Architecture in one paragraph

UI (server components, `src/components`) → server actions / API routes (`src/app`) → data-source layer (`src/lib/platform/*Source.ts`) → Airtable client with per-base rate limiter + TTL caches (`src/lib/airtable`). All writes funnel through one chokepoint, [recordWriter.ts](src/lib/platform/recordWriter.ts) (role/RLS gating, approval queue, append-only EXECUTION_LOG, post-write reconciliation). Prisma/Postgres remains as the legacy dual path (`AIRTABLE_MIGRATION` flag). Full details: [docs/PLATFORM_ARCHITECTURE.md](docs/PLATFORM_ARCHITECTURE.md).

## Local development

```bash
npm ci
npm run dev        # http://localhost:3000
```

Without any secrets the app runs in **demo mode** (fixture data, no Clerk, no Airtable). Copy real values into `.env` to activate integrations — every var and its activation behavior is documented in [render.yaml](render.yaml). Key switches: `AIRTABLE_MIGRATION` + `AIRTABLE_PAT` (live data), Clerk key pair (auth — fails closed in production without them), `ANTHROPIC_API_KEY` (live AI).

```bash
npm run typecheck && npm run lint && npm test   # the CI gate, locally
```

## Deployment

Push to `master` → GitHub Actions CI ([ci.yml](.github/workflows/ci.yml)) → Render auto-deploy per [render.yaml](render.yaml) (single instance — **do not scale >1**; see the `numInstances` note there). Health: `GET /api/health` (`?deep=1` adds Airtable reachability). Hourly automation via [scheduler.yml](.github/workflows/scheduler.yml); daily Airtable DR export via [backup.yml](.github/workflows/backup.yml).

## Operations

- **Runbook, incident response, rollback, DR:** [docs/production-readiness-audit.md](docs/production-readiness-audit.md) (Operations artifacts section)
- **Enterprise audit + action register:** [docs/enterprise-audit-2026-07-26.md](docs/enterprise-audit-2026-07-26.md)
- **Client onboarding:** [docs/module1-onboarding-runbook.md](docs/module1-onboarding-runbook.md)
- **Design system / UI conventions:** [docs/design-system.md](docs/design-system.md)
- Operational scripts live in `scripts/` (Airtable schema/seeding, `airtable-export-backup.mjs`, guarded `reset-platform-orgs.mjs`)

## Repo map

| Path | What |
|---|---|
| `src/app/(platform)` | Multi-tenant platform (`/app/[org]/…` — dashboards, approvals, cashflow, reports, assistant) |
| `src/app/(uc1)` | Legacy roofing app (auth-gated with the platform) |
| `src/app/(public)` | Landing + client portal (`/portal/[token]`) |
| `src/lib/airtable` | Airtable client, rate limiter, caches, control-base registry |
| `src/lib/platform` | Auth/org context, RLS, recordWriter, sources, crypto, logger |
| `src/services` | Domain services (assistant/agents, documents, scheduler, construction) |
| `docs/` | Architecture, audits, plans, runbooks |
