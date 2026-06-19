# Airtable Migration — Schema Mapping Audit

> **Status:** Step 1 of the Postgres → Airtable migration. Produced from the Prisma schema
> (`prisma/schema.prisma`) and the *aequilibri Production Build Specification — Manila Build Brief*.
> Derived **without** Airtable credentials — field-ID reconciliation against the live bases
> (Master Template `appIf959oh38fgKYp`, Dulong Downs) is Step 2.
>
> **Decision context:** Airtable is the system of record. Postgres/Prisma was the initial pick
> and is being migrated out. See memory `airtable-system-of-record`.

## 1. Summary

The Prisma schema is already a near-1:1 reimplementation of the Airtable architecture in the
spec. The migration is therefore **mostly mechanical mapping**, with a contained set of genuine
translation problems (record IDs, linked records, no cascades, no unique constraints, money
precision) and a handful of **classification questions** that need a human decision — the same
"Domain Extension vs Customer Config" judgment the spec flags as onboarding's core judgment call.

| Tier | Prisma prefix | Models | Spec tier |
|---|---|---|---|
| Core | `plat_core_*` | 16 | 12 canonical Core tables (+4 app-internal) |
| Domain Extension | `plat_con_*` | 16 | Residential Project Delivery |
| Customer Config | `plat_cfg_*` | 5 | Customer Configuration |
| Roofing (separate) | `uc1_roofing_*` | 40 | Roofing Estimation Domain Extension |

**One base per customer** (the spec's "bases are clones"). Consequence: the `orgId` column that
scopes every platform row in Postgres becomes *implicit* — the base **is** the org. The `orgId`
foreign keys mostly disappear; tenant isolation stops being an app concern and becomes a
connection concern (which base you open). This is a simplification, not a loss.

---

## 2. Core tier → 12 canonical Core tables

| Prisma model | `@@map` | Airtable table (spec) | Match | Notes |
|---|---|---|---|---|
| `PlatOrganisation` | plat_core_organisation | ORGANISATIONS | ✅ | In a per-base model this holds the *entities/parties* within a customer, not the tenant root. Reconcile with the spec's "separates entities from individual CONTACTS". |
| `PlatContact` | plat_core_contact | CONTACTS | ✅ | |
| `PlatJob` | plat_core_job | JOBS | ✅ | Central entity — nearly every Domain table links to it. Becomes the primary linked-record hub. |
| `PlatWorkstream` | plat_core_workstream | WORKSTREAMS | ✅ | |
| `PlatActionHub` | plat_core_actionhub | ACTION_HUB | ⚠️ | **Classification conflict:** spec lists ACTION_HUB as a *Domain Extension* (project instance); schema has it in Core. Decide. |
| `PlatDecision` | plat_core_decision | DECISIONS | ✅ | |
| `PlatLearningRule` | plat_core_learningrule | LEARNING_RULES | ✅ | Spec's live schema (36 records) is canonical; reconcile field names (`Operational_Directive`, `Override_Permission`, etc.). |
| `PlatHypothesis` | plat_core_hypothesis | HYPOTHESES | ✅ | |
| `PlatCorrection` | plat_core_correction | CORRECTIONS | ✅ | `rootCause` is mandatory in both — preserve the not-null discipline (Airtable can't enforce required; do it in app). |
| `PlatExecutionLog` | plat_core_executionlog | EXECUTION_LOG | ✅ | Append-only audit trail. |
| `PlatDocument` | plat_core_document | DOCUMENTS | ✅ | Spec: "Drive URLs only, no content in Airtable." Schema has `textContent`/`aiSummary` — decide whether those move to Airtable long-text or stay app-side. |
| `PlatIntelligenceSnapshot` | plat_core_intelligencesnapshot | INTELLIGENCE_SNAPSHOT | ✅ | |

### App-internal Core models (no spec table)

| Prisma model | Purpose | Recommendation |
|---|---|---|
| `PlatPendingWrite` | Propose-before-write approval queue | Maps directly to the spec's "propose before writing" discipline. Keep as an Airtable table (PENDING_WRITES) **or** app-side queue — decide. |
| `PlatAssessment` | Module 3 Assessment Engine results | New Airtable table, or fold into a Domain table. |
| `PlatChatSession` / `PlatChatMessage` | Module 7 conversational layer | Likely stays app-side (high write volume, low audit value) — **do not** put per-message rows in Airtable (rate limits). |

---

## 3. Domain Extension tier (Residential Project Delivery)

| Prisma model | `@@map` | Spec table | Match | Notes |
|---|---|---|---|---|
| `PlatConPhase` | plat_con_phase | PROJECT_PHASES | ✅ | |
| `PlatConBudgetLine` | plat_con_budgetline | BUDGET | ✅ | Structure = Domain; figures = Customer Config (per spec). |
| `PlatConCashflow` | plat_con_cashflow | CASHFLOWS | ✅ | Forecast vs actual structure universal. |
| `PlatConProcurement` | plat_con_procurement | PROCUREMENT | ✅ | |
| `PlatConVendor` | plat_con_vendor | VENDORS | ✅ | Structure = Domain; actual vendor records = Customer Config. |
| `PlatConRoomMatrix` | plat_con_roommatrix | ROOM_MATRIX | ✅ | Commercial may relabel as Zone Matrix (`zone` field already present). |
| `PlatConVariationOrder` | plat_con_variationorder | CHANGE_LOG | ⚠️ | **Naming mismatch** — spec calls it CHANGE_LOG; schema calls it VariationOrder. Same concept (spec change tracking). Pick one name. |
| `PlatConQuote` / `PlatConQuoteLine` | plat_con_quote(line) | QUOTES | ⚠️ | Spec puts QUOTES under *Roofing* Domain Extension. This is a project-delivery quote. **Classify:** does Project Delivery get its own QUOTES, or is this Roofing-only? |
| `PlatConRisk` | plat_con_risk | *(none explicit)* | ❓ | Risk register — spec discusses risk under Module 5 but defines no table. Add RISKS to the Domain Extension. |
| `PlatConMeetingMinutes` | plat_con_meetingminutes | *(none)* | ❓ | Relates to Module 2 ingestion. New table or Domain? |
| `PlatConWeeklyReport` | plat_con_weeklyreport | *(none)* | ❓ | Module 8 reporting output. Decide live-view vs stored. |
| `PlatConBimModel` | plat_con_bimmodel | *(none)* | ❓ | No spec table. Domain Extension add. |
| `PlatConPortalToken` | plat_con_portaltoken | *(none)* | ❓ | Access provisioning (Module 1 Deliverable 5). Likely stays app-side (security tokens, not business data). |
| `PlatConPhaseEvidence` | plat_con_phaseevidence | *(none)* | ❓ | Module 3 evidence linkage. Join table — model as linked records between PROJECT_PHASES and DOCUMENTS. |
| `PlatConAccountingConnection` | plat_con_accountingconnection | *(none)* | 🔒 | Holds an OAuth `accessToken`. **Do NOT store in Airtable** — keep secrets app-side/encrypted. |

### Missing from schema, present in spec

| Spec table | Status |
|---|---|
| `PROJECT_PLAN` | **No Prisma model.** Spec classifies it as Domain Extension ("universal project lifecycle"). Currently likely derived from PHASES in the app. Decide: real table or derived view. |
| `REF_CATEGORIES` / `REF_ZONES` / `REF_BUDGET` | Handled generically by `PlatCfgReference` (see Config tier). |

---

## 4. Customer Config tier

| Prisma model | `@@map` | Spec | Notes |
|---|---|---|---|
| `PlatCfgTeamMember` | plat_cfg_teammember | TEAM / roles | Ties to Module 1's owner/builder/architect/broker access pattern. |
| `PlatCfgRegion` | plat_cfg_region | REF_ZONES / regions | |
| `PlatCfgReference` | plat_cfg_reference | REF_CATEGORIES / REF_BUDGET | Generic key/value reference rows — covers the spec's REF_* lists. |
| `PlatCfgNomenclature` | plat_cfg_nomenclature | nomenclature overrides | Customer-term → standard-term mapping. |
| `PlatCfgSetting` | plat_cfg_setting | settings | |

---

## 5. Roofing Estimation (UC1) — separate domain, deferred

The 40 `uc1_roofing_*` models are the **Roofing Estimation Domain Extension** (RATE_CARD, PRICING,
QUOTES, PROPERTIES, MATERIALS_*, plus the roofing-specific learning loop). The spec explicitly
**defers** Roofing Domain Extension completion ("separate workstream, only urgent if/when PCR or
the commercial builder POC require it"). **Recommendation: out of scope for this migration phase.**
Migrate Project Delivery (Plat*) first; tackle Roofing as its own base later.

---

## 6. Field-type translation rules (Prisma → Airtable)

Reusable ruleset for the per-table field mapping in Step 2.

| Prisma type | Airtable field | Caveat |
|---|---|---|
| `Int @id @default(autoincrement())` | *(none — Airtable uses `recXX…` record IDs)* | **Biggest mechanical change.** No autoincrement. See §7.1. |
| `Int` FK (e.g. `contactId`) | **Linked record** | Stores an array of record IDs, not a scalar int. App code expecting a single FK must adapt. |
| `Decimal @db.Decimal(p,s)` | Number (precision set) | Airtable stores float. **Never compute money in Airtable formulas** — do it in app with `Decimal` (`src/lib/platform/money.ts`). |
| `Float` | Number | |
| `DateTime` | Date (with time) | |
| `DateTime @db.Date` | Date (no time) | |
| `Boolean` | Checkbox | |
| `String` (status/priority enums) | Single Select | Enforces allowed values, but options must be managed per base (drift risk). Alternative: plain text + app validation. |
| `String` (JSON blobs: `payload`, `meta`, `finishes`, `evidenceSuggestion`, `settings`…) | Long text | Holds JSON; **not queryable** in Airtable. Acceptable for opaque payloads. |
| `String` (free text: `notes`, `description`) | Long text | |
| `String` (short: names, codes) | Single line text | |

---

## 7. Hard problems / flags

### 7.1 Record IDs & foreign keys
Postgres uses integer autoincrement PKs and integer FKs everywhere. Airtable uses opaque string
record IDs and **linked-record** fields. Two-part strategy:
- During migration, carry a `legacy_pg_id` Number field on every table so existing int references
  can be resolved, then converted to linked records.
- After cutover, all relations are linked records; the app's data layer returns resolved records,
  not raw int FKs.

### 7.2 No cascade deletes
`onDelete: Cascade` (e.g. delete a JOB → delete its phases, budget, cashflows) **has no Airtable
equivalent.** Deleting a parent orphans children. The app's delete paths must explicitly cascade.

### 7.3 No unique constraints
`@@unique([orgId, code])`, `ruleCode`, `refNumber`, portal `token`, etc. are **not enforceable**
in Airtable. Move uniqueness checks into the app's write path (and tolerate races — no transactions).

### 7.4 No transactions
Multi-record writes (a quote + its lines, a job + its phases) can half-complete. Rely on the
existing `PlatPendingWrite` propose-then-confirm pattern with idempotent retries.

### 7.5 Money precision
All `Decimal` money fields become Airtable Numbers (float). Keep authoritative math in app code;
treat Airtable values as display copies.

### 7.6 Schema drift across cloned bases *(the real ongoing tax)*
Per-customer bases are clones with no shared schema source. A Core field change must be
hand-migrated into every base, and you need version tracking to know which base runs which
version. This is the spec's Phase-5 "operations infrastructure" concern — plan it deliberately,
don't let it emerge.

---

## 8. Classification questions for the Manila session

1. **ACTION_HUB** — Core (schema) or Domain Extension (spec §"Residential Project Delivery")?
2. **CHANGE_LOG vs VariationOrder** — settle one canonical name.
3. **QUOTES** — does Project Delivery have its own QUOTES table, or is QUOTES Roofing-only?
4. **PROJECT_PLAN** — a real table, or a derived view over PROJECT_PHASES?
5. **App-internal tables** (PendingWrite, ChatSession/Message, PortalToken, AccountingConnection) —
   which live in Airtable vs stay app-side? Recommendation: chat messages and secrets stay app-side.
6. **DOCUMENTS content** — does `textContent`/`aiSummary` go into Airtable long-text, or stay app-side
   (spec says "Drive URLs only")?

---

## 9. Recommended next step — vertical spike

Prove the pattern end-to-end on one slice before touching all ~32 platform tables:

1. Reconcile **one** table's field IDs against the live Master Template / Dulong Downs base
   (suggest `PlatDecision` → DECISIONS — simple, no money, few relations). *(needs a read-only Airtable PAT)*
2. Build the thin Airtable data-access layer for that one table (read + write), behind a flag.
3. Demonstrate the app reading and writing real Airtable data for DECISIONS.

Then fan out across the remaining Core tables, then Domain, then Config — JOBS early (it's the
linked-record hub everything else points at).

---

## 10. Step 2 findings — live schema reconciliation (`AEQUILIBRI_DIDI_DEMO`)

> Verified against base `appharWaojouHgMeW` (AEQUILIBRI_DIDI_DEMO) via the Airtable meta API.
> **Caveats:** the supplied PAT sees *only* this one base — the Master Template
> (`appIf959oh38fgKYp`) and the live operational Dulong Downs base are **not** reachable with it,
> and the token is **write-capable (`create`), not read-only**. Rotate + re-scope before production.

### Base state
- **18 tables**: all 12 Core present + partial Roofing extension (RATE_CARD, PRICING, TEAM, REGIONS)
  + REFERENCE_DATA + NOMENCLATURE_OVERRIDES.
- **No Residential Project Delivery extension** (no BUDGET/CASHFLOWS/PHASES/PROCUREMENT/VENDORS/
  ROOM_MATRIX) — confirms the spec's finding. A migration target base must have these created first.
- This base is **template/demo-shaped**, not the live operational Dulong Downs base.

### Critical finding: table taxonomy matches, field schemas diverge
The 12 Core table **names** match the spec 1:1, but the **fields** do not match the Prisma models.
The Airtable schema is **richer and canonical** (per spec: live schema wins, template is corrected
to match — not the reverse). Migration maps the app onto the Airtable schema, not vice-versa.

### `DECISIONS` field map (table `tblsHgiXa0Efo3IWD`)

| App (`PlatDecision`) | Airtable field | Field ID | Type | Note |
|---|---|---|---|---|
| `description` | Decision_Description | fldz30kBm8F3cyeG6 | multilineText | |
| `rationale` | Rationale | fldXH5tHvUC8RpuCi | multilineText | |
| `alternatives` | Alternatives_Rejected | fld6bddEWs7EQHqGp | multilineText | |
| `status` | Status | fldvggciokLYyx5FQ | singleSelect | values differ: proposed/confirmed → **Pending/Made/Reversed** |
| `madeBy` | Owner | fldBnBOU8MG66EW2z | link→TEAM | **string → linked record** |
| `decidedAt` | Decision_Date | fldtrM1uTnlpf88Si | dateTime | |
| `category` | Decision_Type | fldFyep7Zdj1TyGB5 | singleSelect | approx (Strategic/Technical/Commercial/Operational) |
| `jobId` | *(none direct)* | — | — | DECISIONS links to **WORKSTREAMS + ACTION_HUB**, not JOBS |
| *(app must supply)* | Decision_Name | fldIDXimKr7PBC41e | singleLineText | **primary field** — required |
| *(no app field)* | Reversibility | fldm5JcGXHe6nmn0R | singleSelect | richer-than-app |
| *(no app field)* | Confidence | fldIWCQyuCuh1SKW0 | number | richer-than-app |
| *(no app field)* | Context | fldoDHCBl7JvmLZoT | multilineText | richer-than-app |
| *(no app field)* | Decision_Made | fldJvJU0acmJOI5GP | multilineText | richer-than-app |
| *(no app field)* | Notes | fld9Bd0Q9I4aHdhcY | multilineText | richer-than-app |
| *(no app field)* | _TIER | fldACe62pelNf1cjp | singleLineText | Airtable tier tag (Core/Domain/Config) |
| *(no app field)* | Domain | fldQOD6FVY3WY2lCV | singleLineText | domain tag |
| *(no app field)* | ACTION_HUB | fldcbxS44JV1C8ntZ | link→ACTION_HUB | |

**Implication:** auto-generating field maps from the Prisma schema is insufficient — each table
needs reconciliation against the live Airtable schema, and the app model is a *subset* that must
be widened to use the canonical fields (linked records, select options, the richer fields).
