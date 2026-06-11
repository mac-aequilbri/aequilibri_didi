# aequilibri Platform — Module Architecture

Status: **alignment draft** for team review. Describes the agreed module structure and maps the
*current* code (UC1 / UC2 / UC3) onto it. This is a reference to design against — it does **not**
itself change any code. Where current behaviour is inferred from code review rather than confirmed,
it is marked ← ASSUMPTION.

---

## 1. The model: 8 modules (5 in the value chain, 3 across it)

> Reconciliation note: the original brief said *"seven modules — three in the value chain, four
> across it,"* but the body listed five value-chain modules and three enabling layers. This doc
> adopts **8 = 5 + 3**, because the two promotions (Data Ingestion and Document Management to full
> modules) justify themselves against the code below.

```
VALUE CHAIN (in sequence)
  1. Customer Onboarding Engine
  2. Data Ingestion & Source Management   ← promoted to full module
  3. Assessment Engine
  4. Document Management                   ← promoted to full module
  5. Project Intelligence Layer            ← reconceived: configurable engagement type

ENABLING LAYERS (across the whole chain)
  6. Learning Loop
  7. Conversational Assistant Layer
  8. Reporting & Visualisation Layer

Flow: Onboard → Ingest → Assess → (Document) → Run the engagement →
      Learning Loop captures corrections → next assessment improves → intelligence compounds.
```

---

## 2. Where the three use cases sit today

| Use case | What it is | Primary module(s) it exercises |
|---|---|---|
| **UC1** Port City Roofing | Roofing measurement + quote (assessment) | **Assessment Engine** (3) + **Data Ingestion** (2) + **Learning Loop** (6) + document outputs (4) |
| **UC2** Didi / Dulong Downs | Single-project AI coordinator | **Project Intelligence** (5, *long-project* type) + **Conversational Assistant** (7) + **Learning Loop** (6, partial) |
| **UC3** MSME Coordinator | Multi-tenant construction PM | **Project Intelligence** (5, *short-job + long-project*) + **Conversational Assistant** (7) + **Reporting** (8) |

**Headline gaps:** UC1 is the only mature Assessment Engine. UC2/UC3 are the Project Intelligence
Layer at two different scales. **No module is shared between them today — three separate schemas,
three separate AI clients' worth of prompt logic, three different auth models.** The architecture's
value is precisely in naming the shared modules so the next domain reuses instead of re-forks.

---

## 3. Module-by-module: responsibility + current implementation + gaps

### 1. Customer Onboarding Engine
**Responsibility:** Instance Setup (internal: clone template, Clerk tenant, Airtable base, wire APIs)
+ Domain Knowledge Initialisation (collaborative: seed REFERENCE_DATA, RATE_CARD, initial
LEARNING_RULES before any job runs).

| Current code | Notes |
|---|---|
| UC3 `Uc3Tenant` + `/uc3/select-tenant` + `setActiveTenant` cookie | Closest thing to tenant provisioning, but it's tenant *selection*, not provisioning. |
| UC1 `src/services/uc1/constants.ts`, rate tables, `footprints.ts` | Hand-seeded reference/rate data — the "Day-1 knowledge" idea, but baked into source, not a configurable base. |
| **Gap** | No documented onboarding checklist, no Clerk, no Airtable. REFERENCE_DATA / RATE_CARD are per-UC and code-resident, not a per-customer initialised base. |

### 2. Data Ingestion & Source Management *(promoted)*
**Responsibility:** all external sources in, and write-back out. APIs, file ingestion, email parsing,
IoT/sensor, satellite/drone. Produces clean structured data for modules 3 and 5.

| Current code | Source type |
|---|---|
| `src/services/uc1/geoscape.ts` | PSMA Geoscape building-footprint API |
| `src/services/uc1/lidar.ts` | GeoTIFF / LiDAR (GA WCS) elevation |
| `src/services/uc1/roofVision.ts`, `staticMap.ts` | Google Maps static + Street View imagery |
| `src/services/uc1/solar.ts` | Google Solar API |
| `src/app/api/uc1/vendor-prices/route.ts` | Vendor material prices |
| `src/lib/uc3-bimx.ts` (`provider` seam) | **Reserved** seam for BIMx-API element/quantity ingestion (built as viewer only). |
| **Gap** | Sources are **fused into the UC1 pipeline**, not behind a clean ingestion boundary — this is exactly the "spaghetti at domain #3" risk the promotion is meant to prevent. UC2/UC3 have **no** external ingestion (all data is manual or AI-generated). No email parsing, no accounting sync (UC3 accounting is simulated). |

### 3. Assessment Engine
**Responsibility:** intake → data-collection cascade (via module 2) → AI/vision analysis → judgment
(LEARNING_RULES) → structured output with confidence + assumptions → document generation. Domain
Extension configures the pipeline per vertical.

| Current code | Maps to step |
|---|---|
| `src/app/api/uc1/detect-features`, `/roof-drawing`, `/lidar-analyze`, `/solar-analyze` | data collection + AI/vision analysis |
| `src/services/uc1/pricing.ts` | judgment + pricing calculation |
| `Uc1RoofPolygon.confidence`, `Uc1RoofLidarAnalysis.lidarCoverage`, `Uc1MeasurementSnapshot.source` | confidence + assumptions surfaced in output |
| `Uc1QuoteSnapshot`, `Uc1RoofConditionReport`, `Uc1PurchaseOrder` (+ `/print` routes) | document generation (the required output) |
| **Gap** | Only UC1 exists. The "invariant pattern" is real but **not yet abstracted** — it's UC1-specific code, not a domain-configurable engine. Construction-tendering / cattle-weight would currently mean a fork, not a config. |

### 4. Document Management *(promoted)*
**Responsibility:** storage references (e.g. Drive URLs in Airtable), version control, classification,
and document intelligence (AI analysis of contracts/specs/submissions). Feeds module 2 (documents as
a source) and module 5 (documents as outputs/records).

| Current code | Notes |
|---|---|
| UC2 `Uc2Document` | **Metadata + external `url` only** ("managed externally, linked for reference") — closest to the target Drive-URL model. No versioning beyond a `version` string. |
| UC3 `Uc3Document` (`fileContent` + `aiAnalysis` + `analyzedAt`) | **Document intelligence exists** (contract clause/obligation/risk analysis via Claude) but stores raw text in a column, 4 000-char analysis cap, no Drive ref, no real version control or classification. |
| UC3 `Uc3BimModel` (just shipped) | A BIMx hyper-model is *also a document/record* — see §4. |
| **Gap** | Two thin, divergent `*Document` tables. Neither has versioning, classification, or Drive-reference storage. This is the strain the promotion names — commercial-construction + insurance are document-heavy. |

### 5. Project Intelligence Layer *(reconceived: configurable engagement type)*
**Responsibility:** manage the engagement after assessment. Same underlying tables/logic; an
**engagement type** feature-flags which capabilities are active and how the UI presents them:
- **Short job** (roof, pool, tile repair): scheduling, materials, crew, invoice. Lightweight.
- **Long project** (residential/commercial build): phases, budget vs actual, cashflow, variations, risk, portal.
- **Ongoing lifecycle** (insurance policy): inception, renewal, endorsement, claims.
- **Seasonal cycle** (farming): enterprise planning, seasonal budgets, inputs, harvest/sale.

| Engagement type | Current embodiment |
|---|---|
| **Long project** | **UC2** (single-project Dulong Downs): `Uc2ProjectPhase`, `Uc2Budget`, `Uc2Cashflow`, `Uc2ActionHub`, `Uc2Decision`, `Uc2Procurement`, `Uc2RoomMatrix`, `Uc2ChangeLog`. |
| **Long project + Short job** | **UC3** (multi-tenant): `Uc3Project`(+`Uc3Phase`/`Uc3Budget`/`Uc3Cashflow`/`Uc3Risk`/`Uc3VariationOrder`/`Uc3ActionItem`/`Uc3Decision`), client portal, weekly reports, **`Uc3BimModel`**. A tile-repair and a new build are *both* `Uc3Project` today — no discriminator. |
| Ongoing lifecycle / Seasonal | **Gap** — not modelled. |

**The alignment finding (this is the crux):** UC2 and UC3 are the **same engagement type
("long project") implemented twice** — UC2 single-tenant, UC3 multi-tenant — with near-identical
tables under different prefixes (`Uc2ProjectPhase` ≈ `Uc3Phase`, `Uc2Budget` ≈ `Uc3Budget`,
`Uc2ActionHub` ≈ `Uc3ActionItem`, `Uc2Decision` ≈ `Uc3Decision`, both have `Cashflow`, `Vendor`,
`ExecutionLog`, chat tables). The reconception's promise — *one set of tables, engagement type
configures features* — is achievable, but only by **converging UC2 and UC3 onto a shared core**,
which they are not today. UC3's multi-tenant `Uc3*` schema is the better-generalised starting point;
UC2 is the single-tenant special case (tenant count = 1). Adding an `engagementType` discriminator to
that shared core is what lets a "short job" (UC3 repair) and a "long project" (UC2 build) share logic.

### 6. Learning Loop *(enabling)*
**Responsibility:** CORRECTIONS → HYPOTHESES → LEARNING_RULES, with a **required root-cause dropdown
(not free text)**, pattern accumulation, confidence scoring, and human review gates before promotion.
Feeds module 5 outcomes back into module 3 judgment.

| Maturity | Current code |
|---|---|
| **Mature** | **UC1** `src/services/uc1/learning.ts`: `recordCorrection(dimension, aiValue, humanValue, rootCause)` → variance; `runHypothesisEngine()` clusters at 3+ samples; rule auto-applies at 85 % confidence + 50 triggers. `Uc1Job`/`Uc1Correction`/`Uc1Hypothesis`/`Uc1LearningRule`. **Root cause is captured.** |
| **Partial** | **UC2** `Uc2Hypothesis` auto-extracted from chat (regex on "should/recommend/…"); `promoteHypothesis` → `Uc2LearningRule` (LRN-####) injected into Didi's system prompt. **No corrections, no confidence, no root cause** — hypotheses come from chat phrasing, not job outcomes. |
| **None** | **UC3** — no corrections, hypotheses, or rules. |
| **Gap** | Three incompatible implementations. UC1 has the real loop (outcome-driven); UC2 has a prompt-injection shortcut; UC3 has nothing. The moat needs **one** loop that feeds from Project Intelligence (5) into Assessment (3). |

### 7. Conversational Assistant Layer *(enabling)*
**Responsibility:** in-context LLM at every stage. **Core requirement:** a "save this" mechanism to
tag any AI response as a DECISION / ACTION / LEARNING_RULES candidate and write it to the system
before the session ends.

| Current code | Notes |
|---|---|
| UC2 `sendMessage` (Didi) + `detectProposal()` + `confirm/rejectProposal` | Closest to "save this": detects proposals, lets user confirm/reject. **But confirming does not execute the write** — UI-only ← ASSUMPTION (UC2_README.md:286). |
| UC3 `sendChatMessage` + `[REQUIRES_APPROVAL]` + `approveMessage` | Same shape, same gap: approving sets a flag; no code path performs the described mutation ← ASSUMPTION. |
| **Gap** | Both stop one step short of the core requirement. Neither persists a tagged DECISION/ACTION/RULE from a chat turn. This is the single highest-leverage shared feature to build once and reuse. |

### 8. Reporting & Visualisation Layer *(enabling)*
**Responsibility:** accuracy reports, budget-vs-actual dashboards, LEARNING_RULES confidence
trajectories, project health, weekly client reports, INTELLIGENCE_SNAPSHOT, regulator/bank outputs.

| Current code | Notes |
|---|---|
| UC3 dashboard (`/uc3`), client portal (`/uc3/portal/public/[token]`), weekly reports, budget-analytics | The most built-out reporting surface. **BIMx viewer now renders here** (portal + project pages). |
| UC2 dashboard (`/uc2`) | Live metrics for the single project. |
| UC1 `/print` routes (condition reports, POs) | Document-style outputs. |
| **Gap** | `healthScore` is set once and never recalculated (UC3); no accuracy reports or rule-confidence trajectories anywhere (because the unified Learning Loop doesn't exist yet). |

---

## 4. Where BIMx lands across the new modules

The BIMx work shipped this session is a **viewer artifact** (item 1 below). The promotions clarify
that a BIMx hyper-model actually touches **three** modules — the canonical-owner decision matters to
avoid re-forking:

| Aspect of a BIMx model | Owning module | Status |
|---|---|---|
| Embedded 3D viewer (project page + client portal) | **8 Reporting/Visualisation** (surfaced via **5 Project Intelligence**) | ✅ **Built** (`Uc3BimModel`, `BimxViewer`, portal section). |
| The model as a record/version/classified artifact | **4 Document Management** | ⛔ Not built. Today `Uc3BimModel` lives in Project Intelligence; under the new taxonomy it is arguably a **Document Management** record. Decision needed: keep in PI, or migrate to the Document module when it's built. |
| Element / quantity data → takeoff / tender | **2 Data Ingestion** → **3 Assessment Engine** | ⛔ Not built. Reserved via the `provider` field + `src/lib/uc3-bimx.ts`. Needs Graphisoft API access; defer until a tendering customer. |

---

## 5. Construction Domain Pack — the first full-chain vertical

A construction + BIMx use case should **not** be framed as a fourth silo ("UC4"). UC1/UC2/UC3 are
three vertical forks (separate schemas, AI logic, auth) — the exact pattern this architecture exists
to escape. Instead it is a **Construction Domain Extension**: one domain configuration that lights up
the *shared* modules end-to-end, selected by **engagement type**. Only the construction-specific
schema and pipeline config are new; the plumbing is reused.

**Why construction is the ideal proof of the platform thesis:** it is the one industry where a single
customer naturally traverses the *entire* value chain — estimate → win → build → hand over → maintain
— so the compounding loop (this job's outcomes sharpen the next job's estimate) has obvious ROI.

### 5.1 Construction lifecycle → module map (AU context)

| Construction stage | Platform module(s) | Engagement type |
|---|---|---|
| **Estimate / tender** — BoQ, takeoff, supplier quotes | Data Ingestion (2) → Assessment Engine (3); doc output | pre-contract |
| **Award / contract** | Onboarding (1, of the job) + Document Management (4) | — |
| **Build / deliver** — phases, budget vs actual, cashflow, variations, RFIs, progress claims, QA/defects, client portal | Project Intelligence (5) | **build** (long project) |
| **Handover / close-out** — as-built model, O&M manuals, warranties, practical completion + DLP | Document Management (4) + Reporting (8) | — |
| **Operate / maintain** — asset register, reactive repairs (e.g. tile change), planned maintenance | Project Intelligence (5) | **maintenance** (short job) / **facilities** (ongoing lifecycle) |
| *Across all stages* | Learning Loop (6: estimating accuracy compounds) · Conversational Assistant (7) · Reporting (8) | — |

### 5.2 BIM as the spine artifact

The BIM model threads every stage — which is *why* BIMx legitimately touches three modules (§4); it
mirrors how BIM spans the real lifecycle, not architectural sprawl:

```
Design (Archicad/Revit authoring)
  → Tender    : mine quantities/takeoff        [Data Ingestion → Assessment]   ← BIMx-API seam (provider)
  → Build     : coordinate / reference on site [Project Intelligence + Reporting] ← BIMx viewer (BUILT)
  → Handover  : freeze as-built model          [Document Management]
  → Maintain  : FM / asset reference           [Project Intelligence + Document Management]
```

### 5.3 Engagement types for construction

Same shared Project Intelligence tables; the type feature-flags which capabilities are active. This is
the clean answer to "new house build vs tile repair":

| Type | Example | Active features |
|---|---|---|
| **build** | New house / commercial build | Full: phases, budget vs actual, cashflow, variations, RFIs, progress claims, risk register, defects, client portal, BIM coordination view |
| **maintenance** | Tile change, leak repair | Lightweight: schedule, materials, crew, invoice, (optional) BIM reference to the affected area |
| **facilities** *(future)* | Maintenance contract on a building | Recurring: asset register, planned + reactive work orders, SLA tracking |

### 5.4 Construction Domain Extension — entity spec

These are the construction-specific entities the generic PI core does **not** have. This list *is* the
Domain Extension to build. Today only variations + a risk register exist (UC3); the rest is greenfield.

| Entity | Stage | Exists today? |
|---|---|---|
| Bill of Quantities / takeoff line items | tender | ❌ (UC1 has roofing-specific measures only) |
| Vendor / supplier quotes (comparison) | tender | 🟡 UC3 `Uc3Vendor` + UC1 `vendor-prices` (not a quote-comparison flow) |
| RFIs (requests for information) | build | ❌ |
| Submittals / approvals register | build | ❌ |
| Variation orders | build | ✅ UC3 `Uc3VariationOrder` |
| Progress claims / payment schedule (SOPA) | build | ❌ |
| Retention tracking | build | ❌ |
| Defects / snagging list | build / handover | ❌ |
| Practical completion + Defects Liability Period | handover | ❌ |
| Subcontractor / trade management | build | 🟡 UC3 `Uc3Vendor` (registry only, no trade scope/comparison) |
| Asset register | maintain | ❌ |
| Work orders (reactive + planned) | maintain | ❌ |
| BIM model reference | all | ✅ UC3 `Uc3BimModel` (viewer) |

> Engagement type gates this list: a **maintenance** job exposes work orders + asset reference; a
> **build** exposes the full set. Same tables, different UI surface.

### 5.5 What this implies for sequencing

The Construction Domain Pack sits **on top of** the shared-core convergence (§6/§7) — it can't be built
cleanly while UC2/UC3 remain forked. Order: converge PI core + `engagementType` first, then add the
construction entities above as the Domain Extension, then wire the BIMx-API data source when a tender
customer justifies it. The shipped BIMx viewer and `provider` seam are already correctly placed for it.

---

## 6. Key divergences to reconcile (the real work the architecture implies)

1. **Converge UC2 + UC3 onto a shared Project Intelligence core**, then add an `engagementType`
   discriminator. They are the same module built twice. UC3's multi-tenant `Uc3*` schema is the
   better base (UC2 = the 1-tenant case).
2. **Unify the Learning Loop on UC1's outcome-driven model** (corrections + root cause + confidence),
   and extend it to UC2/UC3. Retire UC2's regex-from-chat hypothesis shortcut or reclassify it as a
   *candidate* source feeding the real loop.
3. **Close the "save this" gap** in the Conversational Assistant — make confirm/approve actually
   persist a DECISION/ACTION/RULE. Build once; both UC2 and UC3 inherit it.
4. **Merge the two `*Document` tables** into a real Document Management module (Drive refs, versioning,
   classification, doc-intelligence) and decide whether `Uc3BimModel` becomes a document record.
5. **Abstract the Assessment Engine** out of UC1-specific code so domain #2 (tendering) is a config,
   not a fork — with Data Ingestion as the clean source boundary.

---

## 7. Sequencing recommendation

**Protect what works.** The shipped BIMx v1, UC1's pricing/learning, and UC3's PM surface are stable —
don't destabilise them to chase the taxonomy.

Suggested order (each is independently shippable):
1. **"Save this" in the Conversational Assistant** — smallest change, highest leverage, both UC2/UC3 benefit, and it starts feeding the Learning Loop with real human-tagged signal.
2. **Shared Project Intelligence core + `engagementType` discriminator** — converge UC2/UC3; unlock short-job vs long-project.
3. **Document Management module** — merge `*Document`, add versioning/classification; decide BIMx record ownership.
4. **Unified Learning Loop** — generalise UC1's loop; wire UC3/UC2 corrections in.
5. **Assessment Engine abstraction + Data Ingestion boundary** — when domain #2 is real.

> The earlier "no new job type" decision (made when scoping BIMx) is **superseded** by the
> engagement-type reconception. No shipped code blocks the change; it's a planned refactor under item 2.
