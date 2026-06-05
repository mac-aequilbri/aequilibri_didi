# Memory Architecture — implementation notes

Implements the six-layer memory model from *aequilibri — Memory Architecture & Platform
Intelligence (June 2026)* inside this Next.js + Prisma app. Local/dev = SQLite; production
target = Airtable (migration plan below).

## What's built (UC1 prototype — the full learning loop)

| Memory type | Where it lives now |
|---|---|
| **Semantic** (what's true) | `Uc1LearningRule` (validated, auto-applied), `Uc1RateCard`, constants |
| **Episodic** (what happened) | `Uc1Job`, `Uc1Correction`, `Uc1ExecutionLog`, `Uc1Quote` |
| **Procedural** (how we do it) | the services pipeline (`roof-drawing`, `pricing`, `geoscape`, …) |
| **Working** (active now) | the wizard session state + Claude context |
| **Prospective** (committed) | `Uc1Hypothesis.promoteToRule`, action items |
| **Contextual Intelligence** (the moat) | `Uc1IntelligenceSnapshot` + accumulated rules |

**The loop** (`src/services/uc1/learning.ts`):
1. `recordCorrection()` — estimator overrides AI (e.g. roof-plan "Use these measurements") → `Uc1Correction` with AI vs human value + variance + root cause.
2. `runHypothesisEngine()` — clusters corrections by dimension + root cause; forms/updates `Uc1Hypothesis` (sample count, avg variance, confidence).
3. Human gate 1 — approve hypothesis (`setHypothesisStatus`).
4. `promoteHypothesisToRule()` — human gate 2 → `Uc1LearningRule` with a parsed `adjustment` (area/dimension multiplier or contingency %).
5. `applyRules()` — at quote creation, matching rules adjust the estimate and increment `timesTriggered`/`confidence`; **auto-apply** at confidence > 85 & triggers > 50.
6. `snapshotIntelligence()` — accuracy rate, active rules, avg confidence, gaps.

UI: **`/uc1/intelligence`** — snapshot metrics, rules table, hypotheses (approve/promote), corrections log, with Run-engine / Snapshot / **Seed-demo** controls. Rule firings are stamped into the quote's notes ("Applied learning rules: LRN-0001").

Verified on dev.db: 6 corrections → hypothesis (conf 72) → rule LRN-0001 (valley_lm ×1.39), fired & confidence compounding.

## Three-tier mapping (per the doc)

- **Core** (identical every instance): `LearningRule`, `Hypothesis`, `Decision`, `ActionItem`, `ExecutionLog`, `Correction`, `Job`, `Contact`, `Document`, `IntelligenceSnapshot`, (+ `Organisation`, `Workstreams` — to add).
- **Domain Extension** (roofing vertical): `Quote`, `RateCard`, `Vendor`, `VendorMaterialPrice`, `BuildingFootprint`, `ReferenceData` (to add).
- **Customer Configuration**: `PRICING` values, `TEAM`, `REGIONS`, `NOMENCLATURE` (per-tenant — UC3 `Tenant` model is the hook).

## Production migration plan → Airtable

The Prisma layer is the system of record in dev; Airtable becomes the prod store per the doc's
per-customer-base model. Plan:

1. **Map models → Airtable tables 1:1.** Each Prisma model = one Airtable table; fields keep the
   same names. Relations become Airtable "Link to record" fields (e.g. `Correction.hypothesisId`).
2. **Clone the Master Template base** (`appIf959oh38fgKYp`) per customer; Core tables empty,
   Domain Extension pre-populated with roofing reference data, Customer Configuration seeded with
   that customer's PRICING/TEAM/REGIONS.
3. **Introduce a storage adapter.** Add `src/lib/memory-store.ts` with one interface
   (`getRules`, `recordCorrection`, `upsertHypothesis`, `createRule`, `snapshot`, …) and two
   implementations: `PrismaStore` (dev) and `AirtableStore` (prod, via Airtable REST/MCP).
   Select by env (`MEMORY_BACKEND=prisma|airtable`). The learning service calls the interface, not Prisma directly.
4. **Per-customer base id** comes from the tenant config (one Airtable base per customer = the doc's privacy/auditability model).
5. **Backfill**: a one-off exporter pushes existing Prisma rows into the customer's base.
6. **Keep the loop server-side** (Next route handlers / actions) so Airtable API keys never reach the browser; respect Airtable rate limits with batching + the existing TTL cache.

**Why an adapter rather than rewriting:** the loop logic (clustering, promotion, confidence,
rule application) is storage-agnostic. Only the read/write calls change, so dev stays fast on
SQLite while prod runs on Airtable with no logic divergence.
